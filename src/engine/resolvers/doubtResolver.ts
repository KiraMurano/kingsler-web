import type { Action, GameState, RevealOutcome } from '../types';
import { isRole } from '../cards';
import { declineAcc, verbDoubted, verbCaught } from '../utils/russianText';
import { botMemory, evaluateBotDoubt } from '../Bot';
import { triggerResourceFloat, triggerSingleCardFlight } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { chargeActiveConspiracies, landPlot, applyConspiracyEffect, applyMorningPlotReward, discardMorningPlot } from './plotResolver';
import { resolveInstantEffect } from './instantResolver';
import { beginCoronationIfNeeded } from './coronation';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function doubtAction(
  get: StateGetter,
  set: StateSetter,
  doubterId: string
): void {
  timerManager.clearAll();
  const { pendingAction, turnPhase, players } = get();
  if ((turnPhase !== 'DOUBT_WINDOW' && turnPhase !== 'TARGET_REACTION_WINDOW') || !pendingAction || !pendingAction.roleClaim) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  const doubter = players.find(p => p.id === doubterId);
  if (!actor || !doubter) return;

  // Doubter must spend 1 Action Token!
  if (doubter.actionTokens < 1) {
    return;
  }

  // Deduct 1 Action Token from doubter immediately
  let newPlayers = players.map(p => p.id === doubter.id ? { ...p, actionTokens: p.actionTokens - 1 } : p);
  triggerResourceFloat(set, doubter.id, '-1 ⚡', false);

  // Informant Network trigger: all OTHER holders (not the doubter) receive +1 🪙 for checks by other players!
  const informantHolders = newPlayers.filter(p => p.activePlot?.type === 'Сеть информаторов' && p.id !== doubter.id);
  if (informantHolders.length > 0) {
    newPlayers = newPlayers.map(p => (p.activePlot?.type === 'Сеть информаторов' && p.id !== doubter.id) ? { ...p, gold: p.gold + 1 } : p);
    informantHolders.forEach(p => {
      triggerResourceFloat(set, p.id, '+1 🪙 Информаторы', true);
    });
  }

  const informantLogs = informantHolders.map(p => `👁️ «Сеть информаторов» приносит +1 🪙 для ${p.name} за проверку при дворе от ${doubter.name}!`);

  set(state => ({
    players: newPlayers,
    pendingDoubtDoubterId: doubter.id,
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [doubter.id]: '«Не верю! Проверяю!»'
    },
    history: [
      ...informantLogs,
      `⚡ ${doubter.name} сомневается в «${pendingAction.roleClaim}» от ${actor.name} и кричит: «НЕ ВЕРЮ!» (потрачен 1 ⚡).`,
      ...state.history
    ].slice(0, 50)
  }));

  // Charge active conspiracies
  chargeActiveConspiracies(get, set, `проверку от ${doubter.name}`);

  timerManager.scheduleDelay(() => {
    get()._executeRevealOutcome(doubter.id);
  }, ACTION_HOLD_MS);
}

export function passDoubt(
  get: StateGetter,
  set: StateSetter,
  playerId: string
): void {
  timerManager.clearAll();
  const { turnPhase, pendingAction, players, discardPile, coronationCandidateId } = get();
  if (turnPhase !== 'DOUBT_WINDOW' || !pendingAction || !pendingAction.roleClaim) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  if (!actor) return;

  const passer = players.find(p => p.id === playerId);
  if (passer) {
    set(state => ({
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [passer.id]: '«Верю.»'
      }
    }));
  }

  // Check observing bots who have >= 1 Action Token
  const bots = players.filter(p => p.isBot && p.id !== pendingAction.actorId && p.id !== playerId && p.actionTokens >= 1);
  const botDoubter = bots.find(b => {
    const decision = evaluateBotDoubt(
      b,
      actor,
      pendingAction.roleClaim!,
      false,
      coronationCandidateId,
      pendingAction.targetId,
      discardPile,
      players
    );
    return decision.shouldDoubt;
  });

  if (botDoubter) {
    get().doubtAction(botDoubter.id);
  } else {
    get()._proceedAfterDoubtPassed(pendingAction);
  }
}

