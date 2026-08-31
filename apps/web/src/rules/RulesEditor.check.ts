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
    'Платный шантаж',
    'Дуэль тратит жетон хода',
    'Стоимость дуэли',
    'Платная дуэль',
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
  assert.ok(render().includes('50 карт'), 'счётчик показывает размер колоды');

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
  assert.ok(render().includes('Цена платной проверки'), 'по умолчанию цена на экране');
  assert.ok(
    !render(normalizeRules({ paidDoubtEnabled: false })).includes('Цена платной проверки'),
    'выключено — цены нет'
  );
  assert.ok(
    render(normalizeRules({ paidDoubtEnabled: true })).includes('Цена платной проверки'),
    'включено — цена появилась'
  );
  assert.ok(
    render(normalizeRules({ paidDoubtEnabled: false, unmaskEnabled: true })).includes('Цена срыва масок'),
    'у срыва масок своя цена'
  );
}

/* --- 4а. У розыгрыша за монеты цена СВОЯ ---
 *
 * Раньше её перебивала «Платная проверка» — по образцу платной дуэли, — и два
 * разных правила нельзя было развести по деньгам: дешёвая проверка делала
 * дешёвым и розыгрыш. Заимствование там осмысленно (платная дуэль это и есть
 * купленная проверка, только со щитом), здесь — нет. */
{
  assert.ok(render().includes('Цена розыгрыша за монеты'), 'по умолчанию цена на экране');
  assert.ok(
    !render(normalizeRules({ paidPlayEnabled: false })).includes('Цена розыгрыша за монеты'),
    'выключено — цены нет'
  );

  const alone = render(normalizeRules({ paidPlayEnabled: true }));
  assert.ok(alone.includes('Цена розыгрыша за монеты'), 'включено — цена своя');

  const withDoubt = render(normalizeRules({ paidPlayEnabled: true, paidDoubtEnabled: true }));
  assert.ok(
    withDoubt.includes('Цена розыгрыша за монеты'),
    'включённая платная проверка своей цены розыгрыша не отменяет'
  );
  assert.ok(
    withDoubt.includes('Цена платной проверки'),
    'и обе цены стоят рядом, каждая своим ползунком'
  );
}

/* --- 4б. «Платный шантаж» — это цена больше нуля, а не отдельный флаг ---
 *
 * Ноль в `blackmailCost` означает выключенное правило, и тумблер читает ровно
 * его. Второе состояние у одного факта («флаг включён, цена ноль») чинить
 * пришлось бы в трёх местах. */
{
  const free = render(normalizeRules({ blackmailCost: 0 }));
  assert.ok(free.includes('Платный шантаж'), 'тумблер виден всегда');
  assert.ok(!free.includes('Цена шантажа'), 'бесплатный шантаж цены не показывает');

  const paid = render(normalizeRules({ blackmailCost: 4 }));
  assert.ok(paid.includes('Цена шантажа'), 'платный — показывает');
  assert.ok(
    paid.includes('aria-checked="true"'),
    'и тумблер при этом включён'
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

/* --- 8. «Платная дуэль»: свой ползунок и один сосед ---
 *
 * Она выкупает жетон золотом по СВОЕЙ цене. Раньше цену занимала «Платная
 * проверка», и выкуп щита нельзя было включить, не разрешив заодно покупать
 * проверки; теперь зависимость осталась одна — требование жетона, без него
 * выкупать нечего. Тумблер при этом не прячется, а гаснет и объясняет себя:
 * спрятанная настройка выглядит как отсутствующая. */
{
  const noToken = render(normalizeRules({ duelCostsToken: false }));
  assert.ok(noToken.includes('Платная дуэль'), 'тумблер виден всегда');
  assert.ok(noToken.includes('выкупать нечего'), 'и объясняет, чего ему не хватает');

  /* Платной проверки нет — и она больше не нужна. */
  const own = render(
    normalizeRules({ duelCostsToken: true, paidDuelEnabled: true, paidDuelCost: 2, duelCost: 1 })
  );
  assert.ok(!own.includes('выкупать нечего'), 'зависимость на месте — объяснять нечего');
  assert.ok(own.includes('Цена платной дуэли'), 'у выкупа свой ползунок');
  assert.ok(own.includes('3 🪙'), 'названа итоговая цена вызова без жетона');

  /* Без надбавки складывать нечего — и пояснения нет. */
  const plain = render(normalizeRules({ duelCostsToken: true, paidDuelEnabled: true }));
  assert.ok(plain.includes('Цена платной дуэли'), 'ползунок всё равно есть');
  assert.ok(!plain.includes('плюс надбавка'), 'а складывать нечего — пояснение молчит');
}

console.log('RulesEditor.check: ok');
