import type { Action, CardId, GameState, PlotPulse, PlotType, Player, CardInstance } from '../types';
import { pluck } from '../cardInstance';
import { CARD_INFO } from '../cards';
import { playPayment } from '../rules';
import { genOf } from '../utils/russianText';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { beginCoronationIfNeeded } from './coronation';
import { burnCharter, loseCrowns } from './crownLoss';
import { vetoReset } from './vetoChain';
import { isCoronationCandidate, type Coronation } from './coronation';

/** Заговор разряжается только полностью заряженным. */
export const CONSPIRACY_FULL_CHARGE = 4;

/** Сколько золота сбрасывает разряженный Заговор. */
export const CONSPIRACY_GOLD_HIT = 3;

/** Сколько монет приносит «Сеть информаторов», прежде чем истощится. */
export const INFORMANT_PAYOUTS = 3;

/** Интриги, у которых есть накопитель, и его потолок. */
const PLOT_METER: Partial<Record<PlotType, number>> = {
  'Тайный заговор': CONSPIRACY_FULL_CHARGE,
  'Сеть информаторов': INFORMANT_PAYOUTS
};

/** С чего начинается накопитель интриги — или `undefined`, если его нет. */
export function initialCharges(plotType: PlotType): number | undefined {
  return PLOT_METER[plotType] === undefined ? undefined : 0;
}

/**
 * Цифра на счётчике карты.
 *
 * В движке у обеих интриг накопитель растёт от нуля. На лице «Сети» нужна
 * обратная шкала: сколько выплат ещё осталось, а не сколько уже принесли.
 */
export function plotMeterShown(plotType: PlotType, charges: number): number | undefined {
  const cap = PLOT_METER[plotType];
  if (cap === undefined) return undefined;
  if (plotType === 'Сеть информаторов') return Math.max(0, cap - charges);
  return charges;
}

/**
 * Интрига сработала: карта уходит со стола ударом, а не молча.
 *
 * Возвращает заплатку, а не пишет в состояние сам, — ровно как `vetoReset`:
 * срабатывание всегда происходит вместе с чем-то ещё (наградой, ударом,
 * сбросом карты), и разносить одно событие по двум `set` значит дать
 * подписчикам увидеть его наполовину. Подробности — у `GameState.plotPulses`.
 */
export function plotSpent(cardId: CardId): { plotPulses: PlotPulse[] } {
  return { plotPulses: [{ cardId, kind: 'spent' }] };
}

/**
 * Интригу сорвали: кража, шантаж, обыск, блеф при страже.
 *
 * Не путать со `spent`: там карта сделала своё, здесь её сняли. `prior` —
 * уже висящие пульсы того же `set`: удар Заговора и срыв приёма у цели
 * случаются подряд, и второй не должен затирать первый.
 */
export function plotDisrupted(
  cardId: CardId,
  prior: PlotPulse[] = []
): { plotPulses: PlotPulse[] } {
  return {
    plotPulses: [...prior.filter(p => p.cardId !== cardId), { cardId, kind: 'disrupt' }]
  };
}

/**
 * Интриги что-то получили: Заговор — заряд, Сеть — монету.
 *
 * Списком, потому что одна проверка кормит все Заговоры на столе разом, и
 * кивнуть надо каждому. Сеть кивает и на последней монете: карта после этого
 * уходит обычным сбросом, без удара сработки.
 */
export function plotsCharged(cardIds: CardId[]): { plotPulses: PlotPulse[] } {
  return { plotPulses: cardIds.map(cardId => ({ cardId, kind: 'charge' as const })) };
}

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function disruptPlayerPlotsOnLoss(
  get: StateGetter,
  set: StateSetter,
  victimId: string,
  reason: string
): void {
  const { players } = get();
  const vIdx = players.findIndex(p => p.id === victimId);
  if (vIdx === -1) return;

  const victim = players[vIdx];
  if (victim.activePlot && victim.activePlot.type === 'Королевский приём') {
    const burned: CardInstance = { id: victim.activePlot.cardId, card: 'Королевский приём' };
    const newPlayers = [...players];
    newPlayers[vIdx] = { ...victim, activePlot: null };
    set(state => ({
      players: newPlayers,
      discardPile: [...state.discardPile, burned],
      ...plotDisrupted(burned.id, state.plotPulses),
      history: [`💥 «Королевский приём» ${genOf(victim)} сорван из-за ${reason}! Интрига сгорела.`, ...state.history].slice(0, 50)
    }));
    triggerResourceFloat(set, victim.id, '💥 Интрига сорвана', false);
  }
}

