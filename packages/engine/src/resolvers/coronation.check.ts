/**
 * Run: npx tsx packages/engine/src/resolvers/coronation.check.ts
 */
import assert from 'node:assert/strict';
import { coronationTurnsLeft } from './coronation.ts';

const table = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];

/* Круг только начался: ход у зачинателя, и до коронации — полный оборот
   стола. Ноль здесь означал бы «победа прямо сейчас», а она на следующем
   его ходе. */
assert.equal(coronationTurnsLeft(table, 'p1', 'p1'), 4);

/* Дальше счётчик убывает шаг за шагом. */
assert.equal(coronationTurnsLeft(table, 'p2', 'p1'), 3);
assert.equal(coronationTurnsLeft(table, 'p3', 'p1'), 2);
assert.equal(coronationTurnsLeft(table, 'p4', 'p1'), 1);

/* Зачинатель не обязан быть первым за столом. */
assert.equal(coronationTurnsLeft(table, 'p4', 'p3'), 3);

/* Круга нет — считать нечего. */
assert.equal(coronationTurnsLeft(table, 'p1', null), null);
assert.equal(coronationTurnsLeft(table, null, 'p1'), null);
/* Игрока за столом не нашлось: молчим, а не показываем выдуманное число. */
assert.equal(coronationTurnsLeft(table, 'p9', 'p1'), null);
assert.equal(coronationTurnsLeft([], 'p1', 'p1'), null);

console.log('coronation.check.ts passed.');

/* --- Несколько кругов разом ---------------------------------------------- */
import { coronationBoard, resolveCoronationsAtTurnStart, survivingCoronations } from './coronation.ts';
import type { Player } from '../types.ts';

const at = (id: string, favor: number, seals = 0, gold = 0): Player =>
  ({ id, name: id, avatar: '', seatNumber: 1, isBot: false, gold, favor, seals,
     actionTokens: 2, hand: [], activePlot: null }) as Player;

{
  /* Два круга с разными зачинателями идут независимо: закрывается только тот,
     чей зачинатель начинает ход. Раньше круг был один на стол, и второй
     дошедший до порога не получал круга вовсе. */
  const two = [
    { candidateId: 'p1', originId: 'p2' },
    { candidateId: 'p3', originId: 'p4' }
  ];
  const players = [at('p1', 5), at('p2', 0), at('p3', 5), at('p4', 0)];

  const first = resolveCoronationsAtTurnStart('p2', players, two, 5);
  assert.equal(first.verdict.kind, 'win');
  assert.equal(first.verdict.kind === 'win' && first.verdict.winnerId, 'p1');
  assert.deepEqual(first.rest, [two[1]], 'чужой круг продолжается');

  /* Ход не того зачинателя не закрывает ничего. */
  assert.equal(resolveCoronationsAtTurnStart('p1', players, two, 5).verdict.kind, 'continue');
}

{
  /* Круг сорвался — снимается только он. */
  const two = [
    { candidateId: 'p1', originId: 'p2' },
    { candidateId: 'p3', originId: 'p4' }
  ];
  assert.deepEqual(survivingCoronations(two, 'p1', 4, 5), [two[1]], 'упавший круг снят, соседний цел');
  assert.deepEqual(survivingCoronations(two, 'p1', 5, 5), two, 'на пороге держатся оба');
}

{
  /* Два круга закрываются на одном ходу — престол один, побеждает сильнейший:
     короны, потом печати, потом золото. Порядок в массиве решать не должен. */
  const same = [
    { candidateId: 'weak', originId: 'p9' },
    { candidateId: 'strong', originId: 'p9' }
  ];
  const players = [at('weak', 5, 0, 1), at('strong', 5, 1, 0), at('p9', 0)];
  const out = resolveCoronationsAtTurnStart('p9', players, same, 5);
  assert.equal(out.verdict.kind === 'win' && out.verdict.winnerId, 'strong', 'больше печатей — сильнее');
  assert.deepEqual(out.rest, [], 'оба круга закрылись');
}

{
  /* Список для экрана: самый срочный сверху. */
  const players = [at('a', 5), at('b', 5), at('c', 0), at('d', 0)];
  const rows = coronationBoard(
    players,
    [{ candidateId: 'a', originId: 'd' }, { candidateId: 'b', originId: 'c' }],
    'c'
  );
  /* Ход у `c`: круг с зачинателем `d` закроется через один ход, а круг с
     зачинателем `c` — только через полный оборот стола. Срочный — первый. */
  assert.deepEqual(rows.map(r => r.candidateId), ['a', 'b'], 'меньше ходов — выше');
  assert.deepEqual(rows.map(r => r.turnsLeft), [1, 4]);
}

console.log('coronation.check.ts: несколько кругов — ok');
