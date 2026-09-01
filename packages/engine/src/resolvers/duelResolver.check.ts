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
 *
 * Finally, RULES.md §7: the duel hands out ⚜️ Royal Seals, and the exact count
 * differs per outcome and per Ва-банк. `resolveDuelClash` used to award them
 * BEFORE writing a `players` snapshot taken at the top of the function, so the
 * write silently threw every seal away — an honest duel left both duellists at
 * zero. The matrix below pins all eight outcomes.
 * Run: npx tsx packages/engine/src/resolvers/duelResolver.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, CardInstance, GameCard, GameState, Player, Role } from '../types.ts';
import { targetDeclareDuel, resolveDuelClash, closeDuelOutcome } from './duelResolver.ts';
import { triggerVetoWindowOrResolveEffect, resolvePendingActionEffect } from './doubtResolver.ts';
import { resolveRoleActionEffect } from './roleResolver.ts';
import { addSealsToPlayer } from './sealsResolver.ts';
import { botMemory } from '../bot/botMemory.ts';
import { timerManager } from '../utils/timerManager.ts';
import { assertCardCensus, locateCards } from './cardCensus.check.ts';
import { DEFAULT_RULES } from '../rules.ts';
import { ACTION_HOLD_MS } from '../timing.ts';
import type { Coronation } from './coronation.ts';

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
    turnPhase: 'DUEL_CLASH' as GameState['turnPhase'],
    pendingAction: null as Action | null,
    pendingDuelDefenderCardId: null as string | null,
    pendingDuelDefenderRoleClaim: 'Дуэлянт' as GameState['pendingDuelDefenderRoleClaim'],
    duelOutcome: null,
    isVaBanqueActive: false,
    isVetoed: false,
    vetoChain: 0,
    isPendingActionAfterTruthChallenge: false,
    overlayInstant: null,
    rules: { ...DEFAULT_RULES, crownsToWin: 5 },
    coronations: [] as Coronation[],
    activeSpeechReactions: {} as Record<string, string>,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
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
  // The real seal resolver on purpose: it is what converts 2 ⚜️ into 1 👑, and
  // it is the call whose result the duel used to overwrite.
  state.addSealsToPlayer = (playerId, count) => addSealsToPlayer(get, set, playerId, count);
  state.closeDuelOutcome = () => closeDuelOutcome(get, set);

  return { get, set, api };
}

{
  const attackerHand = mintDeck(['Вор', 'Шут']);
  /* Щит здесь обязан быть блефом: заявлен «Дуэлянт», на стол ляжет «Казначей».
     Иначе сценарий проверяет не прорыв, а блокировку. */
  const defenderHand = mintDeck(['Казначей', 'Шут']);
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

  // Атакующий сказал правду, щит защищающегося — блеф: атака проходит.
  resolveDuelClash(get, set);
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
// `resolveDuelClash` used to pull both stakes out of the hands and push them
// nowhere, destroying two card instances per duel: they left the discard (and
// therefore the reshuffle and the bots' card counting) short, and gave the
// presentation layer two ids with no zone to draw them in.
{
  const cases: {
    resultType: string;
    attackerStake: Role;
    defenderStake: Role;
  }[] = [
    /* Атака «Вор», щит — «Дуэлянт»: он теперь один на обе атаки, Казначей
       от Вора больше не защищает. */
    { resultType: 'clash_blocked', attackerStake: 'Вор', defenderStake: 'Дуэлянт' },
    { resultType: 'attacker_breakthrough', attackerStake: 'Вор', defenderStake: 'Казначей' },
    { resultType: 'defender_counter', attackerStake: 'Шут', defenderStake: 'Дуэлянт' },
    { resultType: 'mutual_bluff', attackerStake: 'Шут', defenderStake: 'Казначей' }
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
      pendingDuelDefenderRoleClaim: 'Дуэлянт',
      deck,
      players: [
        player({ id: 'p1', name: 'Атакующий', hand: attackerHand }),
        player({ id: 'p2', name: 'Защитник', isBot: true, hand: defenderHand })
      ]
    });

    assertCardCensus(api, allIds, `${c.resultType}: before the duel`);

    resolveDuelClash(get, set);

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

    if (c.resultType === 'attacker_breakthrough') {
      assert.ok(api.pendingAction, 'пробитие: заявление остаётся — карта нападающего ждёт вето');
      assert.equal(api.turnPhase, 'VETO_WINDOW', 'пробитие открывает окно вето, а не снимает стол');
    } else {
      assert.equal(
        api.pendingAction,
        null,
        `${c.resultType}: заявление снимается сразу — карты улетают в сброс, а не возвращаются в лунку заявки`
      );
      assert.equal(api.turnPhase, 'IDLE', `${c.resultType}: стол свободен после дуэли без пробития`);
    }

    timerManager.clearAll();
  }
}

