/**
 * Хранилище правил ненадёжно по определению: приватное окно, очищенные данные,
 * правила прошлой версии игры. Ни один из этих случаев не должен ронять вход в
 * партию.
 * Run: npx tsx apps/web/src/rules/rulesStorage.check.ts
 */
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '@kinglier/engine/rules';
import {
  MAX_PRESETS,
  PRESETS_STORAGE_KEY,
  RULES_STORAGE_KEY,
  deletePreset,
  listPresets,
  loadRules,
  savePreset,
  saveRules,
  type RulesStore
} from './rulesStorage.ts';

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

// ==========================================================================
// Сохранённые наборы правил
// ==========================================================================

// --- 7. Пустое хранилище — пустой список ---
{
  assert.deepEqual(listPresets(memoryStore()), []);
  assert.deepEqual(listPresets(null), []);
}

// --- 8. Сохранение и чтение набора ---
{
  const store = memoryStore();
  const saved = savePreset('Быстрая партия', { ...DEFAULT_RULES, crownsToWin: 3 }, store, 1000);
  assert.ok(saved);
  assert.equal(saved!.name, 'Быстрая партия');

  const list = listPresets(store);
  assert.equal(list.length, 1);
  assert.equal(list[0].rules.crownsToWin, 3);
  assert.equal(list[0].savedAt, 1000);
}

// --- 9. Свежие наборы идут первыми ---
{
  const store = memoryStore();
  savePreset('Старый', DEFAULT_RULES, store, 100);
  savePreset('Новый', DEFAULT_RULES, store, 900);
  assert.deepEqual(listPresets(store).map(p => p.name), ['Новый', 'Старый']);
}

// --- 10. Одноимённый набор перезаписывается, а не дублируется ---
{
  const store = memoryStore();
  const first = savePreset('Мой баланс', { ...DEFAULT_RULES, crownsToWin: 3 }, store, 100);
  const second = savePreset('  мой баланс  ', { ...DEFAULT_RULES, crownsToWin: 9 }, store, 200);
  const list = listPresets(store);
  assert.equal(list.length, 1, 'регистр и пробелы не плодят дубли');
  assert.equal(list[0].rules.crownsToWin, 9, 'набор обновился');
  assert.equal(second!.id, first!.id, 'id сохранён — это тот же набор');
  assert.equal(list[0].name, 'мой баланс', 'имя берётся из последнего сохранения, без пробелов');
}

// --- 11. Пустое имя не сохраняется ---
{
  const store = memoryStore();
  assert.equal(savePreset('   ', DEFAULT_RULES, store), null);
  assert.deepEqual(listPresets(store), []);
}

// --- 12. Список не растёт бесконечно ---
{
  const store = memoryStore();
  for (let i = 0; i < MAX_PRESETS + 5; i++) {
    savePreset(`Набор ${i}`, DEFAULT_RULES, store, 1000 + i);
  }
  const list = listPresets(store);
  assert.equal(list.length, MAX_PRESETS, 'старые вытесняются');
  assert.equal(list[0].name, `Набор ${MAX_PRESETS + 4}`, 'самый свежий остаётся');
}

// --- 13. Удаление ---
{
  const store = memoryStore();
  const a = savePreset('А', DEFAULT_RULES, store, 100)!;
  savePreset('Б', DEFAULT_RULES, store, 200);
  deletePreset(a.id, store);
  assert.deepEqual(listPresets(store).map(p => p.name), ['Б']);
}

// --- 14. Битый список не роняет, а одна битая запись не прячет остальные ---
{
  assert.deepEqual(listPresets(memoryStore({ [PRESETS_STORAGE_KEY]: '{не json' })), []);
  assert.deepEqual(listPresets(memoryStore({ [PRESETS_STORAGE_KEY]: '{}' })), [], 'не массив — пусто');

  const mixed = JSON.stringify([
    null,
    { id: 'x' },
    { name: 'без id' },
    { id: 'ok', name: 'Годный', savedAt: 5, rules: { crownsToWin: 99 } }
  ]);
  const list = listPresets(memoryStore({ [PRESETS_STORAGE_KEY]: mixed }));
  assert.equal(list.length, 1, 'битые записи пропущены, годная осталась');
  assert.equal(list[0].rules.crownsToWin, 10, 'правила набора тоже нормализуются');
  assert.equal(list[0].rules.actionTokens, DEFAULT_RULES.actionTokens, 'недостающее берёт дефолт');
}

// --- 15. Работа без хранилища не бросает и ничего не теряет ---
{
  savePreset('А', DEFAULT_RULES, null);
  deletePreset('x', null);
  assert.deepEqual(listPresets(null), [], 'без хранилища список пуст, но игра жива');
}

// --- 16. Хранилище, которое бросает на записи ---
{
  const throwing: RulesStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceeded');
    }
  };
  savePreset('А', DEFAULT_RULES, throwing);
  deletePreset('x', throwing);
}

console.log('rulesStorage.check: ok');