export function playPlotAction(
  get: StateGetter,
  set: StateSetter,
  plotType: PlotType,
  cardId: CardId,
  targetPlayerId?: string
): void {
  timerManager.clearAll();
  const { players, activePlayerId, rules } = get();
  const actor = players.find(p => p.id === activePlayerId);
  if (!actor) return;
  const payment = playPayment(rules, actor);
  if (!payment) return;

  const { taken: playedCard, rest: newHand } = pluck(actor.hand, cardId);
  if (playedCard?.card !== plotType) return;

  /*
   * Старая интрига уходит в сброс ЗДЕСЬ — в тот же миг, когда новая ложится
   * на стол, а не после того, как новая переживёт вето.
   *
   * Раньше старую снимал `landPlot`, то есть уже после окна вето. Всё окно
   * две интриги стояли в одном слоте друг поверх друга — новая уезжала под
   * старую по z, и читалось это как сбой раскладки, а не как ход. Теперь порядок
   * один и без исключений: старая в сброс → новая на стол → круг вето. Заветированная
   * новая уйдёт туда же, и старая не вернётся: место освобождено самой выкладкой,
   * а вето отменяет только то, что на него положили.
   */
  const displaced = actor.activePlot;

  const newPlayers = players.map(p => p.id === actor.id ? {
    ...p,
    actionTokens: p.actionTokens - payment.tokens,
    gold: p.gold - payment.gold,
    hand: newHand,
    activePlot: null
  } : p);

  if (payment.gold > 0) triggerResourceFloat(set, actor.id, `-${payment.gold} 🪙`, false);
  if (payment.tokens > 0) triggerResourceFloat(set, actor.id, '-1 ⚡', false);

  const target = targetPlayerId ? players.find(p => p.id === targetPlayerId) : null;
  const targetText = target ? ` (цель: ${target.name})` : '';

  const action: Action = {
    id: Math.random().toString(36).substring(7),
    type: 'plot',
    name: plotType,
    plotType,
    actorId: actor.id,
    targetId: targetPlayerId,
    stakedCardId: playedCard.id,
    costGold: payment.gold,
    costTokens: payment.tokens,
    description: CARD_INFO[plotType]?.shortDescription ?? ''
  };

  set(state => ({
    players: newPlayers,
    discardPile: displaced
      ? [...state.discardPile, { id: displaced.cardId, card: displaced.type }]
      : state.discardPile,
    pendingAction: action,
    hasPlayedPlotThisTurn: true,
    ...vetoReset(),
    overlayInstant: null,
    isPendingActionAfterTruthChallenge: false,
    turnSubPhase: 'CARD_PLAY_PHASE',
    history: [
      `🎴 ${actor.name} разыгрывает Интригу «${plotType}»${targetText} (${payment.tokens > 0 ? 'потрачен 1 ⚡' : `потрачено ${payment.gold} 🪙`}).`,
      ...(displaced
        ? [`🗑️ Прежняя интрига «${displaced.type}» ${genOf(actor)} уходит в сброс: слот освобождён под новую.`]
        : []),
      ...state.history
    ].slice(0, 50)
  }));

  get()._triggerVetoWindowOrResolveEffect(action, false);
}

/**
 * Интрига устояла перед вето — садится в свой слот.
 *
 * Слот к этому моменту уже пуст: прежнюю интригу сбросила сама выкладка
 * (см. `playPlotAction`), и сюда дело доходит только тогда, когда двор новую не
 * отменил.
 */
export function landPlot(get: StateGetter, set: StateSetter, action: Action): void {
  const { players } = get();
  const actor = players.find(p => p.id === action.actorId);
  const plotType = action.plotType;
  if (!actor || !plotType) {
    get()._checkEndgameAndAdvanceTurn();
    return;
  }

  const newPlotData = {
    id: action.id,
    cardId: action.stakedCardId ?? action.id,
    type: plotType,
    targetPlayerId: action.targetId,
    charges: initialCharges(plotType)
  };

  set(state => ({
    players: state.players.map(p => p.id === actor.id ? { ...p, activePlot: newPlotData } : p)
  }));

  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, ACTION_HOLD_MS);
}

