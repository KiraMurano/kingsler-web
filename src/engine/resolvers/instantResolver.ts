import type { GameState, InstantType } from '../types';
import { drawCardsFromDeck, isRole } from '../cards';
import { botMemory } from '../Bot';
import { declineGen } from '../utils/russianText';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function playInstant(
  get: StateGetter,
  set: StateSetter,
  playerId: string,
  instantType: InstantType,
  cardIndex: number,
  targetPlayerId?: string
): void {
  const { players, pendingAction, discardPile, activePlayerId } = get();
  const actor = players.find(p => p.id === playerId);
  if (!actor) return;

  const isFreeInstant = instantType === 'Право вето' || instantType === 'Перенаправление';
  if (!isFreeInstant && actor.actionTokens < 1) return;

  const card = actor.hand[cardIndex];
  if (card !== instantType) return;

  // Remove instant from hand to discard (deferred draw at end of turn)
  const newHand = [...actor.hand];
  newHand.splice(cardIndex, 1);
  const updatedDiscard = [...discardPile, instantType];

  const tokenCost = isFreeInstant ? 0 : 1;
  const updatedPlayers = players.map(p => p.id === actor.id ? {
    ...p,
    actionTokens: p.actionTokens - tokenCost,
    hand: newHand
  } : p);
  if (tokenCost > 0) {
    triggerResourceFloat(set, actor.id, '-1 ⚡', false);
  }

  const isOwnTurn = actor.id === activePlayerId;

  if (instantType === 'Ва-банк') {
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      isVaBanqueActive: true,
      history: [`🎲 ${actor.name} играет инстант ⚡ «ВА-БАНК» (потрачен 1 ⚡)! Награда за этот спор удваивается (2 ⚜️ = 1 👑)!`, ...state.history].slice(0, 50)
    }));
    triggerResourceFloat(set, actor.id, '⚡ ВА-БАНК! (x2)', true);
  } else if (instantType === 'Право вето') {
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      isVetoed: true,
      history: [`🚫 ${actor.name} играет инстант ⚡ «ПРАВО ВЕТО»! Эффект действия отменён!`, ...state.history].slice(0, 50)
    }));
    triggerResourceFloat(set, actor.id, '🚫 ПРАВО ВЕТО!', false);

    if (get().turnPhase === 'VETO_WINDOW') {
      timerManager.clearAll();
      timerManager.scheduleDelay(() => {
        get().proceedAfterVetoWindow();
      }, 1200);
    }
  } else if (instantType === 'Перенаправление' && targetPlayerId) {
    const newTarget = players.find(p => p.id === targetPlayerId);
    if (pendingAction && newTarget) {
      const updatedAction = { ...pendingAction, targetId: targetPlayerId };
      set(state => ({
        players: updatedPlayers,
        discardPile: updatedDiscard,
        pendingAction: updatedAction,
        turnPhase: 'TARGET_REACTION_WINDOW',
        timerSeconds: 0,
        timerMaxSeconds: 0,
        history: [`🔀 ${actor.name} играет инстант ⚡ «ПЕРЕНАПРАВЛЕНИЕ»! Новая цель атаки: ${newTarget.name}!`, ...state.history].slice(0, 50)
      }));
    }
  } else if (instantType === 'Дворцовый переполох' && targetPlayerId) {
    const targetIdx = updatedPlayers.findIndex(p => p.id === targetPlayerId);
    if (targetIdx !== -1) {
      const victim = updatedPlayers[targetIdx];
      const { drawn: newTwo, deck: d2, discardPile: disc2 } = drawCardsFromDeck(2, get().deck, [...updatedDiscard, ...victim.hand]);
      updatedPlayers[targetIdx] = { ...victim, hand: newTwo };

      botMemory.invalidatePlayerHand(victim.id);

      set(state => ({
        players: updatedPlayers,
        deck: d2,
        discardPile: disc2,
        history: [`⚡ ${actor.name} играет инстант «ДВОРЦОВЫЙ ПЕРЕПОЛОХ» (потрачен 1 ⚡)! ${victim.name} сбрасывает руку и берет 2 новые карты!`, ...state.history].slice(0, 50)
      }));
      triggerResourceFloat(set, victim.id, '🔄 Смена руки!', false);
    }
    if (isOwnTurn) {
      set({ turnSubPhase: 'CARD_PLAY_PHASE' });
      timerManager.scheduleDelay(() => {
        get()._checkEndgameAndAdvanceTurn();
      }, 1200);
    }
  } else if (instantType === 'Шпион' && targetPlayerId) {
    const target = updatedPlayers.find(p => p.id === targetPlayerId);
    if (target) {
      if (!actor.isBot) {
        set(state => ({
          players: updatedPlayers,
          discardPile: updatedDiscard,
          turnSubPhase: 'CARD_PLAY_PHASE',
          spyPeekData: {
            actorId: actor.id,
            targetId: target.id,
            targetCards: [...target.hand]
          },
          turnPhase: 'SPY_PEEK',
          history: [`👁️ ${actor.name} играет инстант ⚡ «ШПИОН» (потрачен 1 ⚡) и тайно изучает карты ${declineGen(target.name)}!`, ...state.history].slice(0, 50)
        }));
      } else {
        if (isRole(target.hand[0])) botMemory.recordSpyPeek(actor.id, target.id, 0, target.hand[0]);
        if (target.hand.length > 1 && isRole(target.hand[1])) {
          botMemory.recordSpyPeek(actor.id, target.id, 1, target.hand[1]);
        }
        set(state => ({
          players: updatedPlayers,
          discardPile: updatedDiscard,
          turnSubPhase: 'CARD_PLAY_PHASE',
          history: [`👁️ ${actor.name} играет инстант ⚡ «ШПИОН» (потрачен 1 ⚡) и тайно изучает карты ${declineGen(target.name)}!`, ...state.history].slice(0, 50)
        }));
        if (isOwnTurn) {
          timerManager.scheduleDelay(() => {
            get()._checkEndgameAndAdvanceTurn();
          }, 1200);
        }
      }
    }
  }
}
