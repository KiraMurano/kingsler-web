/**
 * Duel breakthrough must not resurrect a ghost staked card on the table:
 * once both duel cards have been fought, neither staked instance is in its
 * owner's hand any more, so `StakedCardArena` must not re-stage a face-down
 * card while the winner's effect is on hold.
 *
 * And, per RULES.md §6 rule 2 ("Любая карта, которая была вскрыта на столе
 * (при проверке или дуэли), отправляется в сброс"), both revealed duel stakes
 * must land in the discard as the very same instances that left the hands —
 * in every one of the four `DuelResultType` outcomes.
 * Run: npx tsx packages/engine/src/resolvers/duelResolver.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, CardInstance, GameCard, GameState, Player, Role } from '../types.ts';
import { attackerAcceptDuel, closeDuelOutcome } from './duelResolver.ts';
import { triggerVetoWindowOrResolveEffect, resolvePendingActionEffect } from './doubtResolver.ts';
import { resolveRoleActionEffect } from './roleResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { assertCardCensus } from './cardCensus.check.ts';

/** Like `mintDeck`, but ids stay unique across hands — two seats holding
 *  `c0` would make the whole-state card census meaningless. */
let mintedInCheck = 0;
function mintDeck(cards: GameCard[]): CardInstance[] {
  return cards.map(card => ({ id: `k${mintedInCheck++}`, card }));
}

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 4,
    favor: 3,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(['Наследник', 'Право вето']),
    activePlot: null,
    ...partial
  };
}

function makeHarness(overrides: Partial<GameState> = {}) {
  const api = {
    players: [] as Player[],
    discardPile: [] as GameState['discardPile'],
    activePlayerId: 'p1',
    turnPhase: 'DUEL_ATTACKER_WINDOW' as GameState['turnPhase'],
    pendingAction: null as Action | null,
    pendingDuelDefenderCardId: null as string | null,
    pendingDuelDefenderRoleClaim: 'Казначей' as GameState['pendingDuelDefenderRoleClaim'],
    duelOutcome: null,
    isVaBanqueActive: false,
    isVetoed: false,
    isPendingActionAfterTruthChallenge: false,
    overlayInstant: null,
    activeSpeechReactions: {} as Record<string, string>,
    history: [] as string[],
    ...overrides
  };

  const get = () => api as unknown as GameState;
  const set = (partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)) => {
    const patch = typeof partial === 'function' ? partial(get()) : partial;
    Object.assign(api, patch);
  };

  const state = api as unknown as GameState;
  state._triggerVetoWindowOrResolveEffect = (a, after) =>
    triggerVetoWindowOrResolveEffect(get, set, a, after);
  state._resolvePendingActionEffect = (a, after) => resolvePendingActionEffect(get, set, a, after);
  state._resolveRoleActionEffect = (a, after) => resolveRoleActionEffect(get, set, a, after);
  state._checkEndgameAndAdvanceTurn = () => {
    api.pendingAction = null;
    api.turnPhase = 'IDLE';
    api.overlayInstant = null;
  };
  state.addSealsToPlayer = () => {};
  state.closeDuelOutcome = () => closeDuelOutcome(get, set);

  return { get, set, api };
}

{
  const attackerHand = mintDeck(['Вор', 'Шут']);
  const defenderHand = mintDeck(['Рыцарь', 'Шут']);
  const attackerStakeId = attackerHand[0].id;
  const defenderStakeId = defenderHand[0].id;

  const pending: Action = {
    id: 'a1',
    type: 'role',
    name: 'Вор',
    actorId: 'p1',
    targetId: 'p2',
    roleClaim: 'Вор',
    stakedCardId: attackerStakeId,
    costGold: 0,
    costTokens: 1,
    description: ''
  };

  const { get, set, api } = makeHarness({
    pendingAction: pending,
    pendingDuelDefenderCardId: defenderStakeId,
    players: [
      player({ id: 'p1', name: 'Атакующий', hand: attackerHand }),
      player({ id: 'p2', name: 'Защитник', isBot: true, gold: 3, hand: defenderHand })
    ]
  });

  // Attacker tells the truth, defender's shield ("Рыцарь") is a bluff -> breakthrough.
  attackerAcceptDuel(get, set, 'p1');
  assert.equal(api.duelOutcome?.resultType, 'attacker_breakthrough');
  assert.equal(
    api.players.find(p => p.id === 'p1')!.hand.some(c => c.id === attackerStakeId),
    false,
    "the attacker's staked instance has left their hand"
  );
  assert.equal(
    api.players.find(p => p.id === 'p2')!.hand.some(c => c.id === defenderStakeId),
    false,
    "the defender's staked instance has left their hand"
  );

  closeDuelOutcome(get, set);

  assert.equal(api.duelOutcome, null, 'duel outcome modal must close');
  assert.ok(api.pendingAction, 'the winning attack is still resolving');
  // Both clashed stakes have left their hands for good; the presentation layer
  // derives the zone from that, so neither may be re-staged on the table while
  // the winning attack keeps resolving.
  const attacker = api.players.find(p => p.id === 'p1')!;
  const defender = api.players.find(p => p.id === 'p2')!;
  assert.equal(
    attacker.hand.some(c => c.id === api.pendingAction!.stakedCardId),
    false,
    "the attacker's clashed stake must not come back to hand"
  );
  assert.equal(
    defender.hand.some(c => c.id === api.pendingDuelDefenderCardId),
    false,
    "the defender's clashed stake must not come back to hand"
  );
  assert.ok(
    api.discardPile.some(c => c.id === attackerStakeId) &&
      api.discardPile.some(c => c.id === defenderStakeId),
    'both clashed stakes live in the discard once the duel outcome closes'
  );

  timerManager.clearAll();
}

