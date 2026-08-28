/**
 * Короны уходят ровно одним путём — через `loseCrowns`. Он же чинит круг
 * коронации, жжёт «Королевский приём» и знает про «Охранную грамоту».
 * Run: npx tsx packages/engine/src/resolvers/crownLoss.check.ts
 */
import assert from 'node:assert/strict';
import type { CardInstance, GameState, Player } from '../types.ts';
import { burnCharterOnRumor, loseCrowns } from './crownLoss.ts';
import { disruptPlayerPlotsOnLoss } from './plotResolver.ts';

function player(partial: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: partial.id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 2,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: [],
    activePlot: null,
    ...partial
  };
}

function makeHarness(players: Player[], overrides: Partial<GameState> = {}) {
  const api = {
    players,
    discardPile: [] as CardInstance[],
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    history: [] as string[],
    ...overrides
  } as unknown as GameState;

  const get = (): GameState => api;
  const set: Parameters<typeof loseCrowns>[1] = partial => {
    const patch = typeof partial === 'function' ? partial(api) : partial;
    Object.assign(api, patch);
  };

  // Резолверы зовут срыв интриг через метод стора; в лёгком стенде его
  // подменяет прямой вызов той же функции.
  (api as unknown as Record<string, unknown>)._disruptPlayerPlotsOnLoss =
    (victimId: string, reason: string) => disruptPlayerPlotsOnLoss(get, set, victimId, reason);

  return { api, get, set };
}

// --- 1. Обычная потеря короны ---
{
  const { api, get, set } = makeHarness([player({ id: 'p1', favor: 3 })]);
  const result = loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.deepEqual(result, { kind: 'lost', amount: 1 });
  assert.equal(api.players[0].favor, 2, 'корона снята');
}

// --- 2. Больше, чем есть, снять нельзя ---
{
  const { api, get, set } = makeHarness([player({ id: 'p1', favor: 1 })]);
  const result = loseCrowns(get, set, 'p1', 2, 'шантажа');
  assert.deepEqual(result, { kind: 'lost', amount: 1 }, 'снимается только то, что есть');
  assert.equal(api.players[0].favor, 0);
}

// --- 3. У игрока нет корон ---
{
  const { api, get, set } = makeHarness([player({ id: 'p1', favor: 0 })]);
  const result = loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.deepEqual(result, { kind: 'no_crowns' });
  assert.equal(api.players[0].favor, 0);
}

// --- 4. Потеря срывает круг коронации ---
{
  const { api, get, set } = makeHarness(
    [player({ id: 'p1', favor: 6 })],
    { coronationCandidateId: 'p1', coronationOriginId: 'p2' }
  );
  loseCrowns(get, set, 'p1', 1, 'обвинения в измене');
  assert.equal(api.coronationCandidateId, null, 'круг коронации снят');
  assert.equal(api.coronationOriginId, null, 'источник круга снят вместе с ним');
}

// --- 5. Потеря сжигает «Королевский приём» жертвы ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 2,
      activePlot: { id: 'x', cardId: 'c1', type: 'Королевский приём' }
    })
  ]);
  loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.equal(api.players[0].activePlot, null, '«Королевский приём» сорван потерей');
  assert.equal(api.discardPile.length, 1, 'сорванная интрига ушла в сброс');
  assert.equal(api.discardPile[0].id, 'c1', 'в сброс ушёл тот же экземпляр карты');
}

// --- 6. Без потери «Королевский приём» цел ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 0,
      activePlot: { id: 'x', cardId: 'c1', type: 'Королевский приём' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.deepEqual(result, { kind: 'no_crowns' });
  assert.ok(api.players[0].activePlot, 'потери не было — интрига цела');
}

// --- 7. Охранная грамота держит удар ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 4,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.deepEqual(result, { kind: 'blocked_by_charter' });
  assert.equal(api.players[0].favor, 4, 'корона на месте');
  assert.ok(api.players[0].activePlot, 'грамота остаётся лежать — она не одноразовая');
  assert.equal(api.discardPile.length, 0, 'ничего не ушло в сброс');
}

// --- 8. Грамота держит и удвоенный удар Ва-банка ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 5,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 2, 'шантажа');
  assert.deepEqual(result, { kind: 'blocked_by_charter' });
  assert.equal(api.players[0].favor, 5);
}

// --- 9. Грамота держит круг коронации ---
{
  const { api, get, set } = makeHarness(
    [player({
      id: 'p1',
      favor: 6,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })],
    { coronationCandidateId: 'p1', coronationOriginId: 'p2' }
  );
  loseCrowns(get, set, 'p1', 1, 'обвинения в измене');
  assert.equal(api.coronationCandidateId, 'p1', 'круг коронации не сорван');
  assert.equal(api.players[0].favor, 6);
}

// --- 9б. Грамота держит и удар «Тайного заговора» ---
// Блокировка не смотрит на источник, но каждая формулировка `reason` попадает
// в историю — проверяется, что ни одна из них не проваливается мимо ветки.
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 3,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'удара Заговора', 'Заговор!');
  assert.deepEqual(result, { kind: 'blocked_by_charter' });
  assert.equal(api.players[0].favor, 3);
  assert.ok(
    api.history.some(h => h.includes('удара Заговора')),
    'в истории названа причина, от которой грамота защитила'
  );
}

// --- 10. Стража покоев корон НЕ защищает ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 3,
      activePlot: { id: 'x', cardId: 'c1', type: 'Стража покоев' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'обвинения в измене');
  assert.deepEqual(result, { kind: 'lost', amount: 1 }, 'Стража защищает от ролей, а не от корон');
  assert.equal(api.players[0].favor, 2);
}

// --- 11. Шантажист против грамоты: жертва цела, атакующий пуст ---
// Страховочный путь: в партии Задача 7 не даёт объявить такую атаку вовсе.
// Тест фиксирует, что даже в обход выбора цели корона не печатается из воздуха.
{
  const { api, get, set } = makeHarness([
    player({ id: 'p1', favor: 1 }),
    player({
      id: 'p2',
      favor: 4,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p2', 1, 'шантажа');
  const stolen = result.kind === 'lost' ? result.amount : 0;
  assert.equal(stolen, 0, 'красть нечего — грамота удержала корону');
  assert.equal(api.players[0].favor, 1, 'атакующий не получил чужой короны');
  assert.equal(api.players[1].favor, 4, 'жертва не потеряла корону');
}

// --- 12. Слух сжигает грамоту, но короны не забирает ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 4,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'распущенных слухов');
  assert.deepEqual(result, { kind: 'blocked_by_charter' });

  const burned = burnCharterOnRumor(get, set, 'p1');
  assert.equal(burned, true, 'слух сжигает грамоту');
  assert.equal(api.players[0].favor, 4, 'корона осталась при владельце');
  assert.equal(api.players[0].activePlot, null, 'грамота больше не лежит');
  assert.equal(api.discardPile.length, 1, 'грамота ушла в сброс');
  assert.equal(api.discardPile[0].id, 'c1', 'в сброс ушёл тот же экземпляр');
  assert.equal(api.discardPile[0].card, 'Охранная грамота');
}

// --- 13. Слух не трогает Стражу покоев ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 4,
      activePlot: { id: 'x', cardId: 'c1', type: 'Стража покоев' }
    })
  ]);
  const burned = burnCharterOnRumor(get, set, 'p1');
  assert.equal(burned, false, 'слух жжёт только грамоту');
  assert.ok(api.players[0].activePlot, 'Стража осталась на месте');
}

console.log('crownLoss.check: ok');