export function executeRevealOutcome(
  get: StateGetter,
  set: StateSetter,
  doubterId: string
): void {
  timerManager.clearAll();
  const { pendingAction, players, isVaBanqueActive } = get();
  if (!pendingAction || !pendingAction.roleClaim) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  const doubter = players.find(p => p.id === doubterId);
  if (!actor || !doubter) return;

  const claimedRole = pendingAction.roleClaim;
  const actorHand = [...actor.hand];
  let stakedIndex = pendingAction.stakedCardIndex ?? 0;
  if (stakedIndex < 0 || stakedIndex >= actorHand.length) stakedIndex = 0;

  const revealedRole = actorHand[stakedIndex] || actorHand[0] || 'Наследник';
  const wasTruth = revealedRole === claimedRole;

  const newPlayers = [...players];
  const actorIdx = newPlayers.findIndex(p => p.id === actor.id);
  const doubterIdx = newPlayers.findIndex(p => p.id === doubter.id);

  let jesterBonus = false;
  let blackBookApplied = false;
  let sealsWinnerId: string | undefined = undefined;
  let sealsCount = 0;
  let dossierBonusPlayerId: string | undefined = undefined;
  const doubterPlot = doubter.activePlot;

  if (wasTruth) {
    // Failed check: Black Book is discarded without reward
    if (doubterPlot && doubterPlot.type === 'Чёрная книга') {
      newPlayers[doubterIdx] = { ...newPlayers[doubterIdx], activePlot: null };
      set(state => ({ discardPile: [...state.discardPile, 'Чёрная книга'] }));
    }

    if (claimedRole === 'Шут') {
      if (actor.favor < 6) {
        const nextFavor = Math.min(6, actor.favor + 1);
        const gained = nextFavor - actor.favor;
        newPlayers[actorIdx] = { ...actor, favor: nextFavor };
        jesterBonus = true;
        triggerResourceFloat(set, actor.id, `+${gained} 👑`, true);
      }

      if (newPlayers[actorIdx].favor >= 6) {
        beginCoronationIfNeeded(get, set, actor.id);
      }
    } else {
      // Under Va-banque, truth does NOT grant seals to actor (0 seals, only x2 role effect)
      if (!isVaBanqueActive) {
        sealsWinnerId = actor.id;
        sealsCount = 1;
      }
    }
  } else {
    // Caught bluffing!
    // Check Black Book (Чёрная книга) for doubter: grants +1 👑 directly, NO seals!
    if (doubterPlot && doubterPlot.type === 'Чёрная книга') {
      blackBookApplied = true;
      if (doubter.favor < 6) {
        const nextFavor = Math.min(6, doubter.favor + 1);
        const gained = nextFavor - doubter.favor;
        newPlayers[doubterIdx] = {
          ...newPlayers[doubterIdx],
          favor: nextFavor,
          activePlot: null
        };
        triggerResourceFloat(set, doubter.id, `+${gained} 👑 Чёрная книга!`, true);
      } else {
        newPlayers[doubterIdx] = {
          ...newPlayers[doubterIdx],
          activePlot: null
        };
      }
      set(state => ({ discardPile: [...state.discardPile, 'Чёрная книга'] }));

      if (newPlayers[doubterIdx].favor >= 6) {
        beginCoronationIfNeeded(get, set, doubter.id);
      }
    } else {
      // Normal doubt / Va-banque doubt: awards seals
      sealsWinnerId = doubter.id;
      sealsCount = isVaBanqueActive ? 2 : 1;
    }

    // Check Dossier (Досье) on the accused actor: awards +1 👑 directly!
    const dossierOwner = newPlayers.find(p => p.activePlot?.type === 'Досье' && p.activePlot.targetPlayerId === actor.id);
    if (dossierOwner) {
      dossierBonusPlayerId = dossierOwner.id;
      const dIdx = newPlayers.findIndex(p => p.id === dossierOwner.id);
      const dNextFavor = Math.min(6, dossierOwner.favor + 1);
      const dGained = dNextFavor - dossierOwner.favor;
      newPlayers[dIdx] = {
        ...newPlayers[dIdx],
        favor: dNextFavor,
        activePlot: null
      };
      triggerResourceFloat(set, dossierOwner.id, `+${dGained} 👑 Досье!`, true);
      set(state => ({ discardPile: [...state.discardPile, 'Досье'] }));

      if (newPlayers[dIdx].favor >= 6) {
        beginCoronationIfNeeded(get, set, dossierOwner.id);
      }
    }
  }

  // Remove revealed card from hand to discard
  actorHand.splice(stakedIndex, 1);
  newPlayers[actorIdx] = { ...newPlayers[actorIdx], hand: actorHand };
  const newDiscard = [...get().discardPile, revealedRole];

  if (isRole(revealedRole)) botMemory.recordRevealedCard(actor.id, revealedRole);

  const vaBanqueNotice = isVaBanqueActive ? ' 🎲 (Сыгран ВА-БАНК!)' : '';
  const blackBookNotice = (doubterPlot?.type === 'Чёрная книга' && !wasTruth) ? ' 📕 (Сработала Чёрная книга!)' : '';
  const dossierNotice = dossierBonusPlayerId ? ` 📜 (Досье принесло +1 👑 для ${players.find(p => p.id === dossierBonusPlayerId)?.name}!)` : '';

  const actorAcc = declineAcc(actor.name);
  const doubterDoubted = verbDoubted(doubter.name);
  const doubterCaught = verbCaught(doubter.name);

  let message = '';
  if (wasTruth) {
    if (claimedRole === 'Шут') {
      if (isVaBanqueActive) {
        message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «Шут»! Ловушка под Ва-банком: ${actor.name} получает +4 🪙 и +1 👑 (печати отменены)!${vaBanqueNotice}`;
      } else {
        message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «Шут»! Ловушка сработала: ${actor.name} получает +1 👑!`;
      }
    } else {
      if (isVaBanqueActive) {
        message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «${claimedRole}»! Эффект роли удваивается (печати отменены)!${vaBanqueNotice}`;
      } else {
        message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «${claimedRole}»! ${actor.name} получает +1 ⚜️, и действие исполняется!`;
      }
    }
  } else {
    if (blackBookApplied) {
      message = `${doubter.name} ${doubterCaught} ${actorAcc} на лжи! На кону была карта «${revealedRole}» вместо «${claimedRole}». Сработала «Чёрная книга»: ${doubter.name} получает +1 👑 напрямую (без печатей)!${vaBanqueNotice}${dossierNotice}`;
    } else {
      message = `${doubter.name} ${doubterCaught} ${actorAcc} на лжи! На кону была карта «${revealedRole}» вместо «${claimedRole}». ${doubter.name} получает +${sealsCount} ⚜️, а действие отменяется.${vaBanqueNotice}${blackBookNotice}${dossierNotice}`;
    }
  }

  const outcome: RevealOutcome = {
    accuserId: doubter.id,
    accusedId: actor.id,
    claimedRole,
    wasTruth,
    revealedRole,
    sealsWinnerId,
    actionExecuted: wasTruth && (claimedRole !== 'Шут' || isVaBanqueActive),
    jesterBonus,
    vaBanqueBonus: isVaBanqueActive,
    dossierBonusPlayerId,
    message
  };

  set(state => ({
    players: newPlayers,
    discardPile: newDiscard,
    revealOutcome: outcome,
    turnPhase: 'REVEAL_OUTCOME',
    pendingDoubtDoubterId: null,
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [actor.id]: wasTruth ? (claimedRole === 'Шут' ? '«Ха-ха! Попались на Шута!»' : '«Вот моя карта! Чистая правда!»') : '«Увы... раскрыли блеф!»'
    },
    history: [outcome.message, ...state.history].slice(0, 50)
  }));

  if (sealsWinnerId && sealsCount > 0) {
    get().addSealsToPlayer(sealsWinnerId, sealsCount);
  }

  timerManager.scheduleDelay(() => {
    get().closeRevealOutcome();
  }, 2800);
}

