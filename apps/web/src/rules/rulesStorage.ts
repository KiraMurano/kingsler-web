/**
 * Правила партии с ботами переживают перезагрузку.
 *
 * Хранилище — вспомогательное и ненадёжное по определению: приватное окно,
 * очищенные данные сайта, браузер с запретом на site data. Поэтому чтение
 * никогда не бросает и всегда возвращает валидные правила: битый JSON, чужая
 * схема и отсутствие `localStorage` дают дефолты, а не белый экран.
 */
import type { GameRules } from '@kinglier/engine/rules';
import { DEFAULT_RULES, normalizeRules } from '@kinglier/engine/rules';

export const RULES_STORAGE_KEY = 'kinglier.rules.v1';
export const PRESETS_STORAGE_KEY = 'kinglier.rules.presets.v1';

/** Сохранённый набор правил: понравившийся баланс под именем. */
export interface RulesPreset {
  id: string;
  name: string;
  /** Абсолютное время сохранения — список сортируется свежими вперёд. */
  savedAt: number;
  rules: GameRules;
}

/** Больше их и не нужно: список выбирают глазами, а не поиском. */
export const MAX_PRESETS = 12;

/** Минимальный контракт хранилища — чтобы тест не зависел от браузера. */
export interface RulesStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): RulesStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Браузер может бросать на самом обращении к localStorage.
    return null;
  }
}

export function loadRules(store: RulesStore | null = browserStore()): GameRules {
  if (!store) return DEFAULT_RULES;
  try {
    const raw = store.getItem(RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_RULES;
    /* Всё, что пришло из хранилища, проходит нормализацию: там могли остаться
       правила прошлой версии игры, с другими картами и другими диапазонами. */
    return normalizeRules(JSON.parse(raw));
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveRules(rules: GameRules, store: RulesStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Квота или запрет на запись — настройки просто не переживут перезагрузку.
  }
}

/**
 * Сохранённые наборы правил.
 *
 * Читается так же терпимо, как и текущие правила: список мог быть записан
 * прошлой версией игры, и одна битая запись не должна прятать остальные.
 * Правила каждого набора прогоняются через `normalizeRules` — карт в игре
 * могло стать больше, а диапазоны могли сузиться.
 */
export function listPresets(store: RulesStore | null = browserStore()): RulesPreset[] {
  if (!store) return [];
  let raw: unknown;
  try {
    const text = store.getItem(PRESETS_STORAGE_KEY);
    if (!text) return [];
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const presets: RulesPreset[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Partial<RulesPreset>;
    if (typeof e.id !== 'string' || typeof e.name !== 'string') continue;
    presets.push({
      id: e.id,
      name: e.name,
      savedAt: typeof e.savedAt === 'number' && Number.isFinite(e.savedAt) ? e.savedAt : 0,
      rules: normalizeRules(e.rules)
    });
  }
  return presets.sort((a, b) => b.savedAt - a.savedAt);
}

function writePresets(presets: RulesPreset[], store: RulesStore | null): void {
  if (!store) return;
  try {
    store.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Квота или запрет на запись — набор просто не сохранится.
  }
}

/**
 * Сохраняет набор под именем. Одноимённый набор перезаписывается: игрок,
 * повторно сохраняющий «Быстрая партия», правит свой набор, а не плодит
 * четыре одинаковых строки в списке.
 *
 * @returns сохранённый набор, либо `null`, если имя пустое.
 */
export function savePreset(
  name: string,
  rules: GameRules,
  store: RulesStore | null = browserStore(),
  now: number = Date.now()
): RulesPreset | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing = listPresets(store);
  const sameName = existing.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
  const preset: RulesPreset = {
    id: sameName?.id ?? `p${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    savedAt: now,
    rules: normalizeRules(rules)
  };

  const rest = existing.filter(p => p.id !== preset.id);
  writePresets([preset, ...rest].slice(0, MAX_PRESETS), store);
  return preset;
}

export function deletePreset(id: string, store: RulesStore | null = browserStore()): void {
  writePresets(listPresets(store).filter(p => p.id !== id), store);
}
