/**
 * Модалка настроек и диалог сохранения набора: структура, а не вёрстка.
 * Держит то, что легко сломать при перестановке — кнопки старта и загрузки на
 * месте в ОБЕИХ модалках, вложенной прокрутки нет, пустой список объясняет
 * себя, сводка набора показывает те правила, которые сохраняют.
 * Run: npx tsx apps/web/src/rules/RulesDialog.check.ts
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_RULES } from '@kinglier/engine/rules';
import { RulesDialog } from './RulesDialog.tsx';
import { SavePresetDialog } from './SavePresetDialog.tsx';
import { LobbyRulesDialog } from '../online/LobbyRulesDialog.tsx';

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
  const startAt = html.indexOf('Начать игру');
  const rulesAt = html.indexOf('Корон для победы');
  assert.ok(startAt >= 0 && startAt < rulesAt, 'старт стоит над списком правил');
  assert.ok(html.includes('ruleswrap__foot'), 'загрузка наборов в конце списка');
  /* Вложенного скроллера у списка правил нет: он обрезал содержимое по краю
     внутреннего отступа, с зазором от рамки. Крутится диалог целиком —
     `.overlay__body` со своим отступом внутри прокрутки. */
  assert.ok(!html.includes('ruleswrap__scroll'), 'вложенной прокрутки не осталось');
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

/* --- Загрузка наборов есть и в лобби ---
 *
 * Сохранённый баланс нужен там же, где настройки вообще правят. Пока список
 * жил внутри модалки игры с ботами, в лобби его не было вовсе — хост крутил
 * ползунки руками, имея под рукой сохранённый набор. */
{
  const html = renderToStaticMarkup(
    React.createElement(LobbyRulesDialog, {
      open: true,
      rules: DEFAULT_RULES,
      onChange: () => {},
      onClose: () => {}
    })
  );
  assert.ok(html.includes('Настройки игры'), 'заголовок на месте');
  assert.ok(html.includes('Загрузить настройки'), 'загрузка наборов есть и здесь');
  assert.ok(html.includes('Корон для победы'), 'и сам редактор правил');
  assert.ok(html.includes('Готово'), 'кнопка закрывает, а не стартует партию');
  assert.ok(!html.includes('Начать игру'), 'старт живёт в лобби, а не в настройках');
  assert.ok(!html.includes('ruleswrap__scroll'), 'и здесь вложенной прокрутки нет');
}

console.log('RulesDialog.check: ok');