export function closeRevealOutcome(
  get: StateGetter,
  set: StateSetter
): void {
  const { revealOutcome, pendingAction } = get();
  if (!revealOutcome) return;

  const goesToVeto =
    revealOutcome.wasTruth &&
    (revealOutcome.claimedRole !== 'Шут' || revealOutcome.vaBanqueBonus) &&
    !!pendingAction;

  if (goesToVeto) {
    set({
      revealOutcome: null,
      hasCardDeparted: false,
      isPendingActionAfterTruthChallenge: true
    });
    get()._triggerVetoWindowOrResolveEffect(pendingAction, true);
    return;
  }

  triggerSingleCardFlight(
    set,
    'to_discard',
    revealOutcome.accusedId,
    revealOutcome.claimedRole,
    revealOutcome.revealedRole,
    revealOutcome.wasTruth
  );
  set({ revealOutcome: null });
  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, 800);
}

/**
 * A staked role card that never got revealed by a challenge flies back to its
 * owner's hand; one that was already shown (truth-challenge path) flies to
 * the discard. Shared by every place a pending role action stops being
 * "on the table" — resolved, vetoed, or vetoed-after-truth-reveal — so the
 * staked card never just vanishes off the arena.
 */
function flightHomeOrDiscard(
  set: StateSetter,
  action: Action,
  isAfterTruthChallenge: boolean
): void {
  if (action.cardAlreadyResolved || !action.roleClaim) return;
  if (isAfterTruthChallenge) {
    triggerSingleCardFlight(set, 'to_discard', action.actorId, action.roleClaim);
  } else {
    triggerSingleCardFlight(set, 'to_hand', action.actorId, action.roleClaim);
  }
}