/**
 * Заряжает активные «Тайные заговоры» от чужих проверок («НЕ ВЕРЮ!») и от
 * любой объявленной дуэли.
 *
 * `exceptId` — тот, чей Заговор от этого события не заряжается. Смысл в нём
 * только один: **своей проверкой Заговор не кормят.** Иначе держатель, у
 * которого и так есть жетоны на проверки, разгонял бы себе заряды сам, ни с
 * кем не считаясь, — а Заговор задуман как счётчик чужой возни при дворе.
 * Ровно та же оговорка стоит у «Сети информаторов»: она тоже платит за чужие
 * проверки, а не за свои.
 *
 * У дуэли исключений нет: её объявляют двое, и считается сам факт вызова.
 */
export function chargeActiveConspiracies(
  get: StateGetter,
  set: StateSetter,
  reason: string,
  exceptId?: string
): void {
  const charging = (p: Player) =>
    p.id !== exceptId && p.activePlot?.type === 'Тайный заговор' && (p.activePlot.charges ?? 0) < 4;

  const { players } = get();
  const conspiracyHolders = players.filter(charging);
  if (conspiracyHolders.length === 0) return;

  const newPlayers = players.map(p => {
    if (charging(p) && p.activePlot) {
      const nextCharges = Math.min(4, (p.activePlot.charges ?? 0) + 1);
      return {
        ...p,
        activePlot: {
          ...p.activePlot,
          charges: nextCharges
        }
      };
    }
    return p;
  });

  conspiracyHolders.forEach(p => {
    const nextCharges = Math.min(4, (p.activePlot?.charges ?? 0) + 1);
    triggerResourceFloat(set, p.id, `⚔️ Заговор +1 (${nextCharges}/4)`, true);
  });

  const logs = conspiracyHolders.map(p => {
    const nextCharges = Math.min(4, (p.activePlot?.charges ?? 0) + 1);
    return `⚔️ «Тайный заговор» у ${p.name} набирает силу (${nextCharges}/4) из-за: ${reason}!`;
  });

  set(state => ({
    players: newPlayers,
    ...plotsCharged(conspiracyHolders.map(p => p.activePlot!.cardId)),
    history: [...logs, ...state.history].slice(0, 50)
  }));
}

/**
 * Открывает диалог активации «Тайного заговора».
 */
export function openConspiracyDialog(
  get: StateGetter,
  set: StateSetter,
  isImmediateReaction = false
): void {
  // This is dispatched as an active-player-only action (the server already
  // confirms the sender is `activePlayerId` before this ever runs), so the
  // caller is always whoever's turn it is — not "the human" (that assumed a
  // single non-bot player and opened the wrong player's conspiracy once a
  // second real player was in the seat).
  const { activePlayerId, players } = get();
  const actor = players.find(p => p.id === activePlayerId);
  if (!actor || actor.activePlot?.type !== 'Тайный заговор') return;
  const charges = actor.activePlot.charges ?? 0;
  /* Заговор разряжается только полностью заряженным: частичные удары
     (1–3 заряда) убраны из правил. */
  if (charges < CONSPIRACY_FULL_CHARGE) return;

  set({
    conspiracyPrompt: {
      playerId: actor.id,
      charges,
      isImmediateReaction
    }
  });
}

/**
 * Закрывает диалог активации «Тайного заговора».
 */
export function closeConspiracyDialog(
  set: StateSetter
): void {
  set({ conspiracyPrompt: null });
}

/**
 * Активирует «Тайный заговор» против выбранной цели с выбранным эффектом.
 */
