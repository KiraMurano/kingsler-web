import type { GameState } from '../types';
import { drawCardsFromDeck } from '../cards';
import { timerManager } from '../utils/timerManager';
import { resolveMorningPlots } from './plotResolver';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function checkEndgameAndAdvanceTurn(
  get: StateGetter,
  set: StateSetter
): void {
  const { players, coronationCandidateId, activePlayerId, hasPlayedRoleThisTurn, hasPlayedPlotThisTurn } = get();
  const actor = players.find(p => p.id === activePlayerId);

  if (actor && actor.favor >= 6 && !coronationCandidateId) {
    set(state => ({
      coronationCandidateId: actor.id,
      history: [`👑 КРУГ КОРОНАЦИИ! ${actor.name} набрал ${actor.favor} 👑! Если никто не собьёт его короны за полный круг, он победит!`, ...state.history].slice(0, 50)
    }));
  }

  // Check if actor has tokens left and can still make plays
  if (!actor || actor.actionTokens <= 0 || (hasPlayedRoleThisTurn && hasPlayedPlotThisTurn && actor.hand.length === 0)) {
    get().endTurn();
  } else {
    // Return to IDLE in Phase 3 so active player can take a 2nd action or finish turn
    set({
      turnPhase: 'IDLE',
      turnSubPhase: 'CARD_PLAY_PHASE',
      pendingAction: null,
      isVaBanqueActive: false,
      isVetoed: false
    });
  }
}

export function endTurn(
  get: StateGetter,
  set: StateSetter
): void {
  timerManager.clearAll();
  const { players, activePlayerId, coronationCandidateId, deck, discardPile } = get();

  // 1. Refill any players who have < 2 cards in hand (deferred card draw)
  let curDeck = deck;
  let curDiscard = discardPile;
  const refilledPlayers = players.map(p => {
    if (p.hand.length < 2) {
      const needed = 2 - p.hand.length;
      const { drawn, deck: newD, discardPile: newDisc } = drawCardsFromDeck(needed, curDeck, curDiscard);
      curDeck = newD;
      curDiscard = newDisc;
      return { ...p, hand: [...p.hand, ...drawn] };
    }
    return p;
  });

  const currentIndex = refilledPlayers.findIndex(p => p.id === activePlayerId);
  const nextIndex = (currentIndex + 1) % refilledPlayers.length;
  const nextPlayer = refilledPlayers[nextIndex];

  // 2. Refill nextPlayer action tokens to 2 at turn start
  const updatedPlayers = refilledPlayers.map(p => {
    if (p.id === nextPlayer.id) {
      return { ...p, actionTokens: 2 };
    }
    return p;
  });

  // 3. Phase 1 Morning Triggers: Check Royal Reception / Informant Network expiry at start of nextPlayer's turn
  const {
    updatedPlayers: morningPlayers,
    curDiscard: morningDiscard,
    coronationTriggeredByReception,
    nextPlayerUpdated
  } = resolveMorningPlots(updatedPlayers, nextIndex, curDiscard, coronationCandidateId, set);

  // 4. Check Coronation victory if candidate held >= 6 crowns for entire round
  if (coronationCandidateId && nextPlayer.id === coronationCandidateId) {
    if (nextPlayerUpdated.favor >= 6) {
      set(state => ({
        players: morningPlayers,
        deck: curDeck,
        discardPile: morningDiscard,
        winnerId: nextPlayer.id,
        turnPhase: 'GAME_OVER',
        history: [`👑 КОРОНАЦИЯ СОСТОЯЛАСЬ! ${nextPlayer.name} удержал(а) ${nextPlayerUpdated.favor} 👑 целый круг и становится полноправным Королём Kinglier!`, ...state.history].slice(0, 50)
      }));
      return;
    } else {
      set({ coronationCandidateId: null });
    }
  }

  const newCandidateId = coronationTriggeredByReception ? nextPlayerUpdated.id : coronationCandidateId;

  set({
    players: morningPlayers,
    deck: curDeck,
    discardPile: morningDiscard,
    activePlayerId: nextPlayer.id,
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE',
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
    coronationCandidateId: newCandidateId,
    pendingAction: null,
    isVaBanqueActive: false,
    isVetoed: false,
    pendingDuelDefenderCardIndex: null,
    pendingDuelDefenderRoleClaim: null,
    duelOutcome: null,
    activeSpeechReactions: {},
    timerSeconds: 0,
    revealOutcome: null,
    spyPeekData: null,
    informantPeekData: null
  });
}
