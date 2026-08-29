import type { CardId, CardInstance, GameState, DuelOutcome, DuelResultType } from '../types';
import { byId, pluck } from '../cardInstance';
import { isRole } from '../cards';
import { botMemory } from '../bot/botMemory';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { chargeActiveConspiracies } from './plotResolver';
import { discardProtectiveIntrigueOnBluff } from './crownLoss';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function targetDeclareDuel(
  get: StateGetter,
  set: StateSetter,
  targetId: string,
  cardId: CardId
): void {
  timerManager.clearAll();
  const { pendingAction, turnPhase, players, rules } = get();
  if (turnPhase !== 'TARGET_REACTION_WINDOW' || !pendingAction || pendingAction.targetId !== targetId) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  const target = players.find(p => p.id === targetId);
  if (!actor || !target) return;

  /* Стоит ли защита на дуэли жетона хода — настройка партии. С выключенным
     тумблером щит бесплатен и доступен даже при 0 ⚡: это ровно тот случай,
     когда лидера бьют по кругу, а отбиваться ему нечем. */
  const tokenCost = rules.duelCostsToken ? 1 : 0;
  if (target.actionTokens < tokenCost) return;

  const blockingRole = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
  const staked = byId(target.hand, cardId) ?? target.hand[0];
  if (!staked) return;

  if (tokenCost > 0) {
    triggerResourceFloat(set, target.id, '-1 ⚡', false);
  }

  set(state => ({
    players: state.players.map(p =>
      p.id === target.id ? { ...p, actionTokens: p.actionTokens - tokenCost } : p
    ),
    turnPhase: 'DUEL_CLASH',
    pendingDuelDefenderCardId: staked.id,
    pendingDuelDefenderRoleClaim: blockingRole,
    timerSeconds: 0,
    timerMaxSeconds: 0,
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [target.id]: `«ДУЭЛЬ! Мой щит — ${blockingRole}!»`
    },
    history: [`🤺 ${target.name} вызывает ${actor.name} на ДУЭЛЬ, заявляя «${blockingRole}»${tokenCost > 0 ? ' (потрачен 1 ⚡)' : ' (бесплатно)'}!`, ...state.history].slice(0, 50)
  }));

  // Charge active conspiracies on duel declaration
  chargeActiveConspiracies(get, set, `вызов на дуэль от ${target.name}`);

  /* Согласия атакующего не спрашивают: выставленный щит — это уже дуэль.
     Пауза здесь не решение, а такт: за неё карты успевают сойтись в середине
     стола, и удар читается как удар, а не как мгновенная смена картинки. */
  timerManager.scheduleDelay(() => {
    resolveDuelClash(get, set);
  }, ACTION_HOLD_MS);
}

/**
 * Розыгрыш дуэли: обе ставки вскрываются разом.
 *
 * Отдельного решения атакующего здесь нет и быть не может — оно было
 * двухфазностью на ровном месте. Щит выставлен, значит спор состоялся, и
 * функция вызывается сама тактом позже объявления.
 */