export function activateConspiracy(
  get: StateGetter,
  set: StateSetter,
  playerId: string,
  targetPlayerId: string,
  effect: 'gold' | 'crown',
  _isFreeReaction = false
): void {
  const { players } = get();
  const player = players.find(p => p.id === playerId);
  const target = players.find(p => p.id === targetPlayerId);
  if (!player || !target || player.activePlot?.type !== 'Тайный заговор') return;

  const charges = player.activePlot.charges ?? 0;
  if (charges < CONSPIRACY_FULL_CHARGE) return;
  if (player.actionTokens < 1) return;

  const tokenCost = 1;
  /* Полностью заряженный Заговор вето не принимает. Само вето при этом
     никуда не делось: его играют в момент выкладки карты на стол. */
  const cannotBeVetoed = true;

  if (tokenCost > 0) {
    triggerResourceFloat(set, player.id, '-1 ⚡', false);
  }

  const action: Action = {
    id: Math.random().toString(36).substring(7),
    type: 'plot',
    name: 'Тайный заговор',
    plotType: 'Тайный заговор',
    actorId: player.id,
    targetId: target.id,
    costGold: 0,
    costTokens: tokenCost,
    stakedCardId: player.activePlot.cardId,
    conspiracyEffect: effect,
    cannotBeVetoed,
    description: CARD_INFO['Тайный заговор']?.shortDescription ?? ''
  };

  set(state => ({
    players: tokenCost > 0
      ? state.players.map(p => p.id === player.id ? { ...p, actionTokens: p.actionTokens - tokenCost } : p)
      : state.players,
    pendingAction: action,
    conspiracyPrompt: null,
    ...vetoReset(),
    overlayInstant: null,
    history: [
      `⚔️ ${player.name} свершает «Тайный заговор» (${charges}/${CONSPIRACY_FULL_CHARGE} зар.) [🛡️ Нельзя отменить Вето]!`,
      ...state.history
    ].slice(0, 50)
  }));

  if (cannotBeVetoed) {
    applyConspiracyEffect(get, set, action);
    return;
  }
  get()._triggerVetoWindowOrResolveEffect(action, false);
}

export function applyConspiracyEffect(get: StateGetter, set: StateSetter, action: Action): void {
  const { players, discardPile } = get();
  const player = players.find(p => p.id === action.actorId);
  const target = players.find(p => p.id === action.targetId);
  if (!player || !target || player.activePlot?.type !== 'Тайный заговор') {
    get()._checkEndgameAndAdvanceTurn();
    return;
  }

  const effect = action.conspiracyEffect ?? 'gold';
  /* Разряженный Заговор отыгран, а не сброшен: карта уходит ударом.
     Идентификатор снимаем здесь, пока слот ещё не опустел. */
  const spentCardId = player.activePlot.cardId;
  const newDiscard: CardInstance[] = [
    ...discardPile,
    { id: spentCardId, card: 'Тайный заговор' }
  ];

  if (effect === 'gold') {
    const goldLoss = Math.min(CONSPIRACY_GOLD_HIT, target.gold);
    const newPlayers = players.map(p => {
      if (p.id === target.id) return { ...p, gold: p.gold - goldLoss };
      if (p.id === player.id) return { ...p, activePlot: null };
      return p;
    });
    set(state => ({
      players: newPlayers,
      discardPile: newDiscard,
      conspiracyPrompt: null,
      ...plotSpent(spentCardId),
      history: [
        `⚔️ «Тайный заговор»: ${target.name} теряет ${goldLoss} 🪙 в казну!`,
        ...state.history
      ].slice(0, 50)
    }));
    if (goldLoss > 0) {
      get()._disruptPlayerPlotsOnLoss(target.id, 'удара Заговора');
      triggerResourceFloat(set, target.id, `-${goldLoss} 🪙 Заговор`, false);
    }
    triggerResourceFloat(set, player.id, `⚔️ Сброс ${goldLoss} 🪙!`, true);
  } else {
    /* Карта Заговора уходит в сброс ДО вызова `loseCrowns`: тот читает
       игроков из стора, и `set` после него затёр бы его правку своим
       снимком. */
    const newPlayers = players.map(p =>
      p.id === player.id ? { ...p, activePlot: null } : p
    );
    set(state => ({
      players: newPlayers,
      discardPile: newDiscard,
      conspiracyPrompt: null,
      ...plotSpent(spentCardId),
      history: state.history
    }));

    const result = loseCrowns(get, set, target.id, 1, 'удара Заговора', 'Заговор!');
    if (result.kind === 'lost') {
      set(state => ({
        history: [
          `💥 «Тайный заговор»: ${target.name} лишается 1 👑 короны!`,
          ...state.history
        ].slice(0, 50)
      }));
      triggerResourceFloat(set, player.id, `⚔️ Лишение 1 👑 у ${target.name}!`, true);
    } else if (result.kind === 'blocked_by_charter') {
      /* Корону грамота удержала — но сама её не пережила. Заговор бьёт по
         защите так же, как слух: корона цела, грамота в сбросе. */
      burnCharter(get, set, target.id, 'удара Заговора');
      triggerResourceFloat(set, player.id, `⚔️ Грамота ${target.name} сорвана!`, true);
    }
  }

  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, ACTION_HOLD_MS);
}

