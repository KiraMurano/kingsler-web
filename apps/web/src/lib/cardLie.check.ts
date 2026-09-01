/**
 * Самопроверка `cardLie`: как карта ложится на стол.
 *
 * Главное здесь — не конкретные градусы, а три свойства, ради которых функция
 * и появилась:
 *
 *  1. вето, Ва-банк и перевод, приходящие в одну лунку, разведены по углу
 *     заведомо, а не случайно;
 *  2. вето поверх выкладки Интриги лежит ровно — оно занимает обычную лунку,
 *     где косой угол читается как перекос; встречное вето в той же лунке
 *     ложится накрест, иначе два одинаковых лица совпадают;
 *  3. дрожь у каждой карты своя, но постоянная: угол не может меняться от
 *     кадра к кадру, иначе лежащая карта трясётся.
 *
 * Run: npx tsx apps/web/src/lib/cardLie.check.ts
 */
import assert from 'node:assert/strict';
import { cardLie, laidJitter } from './cardLie.ts';
import { tilt } from '../motion/tokens.ts';
import type { PlacedCard, Zone } from '../motion/zones.ts';
import type { GameCard } from '@kinglier/engine/types';

function placed(
  id: string,
  zone: Zone,
  known: GameCard | null = null,
  vetoLink?: number
): PlacedCard {
  return { id, zone, face: { known }, revealed: false, ownerId: null, vetoLink };
}

/* --- 1. Дрожь: своя у каждой карты, одна и та же при каждом вызове. ------ */

const ids = ['c0', 'c1', 'c2', 'c10', 'c11', 'overlay:p2:Право вето', 'k3c7'];
for (const id of ids) {
  const first = laidJitter(id);
  assert.equal(laidJitter(id), first, `дрожь ${id} изменилась между вызовами`);
  assert.ok(
    Math.abs(first) <= tilt.laidJitter,
    `дрожь ${id} = ${first} вышла за предел ${tilt.laidJitter}`
  );
}

/* Соседние идентификаторы обязаны разойтись: колода раздаётся подряд, и
   если `c10` и `c11` дают почти один угол, весь стол снова лежит по линейке. */
const spread = new Set(ids.map(id => Math.round(laidJitter(id) * 10)));
assert.ok(spread.size >= ids.length - 1, `дрожь склеилась: ${[...spread].join(', ')}`);

/* --- 2. Оверлей: вето против Ва-банка в одной лунке. --------------------- */

const across: Zone = { kind: 'overlay', over: 'action' };
const vaBanque = cardLie(placed('c0', across, 'Ва-банк'))!;
const veto = cardLie(placed('c1', across, 'Право вето'))!;
const redirect = cardLie(placed('c2', across, 'Перенаправление'))!;

assert.ok(vaBanque > 0, `Ва-банк лежит поперёк действия: ${vaBanque}`);
assert.ok(veto < 0, `вето обязано лечь в другую сторону: ${veto}`);
assert.ok(
  Math.abs(vaBanque - veto) > 4 * tilt.laidJitter,
  `вето и Ва-банк слишком близки по углу: ${veto} против ${vaBanque}`
);
assert.ok(
  Math.abs(redirect - vaBanque) > 4 * tilt.laidJitter,
  `перевод и Ва-банк слишком близки по углу: ${redirect} против ${vaBanque}`
);
assert.ok(
  Math.abs(redirect - veto) > 4 * tilt.laidJitter,
  `перевод и вето слишком близки по углу: ${redirect} против ${veto}`
);

/* Тот же вывод не должен зависеть от того, какой именно экземпляр карты
   лёг: угол выбирается по лицу карты, а не по её идентификатору. */
for (const id of ['c5', 'c17', 'overlay:p3:Право вето']) {
  assert.ok(cardLie(placed(id, across, 'Право вето'))! < 0, `вето ${id} легло не в ту сторону`);
}

/* --- 2а. Вето на вето: одна лунка, одно лицо, разные углы. --------------- */