export function resolveDuelClash(get: StateGetter, set: StateSetter): void {
  timerManager.clearAll();
  const { pendingAction, pendingDuelDefenderCardId, pendingDuelDefenderRoleClaim, turnPhase, players } = get();
  if (turnPhase !== 'DUEL_CLASH' || !pendingAction || !pendingDuelDefenderRoleClaim) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  const defender = players.find(p => p.id === pendingAction.targetId);
  if (!actor || !defender) return;

  const actorStaked = byId(actor.hand, pendingAction.stakedCardId) ?? actor.hand[0];
  const actorRevealedRole = actorStaked?.card ?? 'Наследник';
  const actorWasTruth = actorRevealedRole === pendingAction.roleClaim;

  const defenderStaked = byId(defender.hand, pendingDuelDefenderCardId ?? undefined) ?? defender.hand[0];
  const defenderRevealedRole = defenderStaked?.card ?? 'Наследник';
  const defenderWasTruth = defenderRevealedRole === pendingDuelDefenderRoleClaim;

  const { rest: actorHand } = actorStaked
    ? pluck(actor.hand, actorStaked.id)
    : { rest: [...actor.hand] };
  const { rest: defenderHand } = defenderStaked
    ? pluck(defender.hand, defenderStaked.id)
    : { rest: [...defender.hand] };

  // RULES.md §6, правило 2: любая карта, вскрытая на столе (при проверке или
  // дуэли), уходит в сброс. Both stakes leave their hands right here, so the
  // very same instances have to land in the discard — otherwise the cards are
  // destroyed and no longer have a zone to be drawn in.
  const revealedInstances = [actorStaked, defenderStaked].filter(
    (c): c is CardInstance => !!c
  );

  // Публично вскрытая карта больше не в руке — сбрасываем о ней память ботов,
  // ровно как это делает doubtResolver при проверке «НЕ ВЕРЮ!».
  if (isRole(actorRevealedRole)) botMemory.recordRevealedCard(actor.id, actorRevealedRole);
  if (isRole(defenderRevealedRole)) botMemory.recordRevealedCard(defender.id, defenderRevealedRole);

  const isVaBanqueActive = get().isVaBanqueActive;
  let resultType: DuelResultType = 'clash_blocked';
  let sealsWinnerId: string | undefined = undefined;
  let bothLostCoin = false;
  let message = '';

  // Печати НЕ начисляются здесь: `addSealsToPlayer` читает `get().players` и
  // пишет обратно весь массив игроков (плюс конвертирует 2 ⚜️ в 1 👑 и может
  // начать круг коронации). Если выдать награду до `set` ниже, этот `set`
  // затрёт её своим снимком, а если выдать по устаревшему снимку — потеряются
  // изменения рук. Поэтому исходы дуэли только КОПЯТ награды, а начисляются
  // они после того, как состояние уже знает об ушедших в сброс картах.
  const sealAwards: { playerId: string; count: number }[] = [];

  if (actorWasTruth && defenderWasTruth) {
    resultType = 'clash_blocked';
    sealAwards.push({ playerId: actor.id, count: 1 });
    sealAwards.push({ playerId: defender.id, count: 1 });
    message = `🛡️ ЧЕСТНАЯ ДУЭЛЬ! Оба игрока сказали правду (${actor.name}: «${actorRevealedRole}», ${defender.name}: «${defenderRevealedRole}»). Атака заблокирована, КАЖДЫЙ получает по +1 ⚜️!${isVaBanqueActive ? ' (Ва-банк нейтрализован щитом)' : ''}`;
  } else if (actorWasTruth && !defenderWasTruth) {
    resultType = 'attacker_breakthrough';
    if (!isVaBanqueActive) {
      sealsWinnerId = actor.id;
      sealAwards.push({ playerId: actor.id, count: 1 });
    }
    message = `💥 ПРОБИТИЕ ЗАЩИТЫ${isVaBanqueActive ? ' ПОД ВА-БАНКОМ' : ''}! ${actor.name} сказал правду («${actorRevealedRole}»), а ${defender.name} блефовал(а) («${defenderRevealedRole}»). ${isVaBanqueActive ? 'Защитник проиграл дуэль: атака проходит с удвоением (4 🪙 / 2 👑, печати отменены)!' : `${actor.name} получает +1 ⚜️, атака проходит!`}`;
  } else if (!actorWasTruth && defenderWasTruth) {
    resultType = 'defender_counter';
    sealsWinnerId = defender.id;
    const defSeals = isVaBanqueActive ? 2 : 1;
    sealAwards.push({ playerId: defender.id, count: defSeals });
    message = `🛡️ КОНТРАТАКА ЩИТОМ${isVaBanqueActive ? ' ПОД ВА-БАНКОМ' : ''}! ${defender.name} подтвердил(а) защиту («${defenderRevealedRole}»), а ${actor.name} блефовал(а) («${actorRevealedRole}»). Атакующий проиграл дуэль${isVaBanqueActive ? ' под Ва-банком' : ''}: ${defender.name} получает +${defSeals} ⚜️, атака отбита!`;
  } else {
    resultType = 'mutual_bluff';
    bothLostCoin = false;
    message = `🤡 ОБА ПОПАЛИСЬ! Оба игрока блефовали (${actor.name}: «${actorRevealedRole}», ${defender.name}: «${defenderRevealedRole}»). Атака отменена, никто ничего не получает и не теряет!`;
  }

  const outcome: DuelOutcome = {
    attackerId: actor.id,
    defenderId: defender.id,
    attackerClaim: pendingAction.roleClaim!,
    defenderClaim: pendingDuelDefenderRoleClaim,
    attackerRevealedRole: actorRevealedRole,
    defenderRevealedRole,
    attackerWasTruth: actorWasTruth,
    defenderWasTruth,
    resultType,
    sealsWinnerId,
    bothLostCoin,
    message
  };

  set(state => ({
    players: state.players.map(p => {
      if (p.id === actor.id) return { ...p, hand: actorHand };
      if (p.id === defender.id) return { ...p, hand: defenderHand };
      return p;
    }),
    discardPile: [...state.discardPile, ...revealedInstances],
    duelOutcome: outcome,
    turnPhase: 'DUEL_OUTCOME',
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [actor.id]: actorWasTruth ? '«Чистая сталь!»' : '«Посмотрим, кто дрогнет!»',
      [defender.id]: defenderWasTruth ? '«Мой щит непоколебим!»' : '«Я рискнул и ответил вызовом!»'
    },
    history: [message, ...state.history].slice(0, 50)
  }));

  // Только теперь, поверх уже применённого состояния (карты ушли из рук в
  // сброс), выдаём печати: `addSealsToPlayer` сам сконвертирует 2 ⚜️ в 1 👑 и
  // при необходимости откроет круг коронации.
  /* На дуэли вскрываются обе карты — значит уличёнными могут оказаться оба.
     Порядок с печатями важен: интриги сжигаются до наград, иначе
     `addSealsToPlayer` прочитает уже сгоревшую «Охранную грамоту» как живую
     и не начислит печать тому, кто её только что потерял. */
  if (!actorWasTruth) discardProtectiveIntrigueOnBluff(get, set, actor.id);
  if (!defenderWasTruth) discardProtectiveIntrigueOnBluff(get, set, defender.id);

  for (const award of sealAwards) {
    get().addSealsToPlayer(award.playerId, award.count);
  }

  timerManager.scheduleDelay(() => {
    get().closeDuelOutcome();
  }, 4000);
}

export function closeDuelOutcome(
  get: StateGetter,
  set: StateSetter
): void {
  const { duelOutcome, pendingAction } = get();
  if (!duelOutcome || !pendingAction) return;

  const breakthrough = duelOutcome.resultType === 'attacker_breakthrough';
  set({ duelOutcome: null });

  if (breakthrough) {
    get()._triggerVetoWindowOrResolveEffect(pendingAction);
  } else {
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 800);
  }
}