// --- RULES.md §7: печати за дуэль, все 8 исходов (2 × 2 × Ва-банк) ---
//
// The bug: seals were handed out by `addSealsToPlayer` (which reads
// `get().players` and writes the whole array back) and only THEN did the duel
// write its own `players` snapshot, taken before any of that. Every award was
// thrown away — an honest duel that owes both sides +1 ⚜️ left both at 0.
{
  interface SealCase {
    label: string;
    attackerTruth: boolean;
    defenderTruth: boolean;
    vaBanque: boolean;
    startSeals: number;
    resultType: string;
    /** [⚜️ печати, 👑 короны] после дуэли */
    attacker: [number, number];
    defender: [number, number];
    sealsWinnerId?: string;
  }

  const cases: SealCase[] = [
    // Оба сказали правду — «реальная защита полностью нивелирует Ва-банк»:
    // по одной печати каждому, с Ва-банком и без него одинаково.
    {
      label: 'честная дуэль',
      attackerTruth: true, defenderTruth: true, vaBanque: false, startSeals: 0,
      resultType: 'clash_blocked', attacker: [1, 3], defender: [1, 3]
    },
    {
      label: 'честная дуэль под Ва-банком',
      attackerTruth: true, defenderTruth: true, vaBanque: true, startSeals: 0,
      resultType: 'clash_blocked', attacker: [1, 3], defender: [1, 3]
    },
    // Блефовал защитник — пробитие: нападающий получает добычу и печать,
    // но под Ва-банком добыча удваивается, а печать НЕ выдаётся вовсе.
    {
      label: 'пробитие защиты',
      attackerTruth: true, defenderTruth: false, vaBanque: false, startSeals: 0,
      resultType: 'attacker_breakthrough', attacker: [1, 3], defender: [0, 3],
      sealsWinnerId: 'p1'
    },
    {
      label: 'пробитие защиты под Ва-банком',
      attackerTruth: true, defenderTruth: false, vaBanque: true, startSeals: 0,
      resultType: 'attacker_breakthrough', attacker: [0, 3], defender: [0, 3],
      sealsWinnerId: undefined
    },
    // Блефовал нападающий — контратака щитом: 1 ⚜️ защитнику, 2 ⚜️ под Ва-банком
    // (две печати тут же складываются в 1 👑).
    {
      label: 'контратака щитом',
      attackerTruth: false, defenderTruth: true, vaBanque: false, startSeals: 0,
      resultType: 'defender_counter', attacker: [0, 3], defender: [1, 3],
      sealsWinnerId: 'p2'
    },
    {
      label: 'контратака щитом под Ва-банком',
      attackerTruth: false, defenderTruth: true, vaBanque: true, startSeals: 0,
      resultType: 'defender_counter', attacker: [0, 3], defender: [0, 4],
      sealsWinnerId: 'p2'
    },
    // Оба блефовали — никто ничего не получает, Ва-банк ничего не меняет.
    {
      label: 'оба попались',
      attackerTruth: false, defenderTruth: false, vaBanque: false, startSeals: 0,
      resultType: 'mutual_bluff', attacker: [0, 3], defender: [0, 3]
    },
    {
      label: 'оба попались под Ва-банком',
      attackerTruth: false, defenderTruth: false, vaBanque: true, startSeals: 0,
      resultType: 'mutual_bluff', attacker: [0, 3], defender: [0, 3]
    },
    // И конверсия 2 ⚜️ → 1 👑 тоже обязана пережить дуэль: у обоих уже по одной
    // печати, честная дуэль добавляет вторую.
    {
      label: 'честная дуэль добивает вторую печать до короны',
      attackerTruth: true, defenderTruth: true, vaBanque: false, startSeals: 1,
      resultType: 'clash_blocked', attacker: [0, 4], defender: [0, 4]
    }
  ];

  for (const c of cases) {
    const attackerStake: Role = c.attackerTruth ? 'Вор' : 'Шут';
    const defenderStake: Role = c.defenderTruth ? 'Дуэлянт' : 'Казначей';
    const attackerHand = mintDeck([attackerStake, 'Наследник']);
    const defenderHand = mintDeck([defenderStake, 'Наследник']);
    const attackerStakeId = attackerHand[0].id;
    const defenderStakeId = defenderHand[0].id;
    const allIds = [...attackerHand, ...defenderHand].map(x => x.id);

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
      pendingDuelDefenderRoleClaim: 'Дуэлянт',
      isVaBanqueActive: c.vaBanque,
      players: [
        player({ id: 'p1', name: 'Атакующий', hand: attackerHand, seals: c.startSeals, favor: 3 }),
        player({ id: 'p2', name: 'Защитник', isBot: true, hand: defenderHand, seals: c.startSeals, favor: 3 })
      ]
    });

    resolveDuelClash(get, set);

    assert.equal(api.duelOutcome?.resultType, c.resultType, `${c.label}: исход дуэли`);
    assert.equal(api.duelOutcome?.sealsWinnerId, c.sealsWinnerId, `${c.label}: sealsWinnerId`);

    const attacker = api.players.find(p => p.id === 'p1')!;
    const defender = api.players.find(p => p.id === 'p2')!;
    assert.deepEqual(
      [attacker.seals, attacker.favor],
      c.attacker,
      `${c.label}: у нападающего должно стать [⚜️, 👑] = ${JSON.stringify(c.attacker)}, а стало ${JSON.stringify([attacker.seals, attacker.favor])}`
    );
    assert.deepEqual(
      [defender.seals, defender.favor],
      c.defender,
      `${c.label}: у защитника должно стать [⚜️, 👑] = ${JSON.stringify(c.defender)}, а стало ${JSON.stringify([defender.seals, defender.favor])}`
    );

    // Начисление печатей переписывает весь массив игроков — руки и сброс,
    // изменённые дуэлью, обязаны это пережить.
    assertCardCensus(api, allIds, `${c.label}: после начисления печатей`);
    assert.ok(
      api.discardPile.some(x => x.id === attackerStakeId) &&
        api.discardPile.some(x => x.id === defenderStakeId),
      `${c.label}: обе вскрытые карты остаются в сбросе после начисления печатей`
    );

    timerManager.clearAll();
  }

  // Названные в спецификации крайние случаи, проговорённые отдельно, чтобы
  // регрессия читалась по имени, а не по строке таблицы.
  const breakthroughVB = cases.find(c => c.label === 'пробитие защиты под Ва-банком')!;
  assert.equal(breakthroughVB.attacker[0], 0, 'пробитие под Ва-банком не даёт нападающему НИ ОДНОЙ ⚜️');
  assert.equal(breakthroughVB.attacker[1], 3, 'и корон за пробитие под Ва-банком тоже нет');
  for (const honest of cases.filter(c => c.resultType === 'clash_blocked' && c.startSeals === 0)) {
    assert.deepEqual(
      [honest.attacker, honest.defender],
      [[1, 3], [1, 3]],
      'честная дуэль даёт ровно по одной ⚜️ каждому — независимо от Ва-банка'
    );
  }
}