export function proceedAfterDoubtPassed(
  get: StateGetter,
  set: StateSetter,
  action: Action
): void {
  timerManager.clearAll();

  set(state => ({
    hasCardDeparted: false,
    history: [`🂠 Действие «${action.roleClaim}» от ${state.players.find(p => p.id === action.actorId)?.name || 'игрока'} не оспорено двором (карта остаётся в руке).`, ...state.history].slice(0, 50)
  }));

  get()._triggerVetoWindowOrResolveEffect(action, false);
}

export function triggerVetoWindowOrResolveEffect(
  get: StateGetter,
  set: StateSetter,
  action: Action,
  isAfterTruthChallenge = false
): void {
  timerManager.clearAll();
  const { isVetoed, players } = get();

  if (action.cannotBeVetoed) {
    get()._resolvePendingActionEffect(action, isAfterTruthChallenge);
    return;
  }

  if (isVetoed) {
    flightHomeOrDiscard(set, action, isAfterTruthChallenge);
    set(state => ({
      overlayInstant: null,
      history: [`🚫 Действие «${action.roleClaim || action.name}» отменено Правом вето!`, ...state.history].slice(0, 50)
    }));
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
    return;
  }

  // Check if any opponent holds Royal Veto (free instant, 0 ⚡)
  const human = players.find(p => !p.isBot);
  const humanHoldsVeto = human && human.id !== action.actorId && human.hand.includes('Право вето');
  const botHoldsVeto = players.some(p => p.isBot && p.id !== action.actorId && p.hand.includes('Право вето'));

  if (humanHoldsVeto) {
    set({
      turnPhase: 'VETO_WINDOW',
      hasCardDeparted: false,
      timerSeconds: 0,
      timerMaxSeconds: 0,
      isPendingActionAfterTruthChallenge: isAfterTruthChallenge
    });
  } else if (botHoldsVeto) {
    set({
      turnPhase: 'VETO_WINDOW',
      hasCardDeparted: false,
      timerSeconds: 0,
      timerMaxSeconds: 0,
      isPendingActionAfterTruthChallenge: isAfterTruthChallenge
    });
    timerManager.scheduleDelay(() => {
      if (get().turnPhase === 'VETO_WINDOW' && !get().isVetoed) {
        get().proceedAfterVetoWindow();
      }
    }, 2200);
  } else {
    flightHomeOrDiscard(set, action, isAfterTruthChallenge);
    set({
      turnPhase: 'IDLE'
    });
    timerManager.scheduleDelay(() => {
      get()._resolvePendingActionEffect(action, isAfterTruthChallenge);
    }, 800);
  }
}

export function resolvePendingActionEffect(
  get: StateGetter,
  set: StateSetter,
  action: Action,
  isAfterTruthChallenge = false
): void {
  if (action.isMorningTrigger) {
    applyMorningPlotReward(get, set, action);
    return;
  }
  if (action.conspiracyEffect) {
    applyConspiracyEffect(get, set, action);
    return;
  }
  if (action.type === 'instant') {
    resolveInstantEffect(get, set, action);
    return;
  }
  if (action.type === 'plot') {
    landPlot(get, set, action);
    return;
  }
  get()._resolveRoleActionEffect(action, isAfterTruthChallenge);
}

export function proceedAfterVetoWindow(
  get: StateGetter,
  set: StateSetter
): void {
  timerManager.clearAll();
  const { pendingAction, isVetoed, isPendingActionAfterTruthChallenge } = get();
  if (!pendingAction) {
    get()._checkEndgameAndAdvanceTurn();
    return;
  }

  if (isVetoed) {
    flightHomeOrDiscard(set, pendingAction, !!isPendingActionAfterTruthChallenge);
    set(state => ({
      overlayInstant: null,
      history: [`🚫 Действие «${pendingAction.roleClaim || pendingAction.name}» отменено Правом вето!`, ...state.history].slice(0, 50)
    }));
    if (pendingAction.isMorningTrigger) {
      discardMorningPlot(get, set, pendingAction.actorId);
      return;
    }
    if (pendingAction.type === 'plot' && !pendingAction.conspiracyEffect && pendingAction.plotType) {
      set(state => ({
        discardPile: [...state.discardPile, pendingAction.plotType!]
      }));
    }
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
    return;
  }

  flightHomeOrDiscard(set, pendingAction, !!isPendingActionAfterTruthChallenge);

  get()._resolvePendingActionEffect(pendingAction, isPendingActionAfterTruthChallenge ?? false);
}
