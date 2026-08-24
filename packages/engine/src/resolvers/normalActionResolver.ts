import type { Action, GameState } from '../types';
import { drawCardsFromDeck } from '../cards';
import { botMemory } from '../Bot';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { fallenCoronationPatch } from './coronation';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function executeNormalAction(
  get: StateGetter,
  set: StateSetter,
  action: Action
): void {
  let newPlayers = [...get().players];
  const actorIdx = newPlayers.findIndex(p => p.id === action.actorId);
  if (actorIdx === -1) return;
  let actor = newPlayers[actorIdx];

  let rumorVictimId: string | null = null;

  if (action.name.includes('Просить') || action.name.includes('содержание')) {
    actor = { ...actor, gold: actor.gold + 1 };
    newPlayers[actorIdx] = actor;
    triggerResourceFloat(set, actor.id, '+1 🪙', true);
  } else if (action.name.includes('Пир') || action.name.includes('пир')) {
    if (actor.favor < 5) {
      actor = { ...actor, favor: actor.favor + 1 };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, actor.id, '+1 👑', true);
    }
  } else if (action.name.includes('Слух') || action.name.includes('слух')) {
    if (action.targetId) {
      const targetIdx = newPlayers.findIndex(p => p.id === action.targetId);
      if (targetIdx !== -1 && newPlayers[targetIdx].favor > 0) {
        newPlayers[targetIdx] = { ...newPlayers[targetIdx], favor: newPlayers[targetIdx].favor - 1 };
        triggerResourceFloat(set, action.targetId, '-1 👑', false);
        rumorVictimId = action.targetId;

        if (get().coronationCandidateId === action.targetId && newPlayers[targetIdx].favor < 6) {
          set(state => ({
            ...fallenCoronationPatch(state.coronationCandidateId, action.targetId!, newPlayers[targetIdx].favor),
            history: [`⚖️ Коронация ${newPlayers[targetIdx].name} сорвана слухами! Влияние упало ниже 6 👑!`, ...state.history].slice(0, 50)
          }));
        }
      }
    }
  } else if (action.name.includes('Сменить') || action.name.includes('сменить')) {
    const rawIndices: number[] = (action.stakedCardIndices && action.stakedCardIndices.length > 0)
      ? action.stakedCardIndices
      : [action.stakedCardIndex ?? 0];

    // Filter valid indices within actor.hand and ensure uniqueness
    const uniqueIndices = Array.from(new Set(rawIndices.filter(idx => idx >= 0 && idx < actor.hand.length)));
    const finalIndices = uniqueIndices.length > 0 ? uniqueIndices : (actor.hand.length > 0 ? [0] : []);

    if (finalIndices.length > 0) {
      const returnedCards = finalIndices.map(idx => actor.hand[idx]);
      const newDiscard = [...get().discardPile, ...returnedCards];

      const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } = drawCardsFromDeck(finalIndices.length, get().deck, newDiscard);

      const newHand = [...actor.hand];
      finalIndices.forEach((idx, i) => {
        newHand[idx] = drawn[i] || 'Наследник';
      });

      actor = { ...actor, hand: newHand };
      newPlayers[actorIdx] = actor;
      botMemory.invalidatePlayerHand(actor.id);

      const count = finalIndices.length;
      const countStr = count === 1 ? '1 карту' : '2 карты';
      const drawnCardsStr = drawn.map(c => `«${c}»`).join(', ');
      const drawNotice = actor.id === 'p1' ? ` (получено: ${drawnCardsStr})` : '';
      const reshuffleNotice = wasReshuffled ? ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.` : '';

      set(state => ({
        deck: newDeck,
        discardPile: newDiscardPile,
        players: newPlayers,
        history: [`🔄 ${actor.name} сбросил ${countStr} и бесплатно взял ${count === 1 ? 'новую' : 'новые'} из колоды${drawNotice}.${reshuffleNotice}`, ...state.history].slice(0, 50)
      }));
    }
  }

  set({ players: newPlayers });
  if (rumorVictimId) {
    get()._disruptPlayerPlotsOnLoss(rumorVictimId, 'распущенных слухов');
  }

  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, ACTION_HOLD_MS);
}
