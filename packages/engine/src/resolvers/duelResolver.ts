import type { GameState, DuelOutcome, DuelResultType } from '../types';
import { triggerSingleCardFlight, triggerDuelCardFlight, triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { chargeActiveConspiracies } from './plotResolver';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function targetDeclareDuel(
  get: StateGetter,
  set: StateSetter,
  targetId: string,
  stakedCardIndex = 0
): void {
  timerManager.clearAll();
  const { pendingAction, turnPhase, players } = get();
  if (turnPhase !== 'TARGET_REACTION_WINDOW' || !pendingAction || pendingAction.targetId !== targetId) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  const target = players.find(p => p.id === targetId);
  if (!actor || !target) return;
  if (target.actionTokens < 1) return;

  const blockingRole = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';

  triggerResourceFloat(set, target.id, '-1 ⚡', false);

  set(state => ({
    players: state.players.map(p =>
      p.id === target.id ? { ...p, actionTokens: p.actionTokens - 1 } : p
    ),
    turnPhase: 'DUEL_ATTACKER_WINDOW',
    pendingDuelDefenderCardIndex: stakedCardIndex,
    pendingDuelDefenderRoleClaim: blockingRole,
    timerSeconds: 0,
    timerMaxSeconds: 0,
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [target.id]: `«ДУЭЛЬ! Мой щит — ${blockingRole}!»`
    },
    history: [`🤺 ${target.name} вызывает ${actor.name} на ДУЭЛЬ, заявляя «${blockingRole}» (потрачен 1 ⚡)!`, ...state.history].slice(0, 50)
  }));

  // Charge active conspiracies on duel declaration
  chargeActiveConspiracies(get, set, `вызов на дуэль от ${target.name}`);
}

export function attackerRetreatDuel(
  get: StateGetter,
  set: StateSetter,
  attackerId: string
): void {
  timerManager.clearAll();
  const { pendingAction, turnPhase, players } = get();
  if (turnPhase !== 'DUEL_ATTACKER_WINDOW' || !pendingAction || pendingAction.actorId !== attackerId) return;

  const actor = players.find(p => p.id === attackerId);
  const defender = players.find(p => p.id === pendingAction.targetId);
  if (!actor || !defender) return;

  const actorHand = [...actor.hand];
  const stakedIdx = pendingAction.stakedCardIndex ?? 0;
  const discarded = actorHand[stakedIdx] ?? actorHand[0];
  if (discarded) actorHand.splice(actorHand.indexOf(discarded), 1);

  const newPlayers = players.map(p => p.id === actor.id ? { ...p, hand: actorHand } : p);
  const newDiscard = discarded ? [...get().discardPile, discarded] : [...get().discardPile];

  triggerSingleCardFlight(set, 'to_discard', actor.id, pendingAction.roleClaim, discarded?.card);

  set(state => ({
    players: newPlayers,
    discardPile: newDiscard,
    turnPhase: 'IDLE',
    turnSubPhase: 'CARD_PLAY_PHASE',
    pendingAction: null,
    overlayInstant: null,
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [actor.id]: '«Я отступаю... в этот раз.»'
    },
    history: [`🏳️ ${actor.name} отступает перед щитом ${defender.name} (карта атаки сброшена).`, ...state.history].slice(0, 50)
  }));

  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, ACTION_HOLD_MS);
}

