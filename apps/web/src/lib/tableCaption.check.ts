/**
 * Подпись в середине стола — предложение с подлежащим, а не название карты.
 *
 * Раньше здесь стоял инфинитив с кнопки: «Просить содержание», «Обыск покоев»,
 * «Вор против Елены». Кто ходит — не сказано, а инфинитив звучит как
 * предложение сделать, хотя ход уже сделан.
 *
 * Run: npx tsx apps/web/src/lib/tableCaption.check.ts
 */
import assert from 'node:assert/strict';
import type { Action } from '@kinglier/engine/types';
import { tableCaption, overlayCaption } from './tableCaption.ts';

const players = [
  { id: 'p1', name: 'Барон Дима', isBot: true },
  { id: 'p2', name: 'Графиня Елена', isBot: true },
  { id: 'p3', name: 'Kira Murano', isBot: false }
];

const act = (over: Partial<Action>): Action => ({
  id: 'a1',
  type: 'normal',
  name: 'Просить содержание',
  actorId: 'p1',
  costGold: 0,
  costTokens: 1,
  description: '',
  ...over
});

const say = (over: Partial<Action>) => tableCaption(act(over), players);

// --- Обычные действия двора ---
assert.equal(say({}), 'Барон Дима просит содержание');
assert.equal(say({ name: 'Устроить пир' }), 'Барон Дима устраивает пир');
assert.equal(
  say({ name: 'Распустить слух', targetId: 'p2' }),
  'Барон Дима распускает слух против Графини Елены',
  'титул склоняется вместе с именем'
);
assert.equal(say({ name: 'Сменить карту' }), 'Барон Дима меняет карту');
assert.equal(
  say({ name: 'Сменить 2 карты', stakedCardIds: ['c1', 'c2'] }),
  'Барон Дима меняет карты',
  'число карт берётся из хода, а не из названия'
);

// --- Инстанты: у каждого своя фраза, а не название карты ---
assert.equal(
  say({ type: 'instant', instantType: 'Обыск покоев', name: 'Обыск покоев', targetId: 'p2' }),
  'Барон Дима обыскивает покои Графини Елены'
);
assert.equal(
  say({ type: 'instant', instantType: 'Обвинение в измене', name: 'x', targetId: 'p2' }),
  'Барон Дима обвиняет Графиню Елену в измене'
);
assert.equal(
  say({ type: 'instant', instantType: 'Дворцовый переполох', name: 'x', targetId: 'p2' }),
  'Барон Дима устраивает переполох у Графини Елены'
);
assert.equal(
  say({ type: 'instant', instantType: 'Право вето', name: 'x' }),
  'Барон Дима накладывает вето'
);

// --- Заявка роли: роль в винительном падеже ---
assert.equal(say({ type: 'role', roleClaim: 'Вор', name: 'Вор' }), 'Барон Дима заявляет Вора');
assert.equal(
  say({ type: 'role', roleClaim: 'Шантажист', name: 'Шантажист', targetId: 'p2' }),
  'Барон Дима заявляет Шантажиста против Графини Елены'
);
assert.equal(
  say({ type: 'role', roleClaim: 'Казначей', name: 'Казначей' }),
  'Барон Дима заявляет Казначея',
  'мягкая основа склоняется правильно'
);

// --- Интриги ---
assert.equal(
  say({ type: 'plot', plotType: 'Тайный заговор', name: 'Тайный заговор' }),
  'Барон Дима выкладывает интригу «Тайный заговор»'
);
assert.equal(
  say({ type: 'plot', plotType: 'Тайный заговор', name: 'x', conspiracyEffect: 'crown', targetId: 'p2' }),
  'Барон Дима свершает заговор против Графини Елены: корону',
  'разряженный заговор — это удар, а не выкладка'
);
assert.equal(
  say({ type: 'plot', plotType: 'Золотая булла', name: 'x', isMorningTrigger: true }),
  'Барон Дима получает награду: «Золотая булла»'
);

/* --- Ник живого игрока не склоняется ---
 *
 * Имена ботов придуманы нами и склоняются; ник — это то, как игрок себя
 * назвал, и коверкать его нельзя. */
assert.equal(
  say({ name: 'Распустить слух', targetId: 'p3' }),
  'Барон Дима распускает слух против Kira Murano'
);
assert.equal(
  tableCaption(act({ actorId: 'p3', name: 'Устроить пир' }), players),
  'Kira Murano устраивает пир'
);

// --- Инстант поверх чужого хода рассказывает про того, кто вмешался ---
{
  const attack = act({ type: 'role', roleClaim: 'Вор', name: 'Вор', actorId: 'p1', targetId: 'p3' });
  assert.equal(
    overlayCaption({ card: 'Право вето', actorId: 'p2' }, attack, players),
    'Графиня Елена накладывает вето',
    'вето — про того, кто его положил, а не про того, чей ход перебит'
  );
  assert.equal(
    overlayCaption({ card: 'Перенаправление', actorId: 'p3' }, attack, players),
    'Kira Murano переводит удар на Kira Murano',
    'перенаправление называет новую цель — её уже проставили в заявку'
  );
  assert.equal(overlayCaption(null, attack, players), null, 'нет карты поверх — нет подписи');
}

// Без действия рассказывать нечего.
assert.equal(tableCaption(null, players), null);

console.log('tableCaption.check: ok');
