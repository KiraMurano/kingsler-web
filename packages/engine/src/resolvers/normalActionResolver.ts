import type { Action, CardId, GameState } from '../types';
import { byId } from '../cardInstance';
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
    const rawIds: CardId[] = (action.stakedCardIds && action.stakedCardIds.length > 0)
      ? action.stakedCardIds
      : (action.stakedCardId ? [action.stakedCardId] : []);

    // Keep only ids the actor really holds, without repeats.
    const uniqueIds = Array.from(new Set(rawIds)).filter(id => byId(actor.hand, id));
    const finalIds = uniqueIds.length > 0
      ? uniqueIds
      : (actor.hand.length > 0 ? [actor.hand[0].id] : []);

    if (finalIds.length > 0) {
      // Exchanged cards keep their slot: each id is plucked and the drawn
      // instance takes its place, so the untouched card never shifts.
      const returnedCards = finalIds
        .map(id => byId(actor.hand, id))
        .filter((c): c is NonNullable<typeof c> => !!c);
      const newDiscard = [...get().discardPile, ...returnedCards];

      const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } = drawCardsFromDeck(finalIds.length, get().deck, newDiscard);

      let newHand = [...actor.hand];
      finalIds.forEach((id, i) => {
        const slot = newHand.findIndex(c => c.id === id);
        if (slot === -1) return;
        if (drawn[i]) newHand[slot] = drawn[i];
        else newHand = [...newHand.slice(0, slot), ...newHand.slice(slot + 1)];
      });

      actor = { ...actor, hand: newHand };
      newPlayers[actorIdx] = actor;
      botMemory.invalidatePlayerHand(actor.id);

      const count = finalIds.length;
      const countStr = count === 1 ? '1 карту' : '2 карты';
      const drawnCardsStr = drawn.map(c => `«${c.card}»`).join(', ');
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
