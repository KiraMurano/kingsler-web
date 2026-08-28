/**
 * Coronation circle starts and ends on the player whose turn it began.
 * Run: node --experimental-strip-types src/engine/resolvers/coronation.check.ts
 */
import assert from 'node:assert/strict';
import type { GameState, Player } from '../types.ts';
import { beginCoronationIfNeeded, resolveCoronationAtTurnStart } from './coronation.ts';
import { mintDeck } from '../cardInstance.ts';
import { DEFAULT_RULES } from '../rules.ts';

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 2,
    favor: 3,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(['Наследник', 'Казначей']),
    activePlot: null,
    ...partial
  };
}

function makeHarness(overrides: Partial<GameState> = {}) {
  const api = {
    players: [] as Player[],
    deck: [] as GameState['deck'],
    discardPile: [] as GameState['discardPile'],
    activePlayerId: 'p1',
    turnPhase: 'IDLE' as GameState['turnPhase'],
    turnSubPhase: 'NORMAL_ACTION_PHASE' as GameState['turnSubPhase'],
    timerSeconds: 0,
    timerMaxSeconds: 0,
    isTimerPaused: false,
    rules: DEFAULT_RULES,
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    pendingAction: null,
    pendingDoubtDoubterId: null,
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
    isVaBanqueActive: false,
    isVetoed: false,
    isPendingActionAfterTruthChallenge: false,
    revealOutcome: null,
    duelOutcome: null,
    informantPeekData: null,
    conspiracyPrompt: null,
    pendingDuelDefenderCardId: null,
    pendingDuelDefenderRoleClaim: null,
    activeSpeechReactions: {},
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    overlayInstant: null,
    winnerId: null as string | null,
    history: [] as string[],
    ...overrides
  };

  const get = () => api as unknown as GameState;
  const set = (partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)) => {
    const patch = typeof partial === 'function' ? partial(get()) : partial;
    Object.assign(api, patch);
  };

  return { get, set, api };
}

/* Порог победы теперь задаётся правилами партии, поэтому тесты считают его от
   `WIN`, а не от прежней зашитой шестёрки. */
const WIN = DEFAULT_RULES.crownsToWin;

const table = [
  player({ id: 'p1', name: 'Анна', favor: WIN }),
  player({ id: 'p2', name: 'Борис', isBot: true }),
  player({ id: 'p3', name: 'Вера', isBot: true }),
  player({ id: 'p4', name: 'Глеб', isBot: true })
];

function verdictAt(nextId: string, favor = WIN) {
  return resolveCoronationAtTurnStart(
    nextId,
    table.map(p => p.id === 'p1' ? { ...p, favor } : p),
    'p1',
    'p2',
    WIN
  );
}

{
  const { get, set, api } = makeHarness({ players: table, activePlayerId: 'p2' });
  beginCoronationIfNeeded(get, set, 'p1');
  assert.equal(api.coronationCandidateId, 'p1');
  assert.equal(api.coronationOriginId, 'p2');
}

{
  const { get, set, api } = makeHarness({ players: table, activePlayerId: 'p1' });
  beginCoronationIfNeeded(get, set, 'p1');
  assert.equal(api.coronationOriginId, 'p1');
}

assert.equal(verdictAt('p3').kind, 'continue');
assert.equal(verdictAt('p4').kind, 'continue');
assert.equal(verdictAt('p1').kind, 'continue');

const win = verdictAt('p2');
assert.equal(win.kind, 'win');
if (win.kind === 'win') assert.equal(win.winnerId, 'p1');

assert.equal(verdictAt('p2', WIN - 1).kind, 'abort', 'ниже порога — срыв');

{
  const ownTurn = resolveCoronationAtTurnStart(table[0].id, table, 'p1', 'p1', WIN);
  assert.equal(ownTurn.kind, 'win');
}

console.log('coronation.check: ok');