export function applyMorningPlotReward(get: StateGetter, set: StateSetter, action: Action): void {
  const { players, discardPile, coronations } = get();
  const idx = players.findIndex(p => p.id === action.actorId);
  const player = idx >= 0 ? players[idx] : null;
  const plotType = player?.activePlot?.type;
  if (!player || plotType !== 'Королевский приём') {
    set({
      pendingAction: null,
      turnPhase: 'IDLE',
      turnSubPhase: 'NORMAL_ACTION_PHASE'
    });
    return;
  }

  const result = resolveMorningPlots(
    [...players],
    idx,
    discardPile,
    coronations,
    set,
    get().rules.crownsToWin
  );
  set({
    players: result.updatedPlayers,
    discardPile: result.curDiscard,
    ...(result.spentPlotId ? plotSpent(result.spentPlotId) : { plotPulses: [] }),
    pendingAction: null,
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE'
  });
  if (result.coronationTriggeredByReception) {
    beginCoronationIfNeeded(get, set, result.nextPlayerUpdated.id);
  }
}

export function discardMorningPlot(get: StateGetter, set: StateSetter, actorId: string): void {
  const { players, discardPile } = get();
  const player = players.find(p => p.id === actorId);
  const plot = player?.activePlot;
  const plotType = plot?.type;
  if (!player || !plot || !plotType) {
    set({ pendingAction: null, turnPhase: 'IDLE', turnSubPhase: 'NORMAL_ACTION_PHASE' });
    return;
  }
  set(state => ({
    players: state.players.map(p => p.id === actorId ? { ...p, activePlot: null } : p),
    discardPile: [...discardPile, { id: plot.cardId, card: plotType }],
    pendingAction: null,
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE',
    history: [`🛡️ Утренний эффект «${plotType}» ${genOf(player)} отменён Вето.`, ...state.history].slice(0, 50)
  }));
}

export function resolveMorningPlots(
  updatedPlayers: Player[],
  nextIndex: number,
  curDiscard: CardInstance[],
  coronations: Coronation[],
  set: StateSetter,
  crownsToWin: number
): {
  updatedPlayers: Player[];
  curDiscard: CardInstance[];
  coronationTriggeredByReception: boolean;
  nextPlayerUpdated: Player;
  /** Карта состоявшегося «Приёма» — она уходит ударом, а не молча. */
  spentPlotId: CardId | null;
} {
  let nextPlayerUpdated = updatedPlayers[nextIndex];
  let coronationTriggeredByReception = false;
  let newDiscard = [...curDiscard];
  let spentPlotId: CardId | null = null;

  if (nextPlayerUpdated.activePlot && nextPlayerUpdated.activePlot.type === 'Королевский приём') {
    const spentPlot: CardInstance = { id: nextPlayerUpdated.activePlot.cardId, card: 'Королевский приём' };
    spentPlotId = spentPlot.id;
    const newFavor = Math.min(crownsToWin, nextPlayerUpdated.favor + 1);
    nextPlayerUpdated = {
      ...nextPlayerUpdated,
      favor: newFavor,
      activePlot: null
    };
    updatedPlayers[nextIndex] = nextPlayerUpdated;
    triggerResourceFloat(set, nextPlayerUpdated.id, '+1 👑 Бал удался!', true);

    newDiscard = [...newDiscard, spentPlot];
    set(state => ({
      history: [`👑 Королевский приём ${genOf(nextPlayerUpdated)} успешно состоялся! Получено +1 👑!`, ...state.history].slice(0, 50)
    }));

    /* Круг заводится, если по этому игроку его ещё нет. Чужие идущие круги
       тут ни при чём: раньше проверялось «есть ли круг вообще», и приём,
       выведший на порог второго претендента, круга ему не давал. */
    if (newFavor >= crownsToWin && !isCoronationCandidate(coronations, nextPlayerUpdated.id)) {
      coronationTriggeredByReception = true;
    }
  }

  return {
    updatedPlayers,
    curDiscard: newDiscard,
    coronationTriggeredByReception,
    nextPlayerUpdated,
    spentPlotId
  };
}
