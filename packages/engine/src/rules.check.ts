/**
 * Правила партии: дефолты, зажим диапазонов и причины отказа в старте.
 * `normalizeRules` — ещё и серверная валидация, поэтому мусор на входе она
 * обязана переваривать, а не падать.
 * Run: npx tsx packages/engine/src/rules.check.ts
 */
import assert from 'node:assert/strict';
import {
  ALL_CARDS,
  DEFAULT_RULES,
  MIN_DECK_SIZE,
  deckSize,
  normalizeRules,
  rulesProblems
} from './rules.ts';

// --- 1. Дефолты ---
{
  assert.equal(DEFAULT_RULES.crownsToWin, 5, 'порог победы по умолчанию — 5');
  assert.equal(DEFAULT_RULES.actionTokens, 2);
  assert.equal(DEFAULT_RULES.feastCost, 3);
  assert.equal(DEFAULT_RULES.rumorCost, 5);
  assert.equal(DEFAULT_RULES.blackmailCost, 0);
  assert.equal(DEFAULT_RULES.duelCostsToken, true);
  assert.equal(DEFAULT_RULES.vetoOnVeto, false);
  assert.equal(DEFAULT_RULES.unmaskEnabled, false);
  assert.equal(DEFAULT_RULES.paidDoubtEnabled, false);
  assert.equal(deckSize(DEFAULT_RULES), 51, 'дефолтная колода — сегодняшняя 51 карта');
}

// --- 2. Нормализация дефолтов идемпотентна ---
{
  assert.deepEqual(normalizeRules(DEFAULT_RULES), DEFAULT_RULES);
  assert.deepEqual(normalizeRules(undefined), DEFAULT_RULES, 'пустой вход даёт дефолты');
}

// --- 3. Зажим диапазонов с обеих сторон ---
{
  const low = normalizeRules({ crownsToWin: -4, actionTokens: 0, feastCost: 0, rumorCost: 0, blackmailCost: -2 });
  assert.equal(low.crownsToWin, 1);
  assert.equal(low.actionTokens, 1);
  assert.equal(low.feastCost, 1);
  assert.equal(low.rumorCost, 1);
  assert.equal(low.blackmailCost, 0, 'у шантажа нижняя граница 0, а не 1');

  const high = normalizeRules({ crownsToWin: 99, actionTokens: 99, blackmailCost: 99, paidDoubtCost: 99 });
  assert.equal(high.crownsToWin, 10);
  assert.equal(high.actionTokens, 10);
  assert.equal(high.blackmailCost, 10);
  assert.equal(high.paidDoubtCost, 10);
}

// --- 4. Мусор на входе не роняет ---
{
  for (const junk of [null, 'нет', 42, [], { crownsToWin: 'пять' }, { deck: 'вся' }]) {
    const rules = normalizeRules(junk);
    assert.equal(rules.crownsToWin, DEFAULT_RULES.crownsToWin, `мусор ${JSON.stringify(junk)} даёт дефолт`);
    assert.equal(deckSize(rules), 51);
  }
  const nan = normalizeRules({ crownsToWin: Number.NaN, feastCost: Number.POSITIVE_INFINITY });
  assert.equal(nan.crownsToWin, DEFAULT_RULES.crownsToWin, 'NaN не проходит');
  assert.equal(nan.feastCost, DEFAULT_RULES.feastCost, 'Infinity не проходит');
}

// --- 5. Дробные значения округляются ---
{
  const rules = normalizeRules({ crownsToWin: 4.6, actionTokens: 2.2 });
  assert.equal(rules.crownsToWin, 5);
  assert.equal(rules.actionTokens, 2);
}

// --- 6. Платная проверка гасит срыв масок ---
{
  const both = normalizeRules({ paidDoubtEnabled: true, unmaskEnabled: true });
  assert.equal(both.paidDoubtEnabled, true);
  assert.equal(both.unmaskEnabled, false, 'платная проверка — надмножество срыва масок');

  const unmaskOnly = normalizeRules({ paidDoubtEnabled: false, unmaskEnabled: true });
  assert.equal(unmaskOnly.unmaskEnabled, true, 'сам по себе срыв масок включается');
}

// --- 7. Состав колоды ---
{
  const noVeto = normalizeRules({ deck: { ...DEFAULT_RULES.deck, 'Право вето': 0 } });
  assert.equal(noVeto.deck['Право вето'], 0);
  assert.equal(deckSize(noVeto), 51 - 5, 'пять вето ушли из колоды');

  const clamped = normalizeRules({ deck: { ...DEFAULT_RULES.deck, 'Наследник': 99, 'Шут': -3 } });
  assert.equal(clamped.deck['Наследник'], 10);
  assert.equal(clamped.deck['Шут'], 0);

  // Неизвестные карты во входе игнорируются, известные не теряются.
  const withJunk = normalizeRules({ deck: { ...DEFAULT_RULES.deck, 'Дракон': 5 } as never });
  assert.equal(Object.keys(withJunk.deck).length, ALL_CARDS.length);
}

// --- 8. Причины отказа в старте ---
{
  assert.deepEqual(rulesProblems(DEFAULT_RULES), [], 'дефолты стартуют молча');

  const empty = {} as Record<string, number>;
  for (const card of ALL_CARDS) empty[card] = 0;
  const tiny = normalizeRules({ deck: { ...empty, 'Наследник': 7 } as never });
  assert.equal(deckSize(tiny), 7);
  const problems = rulesProblems(tiny);
  assert.equal(problems.length, 1, 'малая колода — ровно одна причина');
  assert.ok(problems[0].includes(String(MIN_DECK_SIZE)), 'в причине названо нужное число карт');

  const justEnough = normalizeRules({ deck: { ...empty, 'Наследник': 8 } as never });
  assert.deepEqual(rulesProblems(justEnough), [], `${MIN_DECK_SIZE} карт уже хватает`);
}

console.log('rules.check: ok');
