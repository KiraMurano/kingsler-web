import type { Action, GameState } from '../types';
import { drawCardsFromDeck } from '../cards';
import { botMemory } from '../Bot';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';

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

  if (action.name.includes('Просить') || action.name.includes('содержание')) {
    actor = { ...actor, gold: actor.gold + 1 };
    newPlayers[actorIdx] = actor;
    triggerResourceFloat(set, actor.id, '+1 💰', true);
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

        get()._disruptPlayerPlotsOnLoss(action.targetId, 'распущенных слухов');

        if (get().coronationCandidateId === action.targetId && newPlayers[targetIdx].favor < 6) {
          set(state => ({
            coronationCandidateId: null,
            history: [`⚖️ Коронация ${newPlayers[targetIdx].name} сорвана слухами! Влияние упало ниже 6 👑!`, ...state.history].slice(0, 50)
          }));
        }
      }
    }
  } else if (action.name.includes('Сменить') || action.name.includes('сменить')) {
    const cardIdx = action.stakedCardIndex ?? 0;
    const returnedCard = actor.hand[cardIdx] || actor.hand[0];

    const newDiscard = [...get().discardPile, returnedCard];
    const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } = drawCardsFromDeck(1, get().deck, newDiscard);
    const newCard = drawn[0] || 'Наследник';

    const newHand = [...actor.hand];
    newHand[cardIdx] = newCard;
    actor = { ...actor, hand: newHand };
    newPlayers[actorIdx] = actor;
    botMemory.invalidatePlayerHand(actor.id);

    const drawNotice = actor.id === 'p1' ? ` (получена новая карта: «${newCard}»)` : '';
    const reshuffleNotice = wasReshuffled ? ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.` : '';

    set(state => ({
      deck: newDeck,
      discardPile: newDiscardPile,
      players: newPlayers,
      history: [`🔄 ${actor.name} сбросил карту и бесплатно взял новую из колоды${drawNotice}.${reshuffleNotice}`, ...state.history].slice(0, 50)
    }));
  }

  set({ players: newPlayers });

  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, 1200);
}