/*
 * Ва-банк от вето разводит лицо карты, а два «Права вето» лицом не различить
 * вовсе: обе карты одинаковые, обе приходят в ту же лунку. Единственное, чем
 * они отличаются, — номер звена цепочки, по нему и разводим.
 */
{
  const first = cardLie(placed('c20', across, 'Право вето', 1))!;
  const second = cardLie(placed('c21', across, 'Право вето', 2))!;
  const third = cardLie(placed('c22', across, 'Право вето', 3))!;

  assert.ok(first < 0, `первое вето клонится влево: ${first}`);
  assert.ok(second > 0, `встречное — накрест, вправо: ${second}`);
  assert.ok(
    Math.abs(second - first) > 4 * tilt.laidJitter,
    `соседние звенья цепочки слишком близки: ${first} против ${second}`
  );
  /* Третье снова как первое: цепочка чередуется, а не разъезжается веером —
     иначе шестое вето лежало бы поперёк стола. */
  assert.ok(third < 0, `третье звено возвращается к наклону первого: ${third}`);

  /* Без номера звена (оверлей не из цепочки) — обычный угол вето. */
  assert.ok(cardLie(placed('c23', across, 'Право вето'))! < 0);
}

/* --- 3. Оверлей поверх выкладки Интриги — ровно. ------------------------- */

const plotHole: Zone = { kind: 'overlay', over: 'plot' };
const overPlot = cardLie(placed('c2', plotHole, 'Право вето'))!;
assert.ok(
  Math.abs(overPlot) <= tilt.laidJitter,
  `вето на интригу должно лежать ровно, а лежит под ${overPlot}°`
);
/* Ровно — но не по линейке: дрожь остаётся, карту всё-таки кладут рукой. */
assert.notEqual(overPlot, 0);

/* Вето на вето в той же лунке: первое остаётся ровным (под ним пусто),
   встречное ложится накрест — иначе два одинаковых лица совпадают
   пиксель в пиксель. Раньше `over === 'plot'` обнулял угол до сверки
   звена цепочки, и оба вето ложились как одно. */
{
  const first = cardLie(placed('c20', plotHole, 'Право вето', 1))!;
  const second = cardLie(placed('c21', plotHole, 'Право вето', 2))!;
  assert.ok(
    Math.abs(first) <= tilt.laidJitter,
    `первое вето на интригу должно лежать ровно, а лежит под ${first}°`
  );
  assert.ok(
    Math.abs(second - first) > 4 * tilt.laidJitter,
    `встречное вето на интригу совпало с первым: ${first} против ${second}`
  );
}

/* --- 4. Остальные зоны. -------------------------------------------------- */

/* В руке карту держат, а не кладут: никакой дрожи. */
assert.equal(cardLie(placed('c3', { kind: 'hand', playerId: 'p1', slot: 0 })), 0);
assert.equal(cardLie(placed('c4', { kind: 'deck' })), 0);

/* Сброс — «оставить как лежит»: выпрямляться по дороге в угол незачем. */
assert.equal(cardLie(placed('c5', { kind: 'discard' })), null);

/* Ставка и дуэль сохраняют свои посадки, дрожь их не перебивает. */
const stake = cardLie(placed('c6', { kind: 'stake' }))!;
assert.ok(Math.abs(stake - tilt.stake) <= tilt.laidJitter);
const attacker = cardLie(placed('c7', { kind: 'duel', side: 'attacker' }))!;
const defender = cardLie(placed('c8', { kind: 'duel', side: 'defender' }))!;
assert.ok(attacker < 0 && defender > 0, 'дуэлянты клонятся друг к другу');

/* Интрига в слоте лежит почти ровно — но всё же положена рукой. */
const plot = cardLie(placed('c9', { kind: 'plot', playerId: 'p1' }, 'Досье'))!;
assert.ok(plot !== 0 && Math.abs(plot) <= tilt.laidJitter);

console.log('cardLie.check.ts passed.');
