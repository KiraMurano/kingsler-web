/**
 * Колода собирается по правилам партии, а правила доезжают до клиентов вместе
 * с остальным состоянием — отдельного канала для них нет.
 * Run: npx tsx packages/engine/src/rules.deck.check.ts
 */
import assert from 'node:assert/strict';
import { createInitialDeck, CARD_COPIES_MAP } from './cards.ts';
import { ALL_CARDS, DEFAULT_RULES, deckSize, normalizeRules } from './rules.ts';
import { useGameStore } from './GameStore.ts';
import { toGameStateData } from './net/gameStateData.ts';
import { redactStateForPlayer } from './net/redaction.ts';
import { timerManager } from './utils/timerManager.ts';

// --- 1. Без аргумента — сегодняшний состав ---
{
  const deck = createInitialDeck();
  assert.equal(deck.length, 50);
  for (const card of ALL_CARDS) {
    assert.equal(
      deck.filter(c => c.card === card).length,
      CARD_COPIES_MAP[card],
      `«${card}» без правил собирается по CARD_COPIES_MAP`
    );
  }
}

// --- 2. Дефолтные правила дают ту же колоду ---
{
  const deck = createInitialDeck(DEFAULT_RULES.deck);
  assert.equal(deck.length, deckSize(DEFAULT_RULES));
  assert.equal(deck.length, 50);
}

// --- 3. Ноль копий убирает карту целиком ---
{
  const rules = normalizeRules({ deck: { ...DEFAULT_RULES.deck, 'Право вето': 0, 'Чёрная книга': 0 } });
  const deck = createInitialDeck(rules.deck);
  assert.equal(deck.filter(c => c.card === 'Право вето').length, 0, 'вето вычищено');
  assert.equal(deck.filter(c => c.card === 'Чёрная книга').length, 0, 'чёрная книга вычищена');
  assert.equal(deck.length, 50 - 6 - 2);
}

// --- 4. Кастомный состав собирается ровно как заказан ---
{
  const empty = {} as Record<string, number>;
  for (const card of ALL_CARDS) empty[card] = 0;
  const rules = normalizeRules({
    deck: { ...empty, 'Наследник': 10, 'Шантажист': 4, 'Право вето': 1 } as never
  });
  const deck = createInitialDeck(rules.deck);
  assert.equal(deck.length, 15);
  assert.equal(deck.filter(c => c.card === 'Наследник').length, 10);
  assert.equal(deck.filter(c => c.card === 'Шантажист').length, 4);
  assert.equal(deck.filter(c => c.card === 'Право вето').length, 1);
  assert.equal(new Set(deck.map(c => c.id)).size, deck.length, 'id уникальны');
}

// --- 5. startGame кладёт нормализованные правила в состояние ---
{
  useGameStore.getState().startGame(undefined, { crownsToWin: 99, feastCost: 7 });
  const state = useGameStore.getState();
  assert.equal(state.rules.crownsToWin, 10, 'выход за диапазон зажат на входе в движок');
  assert.equal(state.rules.feastCost, 7);
  assert.equal(state.rules.actionTokens, DEFAULT_RULES.actionTokens, 'незаданное берётся из дефолтов');
  timerManager.clearAll();
}

// --- 6. Колода партии собрана по этим правилам ---
{
  const empty = {} as Record<string, number>;
  for (const card of ALL_CARDS) empty[card] = 0;
  useGameStore.getState().startGame(undefined, {
    deck: { ...empty, 'Наследник': 20 } as never
  });
  const state = useGameStore.getState();
  assert.equal(state.rules.deck['Наследник'], 10, 'копии зажаты десяткой');
  // 10 карт минус 8 роздано в руки = 2 в колоде.
  assert.equal(state.deck.length + state.players.reduce((n, p) => n + p.hand.length, 0), 10);
  timerManager.clearAll();
}

// --- 7. Правила доезжают до клиента вместе с состоянием ---
{
  useGameStore.getState().startGame(undefined, { crownsToWin: 3, vetoOnVeto: true });
  const state = useGameStore.getState();
  const data = toGameStateData(state);
  assert.equal(data.rules.crownsToWin, 3, 'правила пережили toGameStateData');
  assert.equal(data.rules.vetoOnVeto, true);

  const viewerId = state.players[0].id;
  const publicState = redactStateForPlayer(data, viewerId);
  assert.equal(publicState.rules.crownsToWin, 3, 'правила пережили редакцию — они не секрет');
  assert.equal(publicState.rules.vetoOnVeto, true);
  timerManager.clearAll();
}

console.log('rules.deck.check: ok');