export function attackerAcceptDuel(
  get: StateGetter,
  set: StateSetter,
  attackerId: string
): void {
  timerManager.clearAll();
  const { pendingAction, pendingDuelDefenderCardIndex, pendingDuelDefenderRoleClaim, turnPhase, players } = get();
  if (turnPhase !== 'DUEL_ATTACKER_WINDOW' || !pendingAction || pendingAction.actorId !== attackerId || !pendingDuelDefenderRoleClaim) return;

  const actor = players.find(p => p.id === attackerId);
  const defender = players.find(p => p.id === pendingAction.targetId);
  if (!actor || !defender) return;

  const actorHand = [...actor.hand];
  const actorStakedIdx = pendingAction.stakedCardIndex ?? 0;
  const actorStaked = actorHand[actorStakedIdx] ?? actorHand[0];
  const actorRevealedRole = actorStaked?.card ?? 'Наследник';
  const actorWasTruth = actorRevealedRole === pendingAction.roleClaim;

  const defenderHand = [...defender.hand];
  const defStakedIdx = pendingDuelDefenderCardIndex ?? 0;
  const defenderStaked = defenderHand[defStakedIdx] ?? defenderHand[0];
  const defenderRevealedRole = defenderStaked?.card ?? 'Наследник';
  const defenderWasTruth = defenderRevealedRole === pendingDuelDefenderRoleClaim;

  if (actorStaked) actorHand.splice(actorHand.indexOf(actorStaked), 1);
  if (defenderStaked) defenderHand.splice(defenderHand.indexOf(defenderStaked), 1);

  const newPlayers = players.map(p => {
    if (p.id === actor.id) return { ...p, hand: actorHand };
    if (p.id === defender.id) return { ...p, hand: defenderHand };
    return p;
  });

  const isVaBanqueActive = get().isVaBanqueActive;
  let resultType: DuelResultType = 'clash_blocked';
  let sealsWinnerId: string | undefined = undefined;
  let bothLostCoin = false;
  let message = '';

  if (actorWasTruth && defenderWasTruth) {
    resultType = 'clash_blocked';
    get().addSealsToPlayer(actor.id, 1);
    get().addSealsToPlayer(defender.id, 1);
    message = `🛡️ ЧЕСТНАЯ ДУЭЛЬ! Оба игрока сказали правду (${actor.name}: «${actorRevealedRole}», ${defender.name}: «${defenderRevealedRole}»). Атака заблокирована, КАЖДЫЙ получает по +1 ⚜️!${isVaBanqueActive ? ' (Ва-банк нейтрализован щитом)' : ''}`;
  } else if (actorWasTruth && !defenderWasTruth) {
    resultType = 'attacker_breakthrough';
    if (!isVaBanqueActive) {
      sealsWinnerId = actor.id;
      get().addSealsToPlayer(actor.id, 1);
    }
    message = `💥 ПРОБИТИЕ ЗАЩИТЫ${isVaBanqueActive ? ' ПОД ВА-БАНКОМ' : ''}! ${actor.name} сказал правду («${actorRevealedRole}»), а ${defender.name} блефовал(а) («${defenderRevealedRole}»). ${isVaBanqueActive ? 'Защитник проиграл дуэль: атака проходит с удвоением (4 🪙 / 2 👑, печати отменены)!' : `${actor.name} получает +1 ⚜️, атака проходит!`}`;
  } else if (!actorWasTruth && defenderWasTruth) {
    resultType = 'defender_counter';
    sealsWinnerId = defender.id;
    const defSeals = isVaBanqueActive ? 2 : 1;
    get().addSealsToPlayer(defender.id, defSeals);
    message = `🛡️ КОНТРАТАКА ЩИТОМ${isVaBanqueActive ? ' ПОД ВА-БАНКОМ' : ''}! ${defender.name} подтвердил(а) защиту («${defenderRevealedRole}»), а ${actor.name} блефовал(а) («${actorRevealedRole}»). Атакующий проиграл дуэль под Ва-банком: ${defender.name} получает +${defSeals} ⚜️, атака отбита!`;
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
    players: newPlayers,
    duelOutcome: outcome,
    turnPhase: 'DUEL_OUTCOME',
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [actor.id]: actorWasTruth ? '«Принимаю дуэль! Чистая сталь!»' : '«Принимаю! Посмотрим, кто дрогнет!»',
      [defender.id]: defenderWasTruth ? '«Мой щит непоколебим!»' : '«Я рискнул и ответил вызовом!»'
    },
    history: [message, ...state.history].slice(0, 50)
  }));

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

  triggerDuelCardFlight(
    set,
    'to_discard',
    duelOutcome.attackerId,
    'to_discard',
    duelOutcome.defenderId,
    duelOutcome.attackerRevealedRole,
    duelOutcome.attackerWasTruth,
    duelOutcome.defenderRevealedRole,
    duelOutcome.defenderWasTruth
  );

  const breakthrough = duelOutcome.resultType === 'attacker_breakthrough';
  set({ duelOutcome: null });

  if (breakthrough) {
    const resolvedAction = { ...pendingAction, cardAlreadyResolved: true };
    set({ pendingAction: resolvedAction });
    get()._triggerVetoWindowOrResolveEffect(resolvedAction);
  } else {
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 800);
  }
}
