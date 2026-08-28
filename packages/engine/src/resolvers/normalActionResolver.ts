import type { Action, CardId, GameState } from '../types';
import { byId } from '../cardInstance';
import { drawCardsFromDeck } from '../cards';
import { botMemory } from '../Bot';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS, EXCHANGE_DRAW_MS } from '../timing';
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
      /*
       * Обмен идёт в два такта, а не в один.
       *
       * Раньше карта уходила в сброс и новая появлялась в руке в одном и том
       * же кадре состояния. Слой карт пружинил обе одновременно, и на столе
       * это читалось одним смазанным движением вместо двух — «сбросил» и
       * «взял». Такт 1 отдаёт карты в сброс, такт 2 через `EXCHANGE_DRAW_MS`
       * добирает из колоды. Между тактами рука честно короче: перепись карт
       * сходится в обеих точках, ни одна карта не висит в воздухе.
       */
      const returnedCards = finalIds
        .map(id => byId(actor.hand, id))
        .filter((c): c is NonNullable<typeof c> => !!c);

      const count = finalIds.length;
      const countStr = count === 1 ? '1 карту' : '2 карты';

      // Такт 1: карты уходят в сброс.
      actor = { ...actor, hand: actor.hand.filter(c => !finalIds.includes(c.id)) };
      newPlayers[actorIdx] = actor;
      botMemory.invalidatePlayerHand(actor.id);
      set(state => ({
        players: newPlayers,
        discardPile: [...state.discardPile, ...returnedCards]
      }));

      // Такт 2: добор. Колода и сброс читаются заново — сброс уже пополнен, и
      // если колода истощится, перемешивать будут вместе со сброшенным.
      const actorName = actor.name;
      timerManager.scheduleDelay(() => {
        const now = get();
        const idx = now.players.findIndex(p => p.id === action.actorId);
        if (idx === -1) return;

        const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } =
          drawCardsFromDeck(count, now.deck, now.discardPile);

        const drawnPlayers = [...now.players];
        drawnPlayers[idx] = { ...drawnPlayers[idx], hand: [...drawnPlayers[idx].hand, ...drawn] };
        botMemory.invalidatePlayerHand(action.actorId);

        const drawnCardsStr = drawn.map(c => `«${c.card}»`).join(', ');
        const drawNotice = action.actorId === 'p1' ? ` (получено: ${drawnCardsStr})` : '';
        const reshuffleNotice = wasReshuffled ? ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.` : '';

        set(state => ({
          deck: newDeck,
          discardPile: newDiscardPile,
          players: drawnPlayers,
          history: [`🔄 ${actorName} сбросил ${countStr} и бесплатно взял ${count === 1 ? 'новую' : 'новые'} из колоды${drawNotice}.${reshuffleNotice}`, ...state.history].slice(0, 50)
        }));

        // Остаток общей паузы, а не полная: ход целиком не удлиняется.
        timerManager.scheduleDelay(() => {
          get()._checkEndgameAndAdvanceTurn();
        }, Math.max(0, ACTION_HOLD_MS - EXCHANGE_DRAW_MS));
      }, EXCHANGE_DRAW_MS);
      return;
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
