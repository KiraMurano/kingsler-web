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
