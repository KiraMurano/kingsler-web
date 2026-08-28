/**
 * Новые правила «Тайного заговора»: разряжается только на полных 4 зарядах,
 * бьёт либо на 3 🪙, либо на 1 👑, а против «Охранной грамоты» сжигает саму
 * грамоту, оставляя корону. Активацию на полном заряде вето не отменяет.
 * Run: npx tsx packages/engine/src/resolvers/conspiracy.check.ts
 */
import assert from 'node:assert/strict';
import type { CardInstance, GameState, Player } from '../types.ts';
import {
  CONSPIRACY_FULL_CHARGE,
  CONSPIRACY_GOLD_HIT,
  applyConspiracyEffect,
  openConspiracyDialog,
  disruptPlayerPlotsOnLoss
} from './plotResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { DEFAULT_RULES } from '../rules.ts';

function player(partial: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: partial.id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 6,
    favor: 3,
    seals: 0,
    actionTokens: 2,
    hand: [],
    activePlot: null,
    ...partial
  };
}

function plotter(charges: number): Player {
  return player({
    id: 'p1',
    activePlot: { id: 'plot', cardId: 'cPlot', type: 'Тайный заговор', charges }
  });
}

function makeHarness(players: Player[]) {
  const api = {
    rules: DEFAULT_RULES,
    players,
    discardPile: [] as CardInstance[],
    activePlayerId: players[0].id,
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    conspiracyPrompt: null,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    history: [] as string[]
  } as unknown as GameState;

  const get = (): GameState => api;
  const set: Parameters<typeof applyConspiracyEffect>[1] = partial => {
    const patch = typeof partial === 'function' ? partial(api) : partial;
    Object.assign(api, patch);
  };
  const rec = api as unknown as Record<string, unknown>;
  rec._disruptPlayerPlotsOnLoss = (id: string, reason: string) =>
    disruptPlayerPlotsOnLoss(get, set, id, reason);
  rec._checkEndgameAndAdvanceTurn = () => {};
  return { api, get, set };
}

function strike(api: GameState, effect: 'gold' | 'crown') {
  return {
    id: 'a1',
    type: 'plot' as const,
    name: 'Тайный заговор',
    plotType: 'Тайный заговор' as const,
    actorId: 'p1',
    targetId: 'p2',
    costGold: 0,
    costTokens: 1,
    stakedCardId: api.players[0].activePlot!.cardId,
    conspiracyEffect: effect,
    cannotBeVetoed: true,
    description: ''
  };
}

// --- 1. Диалог не открывается на неполном заряде ---
for (const charges of [0, 1, 2, 3]) {
  const { api, get, set } = makeHarness([plotter(charges), player({ id: 'p2' })]);
  openConspiracyDialog(get, set, false);
  assert.equal(api.conspiracyPrompt, null, `на ${charges} зарядах Заговор не разряжается`);
}

// --- 2. На полном заряде диалог открывается ---
{
  const { api, get, set } = makeHarness([plotter(CONSPIRACY_FULL_CHARGE), player({ id: 'p2' })]);
  openConspiracyDialog(get, set, false);
  assert.ok(api.conspiracyPrompt, 'на 4 зарядах Заговор разряжается');
  assert.equal(api.conspiracyPrompt!.charges, CONSPIRACY_FULL_CHARGE);
}

// --- 3. Золотой удар — ровно 3 монеты, независимо от казны ---
{
  const { api, get, set } = makeHarness([plotter(4), player({ id: 'p2', gold: 9 })]);
  applyConspiracyEffect(get, set, strike(api, 'gold'));
  assert.equal(api.players[1].gold, 9 - CONSPIRACY_GOLD_HIT, 'сброшено ровно 3 🪙');
  assert.equal(api.players[0].activePlot, null, 'карта Заговора ушла со стола');
  timerManager.clearAll();
}

// --- 4. Золотой удар ограничен тем, что есть в казне ---
{
  const { api, get, set } = makeHarness([plotter(4), player({ id: 'p2', gold: 1 })]);
  applyConspiracyEffect(get, set, strike(api, 'gold'));
  assert.equal(api.players[1].gold, 0, 'нельзя отнять больше, чем есть');
  timerManager.clearAll();
}

// --- 5. Коронный удар снимает корону ---
{
  const { api, get, set } = makeHarness([plotter(4), player({ id: 'p2', favor: 3 })]);
  applyConspiracyEffect(get, set, strike(api, 'crown'));
  assert.equal(api.players[1].favor, 2, 'корона снята');
  timerManager.clearAll();
}

// --- 6. Против грамоты: корона цела, грамота сгорела ---
{
  const { api, get, set } = makeHarness([
    plotter(4),
    player({
      id: 'p2',
      favor: 4,
      activePlot: { id: 'ch', cardId: 'cCharter', type: 'Охранная грамота' }
    })
  ]);
  applyConspiracyEffect(get, set, strike(api, 'crown'));
  assert.equal(api.players[1].favor, 4, 'грамота удержала корону');
  assert.equal(api.players[1].activePlot, null, 'но сама грамота не пережила удар');
  assert.ok(
    api.discardPile.some(c => c.id === 'cCharter' && c.card === 'Охранная грамота'),
    'грамота ушла в сброс тем же экземпляром'
  );
  timerManager.clearAll();
}

// --- 7. Против грамоты золотой удар работает как обычно ---
{
  const { api, get, set } = makeHarness([
    plotter(4),
    player({
      id: 'p2',
      gold: 8,
      activePlot: { id: 'ch', cardId: 'cCharter', type: 'Охранная грамота' }
    })
  ]);
  applyConspiracyEffect(get, set, strike(api, 'gold'));
  assert.equal(api.players[1].gold, 8 - CONSPIRACY_GOLD_HIT, 'золото грамота не держит');
  assert.ok(api.players[1].activePlot, 'от золотого удара грамота не горит');
  timerManager.clearAll();
}

console.log('conspiracy.check: ok');
