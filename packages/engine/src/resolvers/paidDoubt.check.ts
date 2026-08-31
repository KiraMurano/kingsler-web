/**
 * Проверку «НЕ ВЕРЮ!» можно оплатить золотом, когда жетона нет. «Платная
 * проверка» открывает это всем, «Срыв масок» — только жертве атаки Вора или
 * Шантажиста. Жетон всегда приоритетнее золота.
 * Run: npx tsx packages/engine/src/resolvers/paidDoubt.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, Player } from '../types.ts';
import { doubtPayment } from './doubtResolver.ts';
import { DEFAULT_RULES, normalizeRules } from '../rules.ts';

function player(partial: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: partial.id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 10,
    favor: 2,
    seals: 0,
    actionTokens: 0,
    hand: [],
    activePlot: null,
    ...partial
  };
}

const attackOn = (targetId: string, roleClaim: 'Вор' | 'Шантажист' | 'Наследник'): Action => ({
  id: 'a1',
  type: 'role',
  name: roleClaim,
  actorId: 'attacker',
  targetId,
  roleClaim,
  costGold: 0,
  costTokens: 1,
  description: ''
});

const victim = () => player({ id: 'v' });
const bystander = () => player({ id: 'b' });

// --- 1. Жетон всегда приоритетнее золота ---
{
  const rules = normalizeRules({ paidDoubtEnabled: true, paidDoubtCost: 3 });
  const withToken = player({ id: 'v', actionTokens: 2, gold: 10 });
  assert.deepEqual(
    doubtPayment(rules, withToken, attackOn('v', 'Шантажист')),
    { tokens: 1, gold: 0 },
    'есть жетон — платит жетон, золото не трогается'
  );
}

// --- 2. Без жетона проверка покупается золотом ---
{
  assert.deepEqual(
    doubtPayment(DEFAULT_RULES, victim(), attackOn('v', 'Шантажист')),
    { tokens: 0, gold: 2 },
    'по умолчанию проверку можно купить за 2 🪙'
  );
}

// --- 3. Платная проверка: доступна всем ---
{
  const rules = normalizeRules({ paidDoubtEnabled: true, paidDoubtCost: 4 });
  assert.deepEqual(
    doubtPayment(rules, victim(), attackOn('v', 'Шантажист')),
    { tokens: 0, gold: 4 },
    'жертва платит'
  );
  assert.deepEqual(
    doubtPayment(rules, bystander(), attackOn('v', 'Шантажист')),
    { tokens: 0, gold: 4 },
    'посторонний тоже платит — правило про любую проверку'
  );
  assert.deepEqual(
    doubtPayment(rules, bystander(), attackOn('v', 'Наследник')),
    { tokens: 0, gold: 4 },
    'и роль неважна'
  );
}

// --- 4. Платная проверка: не хватает золота ---
{
  const rules = normalizeRules({ paidDoubtEnabled: true, paidDoubtCost: 6 });
  assert.equal(
    doubtPayment(rules, player({ id: 'v', gold: 5 }), attackOn('v', 'Шантажист')),
    null,
    'на рубль меньше — проверки нет'
  );
  assert.deepEqual(
    doubtPayment(rules, player({ id: 'v', gold: 6 }), attackOn('v', 'Шантажист')),
    { tokens: 0, gold: 6 },
    'ровно хватает — можно'
  );
}

// --- 5. Срыв масок: только жертва атаки Вора или Шантажиста ---
{
  const rules = normalizeRules({ paidDoubtEnabled: false, unmaskEnabled: true, unmaskCost: 2 });
  assert.deepEqual(
    doubtPayment(rules, victim(), attackOn('v', 'Шантажист')),
    { tokens: 0, gold: 2 },
    'жертва Шантажиста срывает маску'
  );
  assert.deepEqual(
    doubtPayment(rules, victim(), attackOn('v', 'Вор')),
    { tokens: 0, gold: 2 },
    'жертва Вора тоже'
  );
  assert.equal(
    doubtPayment(rules, bystander(), attackOn('v', 'Шантажист')),
    null,
    'посторонний маску не срывает — это не его атака'
  );
  assert.equal(
    doubtPayment(rules, victim(), attackOn('v', 'Наследник')),
    null,
    'Наследник не атака — срывать нечего'
  );
}

// --- 6. Правила взаимоисключающие ---
{
  const rules = normalizeRules({ paidDoubtEnabled: true, unmaskEnabled: true, paidDoubtCost: 3, unmaskCost: 9 });
  assert.equal(rules.unmaskEnabled, false, 'платная проверка погасила срыв масок');
  assert.deepEqual(
    doubtPayment(rules, bystander(), attackOn('v', 'Шантажист')),
    { tokens: 0, gold: 3 },
    'работает цена платной проверки, а не срыва масок'
  );
}

console.log('paidDoubt.check: ok');
