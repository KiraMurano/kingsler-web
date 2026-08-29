/**
 * Обмен карт идёт в два такта: сначала сброс, потом добор.
 *
 * Раньше оба движения происходили в одном `set`: карта уходила в сброс и
 * новая появлялась в руке в одном и том же кадре состояния. Слой карт
 * пружинил обе одновременно, и на столе это читалось как одно смазанное
 * движение вместо двух — «сбросил» и «взял».
 *
 * Перепись карт обязана сходиться в каждой из точек: между тактами карты
 * лежат в сбросе, а рука короче — но ни одна карта не исчезла и не удвоилась.
 *
 * И начинается всё это в тот же миг, что и нажатие: общей паузы перед
 * действием у обмена нет, читать в ней нечего.
 *
 * Run: npx tsx packages/engine/src/resolvers/cardExchange.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from '../types.ts';
import { mintDeck } from '../cardInstance.ts';
import { useGameStore } from '../GameStore.ts';
import { EXCHANGE_DRAW_MS } from '../timing.ts';
import { assertCardCensus } from './cardCensus.check.ts';

function seat(id: string, hand: GameCard[], isBot = false): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: 1,
    isBot,
    gold: 2,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(hand).map(c => ({ ...c, id: `${id}-${c.id}` })),
    activePlot: null
  };
}

useGameStore.getState().startGame();
const deck = mintDeck(['Вор', 'Шут', 'Рыцарь', 'Казначей']).map(c => ({ ...c, id: `d-${c.id}` }));
useGameStore.setState({
  players: [seat('p1', ['Наследник', 'Шантажист']), seat('p2', ['Рыцарь', 'Казначей'], true)],
  deck,
  discardPile: [],
  activePlayerId: 'p1',
  opening: null
});

const before = useGameStore.getState();
const allIds = [
  ...before.players.flatMap(p => p.hand.map(c => c.id)),
  ...before.deck.map(c => c.id)
];
const dropped = before.players[0].hand.map(c => c.id);
assertCardCensus(useGameStore.getState(), allIds, 'до обмена');

useGameStore.getState().performAction({
  type: 'normal',
  name: 'Сменить 2 карты',
  stakedCardIds: dropped,
  actorId: 'p1',
  costGold: 0,
  costTokens: 1,
  description: 'Сбросил обе карты и взял две новые.'
});

// --- Такт 1: карты уже в сбросе, рука ещё пуста. Сразу, без паузы. ---
{
  const s = useGameStore.getState();
  const hand = s.players.find(p => p.id === 'p1')!.hand;
  assert.deepEqual(
    dropped.filter(id => s.discardPile.some(d => d.id === id)),
    dropped,
    'сброшенные карты лежат в сбросе сразу'
  );
  assert.equal(hand.length, 0, 'добор ещё не случился — рука пуста');
  assertCardCensus(s, allIds, 'между сбросом и добором');
}

await new Promise(resolve => setTimeout(resolve, EXCHANGE_DRAW_MS + 300));

// --- Такт 2: рука добрана, сброс не тронут. ---
{
  const s = useGameStore.getState();
  const hand = s.players.find(p => p.id === 'p1')!.hand;
  assert.equal(hand.length, 2, 'рука добрана до двух карт');
  assert.equal(
    hand.filter(c => dropped.includes(c.id)).length,
    0,
    'добраны новые карты, а не те же самые'
  );
  assert.deepEqual(
    dropped.filter(id => s.discardPile.some(d => d.id === id)),
    dropped,
    'сброшенные так и остались в сбросе'
  );
  assertCardCensus(s, allIds, 'после добора');
}

console.log('cardExchange.check: ok');
