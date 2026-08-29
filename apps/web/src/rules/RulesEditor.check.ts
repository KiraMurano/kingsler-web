/**
 * Редактор правил рендерится без падений и показывает все настройки — включая
 * взаимоисключение «Платной проверки» и «Срыва масок», причину отказа в старте
 * и живой счётчик карт.
 *
 * Это не замена взгляду на экран: тест ловит структуру, а не вёрстку. Но он
 * держит то, что сломать легче всего — список правил, который обязан быть один
 * и тот же в модалке лобби и в модалке игры с ботами.
 * Run: npx tsx apps/web/src/rules/RulesEditor.check.ts
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_RULES, normalizeRules, ALL_CARDS } from '@kinglier/engine/rules';
import { RulesEditor } from './RulesEditor.tsx';

const render = (rules = DEFAULT_RULES) =>
  renderToStaticMarkup(React.createElement(RulesEditor, { rules, onChange: () => {} }));

// --- 1. Все именованные настройки на экране ---
{
  const html = render();
  for (const label of [
    'Корон для победы',
    'Жетонов хода',
    'Стоимость короны (пир)',
    'Стоимость роспуска слуха',
    'Стоимость шантажа',
    'Дуэль тратит жетон хода',
    'Вето на вето',
    'Платная проверка',
    'Срыв масок',
    'Состав колоды'
  ]) {
    assert.ok(html.includes(label), `на экране нет настройки «${label}»`);
  }
}

// --- 2. Счётчик карт живой ---
{
  assert.ok(render().includes('51 карт'), 'счётчик показывает размер колоды');

  const empty = {} as Record<string, number>;
  for (const card of ALL_CARDS) empty[card] = 0;
  const tiny = normalizeRules({ deck: { ...empty, 'Наследник': 3 } as never });
  const html = render(tiny);
  assert.ok(html.includes('3 карт'), 'счётчик пересчитывается');
}

// --- 3. Причина отказа показана текстом, а не молчанием ---
{
  const empty = {} as Record<string, number>;
  for (const card of ALL_CARDS) empty[card] = 0;
  const tiny = normalizeRules({ deck: { ...empty, 'Наследник': 3 } as never });
  const html = render(tiny);
  assert.ok(html.includes('ruleproblems'), 'блок причин отрисован');
  assert.ok(html.includes('минимум 8'), 'названо нужное число карт');

  assert.ok(!render().includes('ruleproblems'), 'на дефолтах причин нет');
}

// --- 4. Цены платных реакций показываются только когда правило включено ---
{
  assert.ok(!render().includes('Цена платной проверки'), 'выключено — цены нет');
  assert.ok(
    render(normalizeRules({ paidDoubtEnabled: true })).includes('Цена платной проверки'),
    'включено — цена появилась'
  );
  assert.ok(
    render(normalizeRules({ unmaskEnabled: true })).includes('Цена срыва масок'),
    'у срыва масок своя цена'
  );
}

// --- 5. Взаимоисключение объяснено, а не просто погашено ---
{
  const html = render(normalizeRules({ paidDoubtEnabled: true }));
  assert.ok(html.includes('погашен'), 'игроку сказано, почему второй тумблер не работает');
}

// --- 6. Кап пира выводится из порога победы ---
{
  assert.ok(render(normalizeRules({ crownsToWin: 7 })).includes('до 6 👑'), 'кап = порог − 1');
  assert.ok(
    render(normalizeRules({ crownsToWin: 1 })).includes('пир бесполезен'),
    'при пороге 1 про пир сказано прямо'
  );
}

/* --- 7. Сброс к умолчаниям на месте ---
 *
 * Режима «только смотреть» здесь больше нет: настройки правит ровно тот, кто их
 * видит — оффлайн сам игрок, онлайн хост, и больше никто. Пока редактор стоял
 * в карточке лобби, его показывали всему столу и половине гасили поля. */
{
  assert.ok(render().includes('Сбросить к умолчаниям'), 'правила можно вернуть к дефолтным');
}

console.log('RulesEditor.check: ok');