// --- RULES.md §7: выставленный щит разыгрывает дуэль сам ---
//
// Согласия нападающего не спрашивают: фазы «принять бой / отступить» больше
// нет, и отступления вместе с ней. Объявление ставит стол в `DUEL_CLASH` —
// такт, за который карты сходятся, — и розыгрыш приходит сам, без единого
// решения со стороны атакующего.
{
  const attackerHand = mintDeck(['Вор', 'Наследник']);
  /* Обе правды: щит двора — «Дуэлянт», и он же лежит у защитника на руке. */
  const defenderHand = mintDeck(['Дуэлянт', 'Шут']);
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
    turnPhase: 'TARGET_REACTION_WINDOW',
    pendingAction: pending,
    pendingDuelDefenderCardId: null,
    pendingDuelDefenderRoleClaim: null,
    players: [
      player({ id: 'p1', name: 'Атакующий', hand: attackerHand, seals: 0, favor: 3 }),
      player({ id: 'p2', name: 'Защитник', isBot: true, hand: defenderHand, seals: 0, favor: 3 })
    ]
  });

  targetDeclareDuel(get, set, 'p2', defenderStakeId);
  assert.equal(api.turnPhase, 'DUEL_CLASH', 'щит выставлен — стол в такте схождения');
  assert.equal(
    api.players.find(p => p.id === 'p1')!.hand.some(c => c.id === attackerStakeId),
    true,
    'до схождения карта нападающего ещё в руке'
  );

  await new Promise(resolve => setTimeout(resolve, ACTION_HOLD_MS + 120));

  assert.equal(
    api.duelOutcome?.resultType,
    'clash_blocked',
    'дуэль разрешилась сама: обе правды, атака заблокирована'
  );
  assert.deepEqual(
    api.players.map(p => p.seals),
    [1, 1],
    'честная дуэль дала по печати каждому — и согласия нападающего не потребовалось'
  );

  timerManager.clearAll();
}

console.log('duelResolver.check: ok');
