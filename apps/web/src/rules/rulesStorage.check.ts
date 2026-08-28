/**
 * Хранилище правил ненадёжно по определению: приватное окно, очищенные данные,
 * правила прошлой версии игры. Ни один из этих случаев не должен ронять вход в
 * партию.
 * Run: npx tsx apps/web/src/rules/rulesStorage.check.ts
 */
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '@kinglier/engine/rules';
import { RULES_STORAGE_KEY, loadRules, saveRules, type RulesStore } from './rulesStorage.ts';

function memoryStore(seed: Record<string, string> = {}): RulesStore {
  const data = { ...seed };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    }
  };
}

// --- 1. Пустое хранилище даёт дефолты ---
{
  assert.deepEqual(loadRules(memoryStore()), DEFAULT_RULES);
}

// --- 2. Сохранение и чтение ---
{
  const store = memoryStore();
  saveRules({ ...DEFAULT_RULES, crownsToWin: 8, vetoOnVeto: true }, store);
  const back = loadRules(store);
  assert.equal(back.crownsToWin, 8);
  assert.equal(back.vetoOnVeto, true);
  assert.equal(back.actionTokens, DEFAULT_RULES.actionTokens);
}

// --- 3. Битый JSON не роняет ---
{
  assert.deepEqual(loadRules(memoryStore({ [RULES_STORAGE_KEY]: '{не json' })), DEFAULT_RULES);
  assert.deepEqual(loadRules(memoryStore({ [RULES_STORAGE_KEY]: 'null' })), DEFAULT_RULES);
  assert.deepEqual(loadRules(memoryStore({ [RULES_STORAGE_KEY]: '[]' })), DEFAULT_RULES);
}

// --- 4. Правила прошлой версии нормализуются ---
{
  const stale = JSON.stringify({ crownsToWin: 999, actionTokens: -1, deck: { 'Гидра': 3 } });
  const rules = loadRules(memoryStore({ [RULES_STORAGE_KEY]: stale }));
  assert.equal(rules.crownsToWin, 10, 'выход за диапазон зажат');
  assert.equal(rules.actionTokens, 1);
  assert.ok(!('Гидра' in rules.deck), 'карты, которой нет в игре, в правилах не остаётся');
  assert.equal(rules.deck['Наследник'], DEFAULT_RULES.deck['Наследник'], 'пропущенные карты берут дефолт');
}

// --- 5. Отсутствие хранилища не роняет ---
{
  assert.deepEqual(loadRules(null), DEFAULT_RULES);
  saveRules(DEFAULT_RULES, null); // не должно бросить
}

// --- 6. Хранилище, которое бросает на записи ---
{
  const throwing: RulesStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceeded');
    }
  };
  saveRules(DEFAULT_RULES, throwing); // не должно бросить
}

console.log('rulesStorage.check: ok');
