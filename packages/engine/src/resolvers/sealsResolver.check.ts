/**
 * «Охранная грамота» — не бесплатная крепость: пока она лежит, печати её
 * держателю не идут. Прямые короны («Чёрная книга», проверенный «Шут») она не
 * трогает — это короны, а не печати, и через `addSealsToPlayer` они не проходят.
 * Run: npx tsx packages/engine/src/resolvers/sealsResolver.check.ts
 */
import assert from 'node:assert/strict';
import type { CardInstance, GameState, Player } from '../types.ts';
import { addSealsToPlayer } from './sealsResolver.ts';
import { DEFAULT_RULES } from '../rules.ts';

function player(partial: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: partial.id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 0,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: [],
    activePlot: null,
    ...partial
  };
}

function makeHarness(players: Player[]) {
  const api = {
    players,
    discardPile: [] as CardInstance[],
    rules: DEFAULT_RULES,
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    activePlayerId: players[0].id,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    history: [] as string[]
  } as unknown as GameState;

  const get = (): GameState => api;
  const set: Parameters<typeof addSealsToPlayer>[1] = partial => {
    const patch = typeof partial === 'function' ? partial(api) : partial;
    Object.assign(api, patch);
  };
  return { api, get, set };
}

// --- 1. Без грамоты печати начисляются как раньше ---
{
  const { api, get, set } = makeHarness([player({ id: 'p1', seals: 1 })]);
  addSealsToPlayer(get, set, 'p1', 1);
  assert.equal(api.players[0].favor, 1, '2 печати сложились в корону');
  assert.equal(api.players[0].seals, 0, 'остаток печатей обнулён');
}

// --- 2. Под грамотой печати не идут ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      seals: 1,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  addSealsToPlayer(get, set, 'p1', 1);
  assert.equal(api.players[0].seals, 1, 'печать не начислена и не отложена');
  assert.equal(api.players[0].favor, 0, 'короны из неё не выросло');
  assert.ok(
    api.history.some(h => h.includes('Охранная грамота')),
    'игрок должен видеть, почему печать не пришла'
  );
}

// --- 3. Под грамотой не срабатывает и бонус Золотой буллы ---
// (обе интриги в один слот не влезают, но проверка фиксирует порядок:
//  выход по грамоте происходит раньше, чем что-либо начисляется)
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      gold: 5,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  addSealsToPlayer(get, set, 'p1', 2);
  assert.equal(api.players[0].gold, 5, 'золото не изменилось');
  assert.equal(api.players[0].favor, 0);
}

// --- 4. Стража покоев печатям не мешает ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      seals: 1,
      activePlot: { id: 'x', cardId: 'c1', type: 'Стража покоев' }
    })
  ]);
  addSealsToPlayer(get, set, 'p1', 1);
  assert.equal(api.players[0].favor, 1, 'Стража печати не гасит');
}

console.log('sealsResolver.check: ok');