// --- RULES.md §6 rule 2: both revealed duel stakes go to the discard ---
//
// `attackerAcceptDuel` used to pull both stakes out of the hands and push them
// nowhere, destroying two card instances per duel: they left the discard (and
// therefore the reshuffle and the bots' card counting) short, and gave the
// presentation layer two ids with no zone to draw them in.
{
  const cases: {
    resultType: string;
    attackerStake: Role;
    defenderStake: Role;
  }[] = [
    // Attacker claims «Вор», defender shields with «Казначей».
    { resultType: 'clash_blocked', attackerStake: 'Вор', defenderStake: 'Казначей' },
    { resultType: 'attacker_breakthrough', attackerStake: 'Вор', defenderStake: 'Рыцарь' },
    { resultType: 'defender_counter', attackerStake: 'Шут', defenderStake: 'Казначей' },
    { resultType: 'mutual_bluff', attackerStake: 'Шут', defenderStake: 'Рыцарь' }
  ];

  for (const c of cases) {
    const attackerHand = mintDeck([c.attackerStake, 'Наследник']);
    const defenderHand = mintDeck([c.defenderStake, 'Наследник']);
    const attackerStakeId = attackerHand[0].id;
    const defenderStakeId = defenderHand[0].id;
    const deck = mintDeck(['Шантажист']);
    const allIds = [...attackerHand, ...defenderHand, ...deck].map(x => x.id);

    const pending: Action = {
      id: 'a1',
      type: 'role',
      name: 'Вор',
      actorId: 'p1',
      targetId: 'p2',
      roleClaim: 'Вор',
      stakedCardId: attackerStakeId,
      costGold: 0,
      costTokens: 1,
      description: ''
    };

    const { get, set, api } = makeHarness({
      pendingAction: pending,
      pendingDuelDefenderCardId: defenderStakeId,
      pendingDuelDefenderRoleClaim: 'Казначей',
      deck,
      players: [
        player({ id: 'p1', name: 'Атакующий', hand: attackerHand }),
        player({ id: 'p2', name: 'Защитник', isBot: true, hand: defenderHand })
      ]
    });

    assertCardCensus(api, allIds, `${c.resultType}: before the duel`);

    attackerAcceptDuel(get, set, 'p1');

    assert.equal(api.duelOutcome?.resultType, c.resultType, `${c.resultType}: expected outcome`);

    const discardIds = api.discardPile.map(x => x.id);
    assert.ok(
      discardIds.includes(attackerStakeId),
      `${c.resultType}: the attacker's revealed card must be in the discard`
    );
    assert.ok(
      discardIds.includes(defenderStakeId),
      `${c.resultType}: the defender's revealed card must be in the discard`
    );
    assert.equal(
      api.discardPile.find(x => x.id === attackerStakeId)!.card,
      c.attackerStake,
      `${c.resultType}: the discarded instance is the one that was staked, not a copy`
    );
    assert.equal(
      api.discardPile.find(x => x.id === defenderStakeId)!.card,
      c.defenderStake,
      `${c.resultType}: the discarded instance is the one that was staked, not a copy`
    );

    for (const p of api.players) {
      assert.equal(
        p.hand.some(x => x.id === attackerStakeId),
        false,
        `${c.resultType}: the attacker's revealed card must be in no hand`
      );
      assert.equal(
        p.hand.some(x => x.id === defenderStakeId),
        false,
        `${c.resultType}: the defender's revealed card must be in no hand`
      );
    }

    assertCardCensus(api, allIds, `${c.resultType}: after the duel`);

    closeDuelOutcome(get, set);
    assertCardCensus(api, allIds, `${c.resultType}: after the outcome modal closes`);

    timerManager.clearAll();
  }
}

console.log('duelResolver.check: ok');
