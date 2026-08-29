/**
 * Модалка настроек и диалог сохранения набора: структура, а не вёрстка.
 * Держит то, что легко сломать при перестановке — кнопки старта и загрузки на
 * месте, пустой список объясняет себя, сводка набора показывает те правила,
 * которые сохраняют.
 * Run: npx tsx apps/web/src/rules/RulesDialog.check.ts
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_RULES } from '@kinglier/engine/rules';
import { RulesDialog } from './RulesDialog.tsx';
import { SavePresetDialog } from './SavePresetDialog.tsx';

/* Компоненты читают localStorage через `globalThis`. В node его нет, и это
   ровно тот случай, который хранилище обязано пережить молча. */

// --- 1. Закрытая модалка ничего не рисует ---
{
  const html = renderToStaticMarkup(
    React.createElement(RulesDialog, { open: false, onClose: () => {}, onStart: () => {} })
  );
  assert.equal(html, '', 'закрытый диалог не рисует ничего');
}

// --- 2. Открытая модалка: правила, старт и загрузка ---
{
  const html = renderToStaticMarkup(
    React.createElement(RulesDialog, { open: true, onClose: () => {}, onStart: () => {} })
  );
  assert.ok(html.includes('Правила партии'), 'заголовок на месте');
  assert.ok(html.includes('Корон для победы'), 'редактор правил внутри');
  assert.ok(html.includes('Начать игру'), 'кнопка старта на месте');
  assert.ok(html.includes('Загрузить настройки'), 'кнопка загрузки на месте');
  assert.ok(html.includes('ruleswrap__foot'), 'подвал вынесен из прокрутки');
}

// --- 3. Диалог сохранения: поле, сводка и кнопка ---
{
  const html = renderToStaticMarkup(
    React.createElement(SavePresetDialog, {
      open: true,
      rules: { ...DEFAULT_RULES, crownsToWin: 7, actionTokens: 4, feastCost: 2, rumorCost: 9 },
      onClose: () => {}
    })
  );
  assert.ok(html.includes('Сохранить настройки'), 'заголовок на месте');
  assert.ok(html.includes('Название набора'), 'есть поле имени');
  assert.ok(html.includes('7 👑'), 'сводка показывает порог победы');
  assert.ok(html.includes('4 ⚡'), 'и число жетонов');
  assert.ok(html.includes('пир 2 🪙'), 'и цену пира');
  assert.ok(html.includes('слух 9 🪙'), 'и цену слуха');
}

// --- 4. Закрытый диалог сохранения молчит ---
{
  const html = renderToStaticMarkup(
    React.createElement(SavePresetDialog, { open: false, rules: DEFAULT_RULES, onClose: () => {} })
  );
  assert.equal(html, '');
}

console.log('RulesDialog.check: ok');
