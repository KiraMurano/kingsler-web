/**
 * Online games can seat 2+ real humans. A DOUBT_WINDOW must stay open until
 * every non-actor human has weighed in — one player's "Верю" must not
 * resolve the check on behalf of the others. Run:
 *   npx tsx src/resolvers/doubtResolver.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, CardInstance, GameCard, GameState, Player } from '../types.ts';
import { mintDeck } from '../cardInstance.ts';
import { useGameStore } from '../GameStore.ts';
import { executeRevealOutcome } from './doubtResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { ACTION_HOLD_MS } from '../timing.ts';
import { DEFAULT_RULES } from '../rules.ts';
import type { Coronation } from './coronation.ts';

function human(id: string, hand: GameCard[]): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 2,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(hand),
    activePlot: null
  };
}

function bot(id: string, hand: GameCard[]): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: 2,
    isBot: true,
    gold: 0,
    favor: 0,
    seals: 0,
    actionTokens: 0, // can't doubt — keeps this check deterministic
    hand: mintDeck(hand),
    activePlot: null
  };
}

useGameStore.getState().startGame();
useGameStore.setState({
  players: [
    human('p1', ['Наследник', 'Шут']),
    human('p2', ['Казначей', 'Дуэлянт']),
    human('p3', ['Вор', 'Шут']),
    bot('b1', ['Казначей', 'Дуэлянт'])
  ],
  activePlayerId: 'p1',
  opening: null
});

useGameStore.getState().performAction({
  type: 'role',
  name: 'Наследник',
  roleClaim: 'Наследник',
  actorId: 'p1',
  stakedCardId: useGameStore.getState().players.find(p => p.id === 'p1')!.hand[0].id,
  costGold: 0,
  costTokens: 1,
  description: ''
});
assert.equal(useGameStore.getState().turnPhase, 'DOUBT_WINDOW');

useGameStore.getState().passDoubt('p2');
assert.equal(
  useGameStore.getState().turnPhase,
  'DOUBT_WINDOW',
  'p3 has not passed yet — the window must stay open, not resolve on p2 alone'
);
assert.ok(useGameStore.getState().pendingAction, 'action must still be pending while p3 has not reacted');

// p2 clicking twice (e.g. a double network retry) must not fool the count.
useGameStore.getState().passDoubt('p2');
assert.equal(useGameStore.getState().turnPhase, 'DOUBT_WINDOW', 'a repeated pass from the same player must not count twice');

useGameStore.getState().passDoubt('p3');
assert.equal(
  useGameStore.getState().turnPhase,
  'DOUBT_WINDOW',
  'бот тоже участник опроса: пока он не ответил, двор не опрошен'
);

/* Заявивший в опросе не участвует — его «Верю» ничего не двигает. */
useGameStore.getState().passDoubt('p1');
assert.equal(useGameStore.getState().turnPhase, 'DOUBT_WINDOW', 'the claimant does not answer their own claim');

/* В партии за бота это делает его собственный таймер (`handleDoubtPhase`);
   здесь движок ботов не поднят, поэтому отвечаем за него руками. */
useGameStore.getState().passDoubt('b1');
assert.equal(
  useGameStore.getState().turnPhase,
  'VETO_WINDOW',
  'everyone but the claimant has answered — the check is settled and the veto window opens'
);

/* --- Окно сомнения одноразовое: заявленную проверку уже не отменить. ---
 *
 * Софтлок, ради которого этот случай написан. `passDoubt` не смотрел, не
 * объявил ли кто-то проверку раньше: поздняя «Верю» звала `timerManager.
 * clearAll()`, снимала отложенное вскрытие и уводила действие по ветке «двор
 * не оспорил». Проверка при этом уже состоялась — жетон потрачен, заговоры
 * заряжены, — а `pendingDoubtDoubterId` очищается ровно в одном месте, во
 * вскрытии, которого больше не будет. Флаг оставался поднятым навсегда: боты
 * (у них guard `!pendingDoubtDoubterId`) переставали и сомневаться, и
 * пропускать, а правая колонка застревала на виде `reveal` и не показывала
 * человеку «Верю / Не верю». Партия вставала намертво. */
{
  /* Ровно расстановка из отчёта: ходит бот, проверяет другой бот, а человек
     сидит наблюдателем — его «Верю» и приходило последним. */
  useGameStore.getState().startGame();
  useGameStore.setState({
    players: [
      human('p1', ['Вор', 'Шут']),
      { ...bot('b1', ['Казначей', 'Дуэлянт']), actionTokens: 2 },
      { ...bot('b2', ['Наследник', 'Шут']), actionTokens: 2 }
    ],
    activePlayerId: 'b1',
    opening: null
  });

  useGameStore.getState().performAction({
    type: 'role',
    name: 'Казначей',
    roleClaim: 'Казначей',
    actorId: 'b1',
    stakedCardId: useGameStore.getState().players.find(p => p.id === 'b1')!.hand[0].id,
    costGold: 0,
    costTokens: 1,
    description: ''
  });
  assert.equal(useGameStore.getState().turnPhase, 'DOUBT_WINDOW');

  useGameStore.getState().doubtAction('b2');
  assert.equal(useGameStore.getState().pendingDoubtDoubterId, 'b2', 'проверка заявлена');

  // Поздняя «Верю» от человека — уже ничего не решает.
  useGameStore.getState().passDoubt('p1');
  assert.equal(
    useGameStore.getState().pendingDoubtDoubterId,
    'b2',
    'проверка остаётся заявленной — «Верю» её не снимает'
  );
  assert.ok(
    !useGameStore.getState().history.some(h => h.includes('не оспорено')),
    'действие не может считаться неоспоренным после объявленной проверки'
  );

  // И вторая проверка поверх первой тоже не проходит.
  useGameStore.getState().doubtAction('p1');
  assert.equal(
    useGameStore.getState().pendingDoubtDoubterId,
    'b2',
    'проверяет тот, кто успел первым'
  );

  // Вскрытие всё-таки происходит — и снимает флаг.
  await new Promise(resolve => setTimeout(resolve, ACTION_HOLD_MS + 300));
  assert.ok(useGameStore.getState().revealOutcome, 'отложенное вскрытие состоялось');
  assert.equal(
    useGameStore.getState().pendingDoubtDoubterId,
    null,
    'вскрытие снимает флаг — иначе следующий ход не получит окна сомнения'
  );

  timerManager.clearAll();
}

// --- The VETO_WINDOW belongs to the clock, not to a click. ---
// There is no "Продолжить" any more: nobody — not even every non-actor human
// together — can shorten the window, because a window that closes early is
// itself a tell about who is holding what.
useGameStore.getState().startGame();
useGameStore.setState({
  players: [
    human('p1', ['Наследник', 'Шут']),
    human('p2', ['Казначей', 'Дуэлянт']),
    human('p3', ['Право вето', 'Шут'])
  ],
  activePlayerId: 'p1',
  opening: null
});

const vetoTestAction = {
  id: 'a-veto',
  type: 'role' as const,
  name: 'Наследник',
  roleClaim: 'Наследник' as const,
  actorId: 'p1',
  stakedCardId: useGameStore.getState().players.find(p => p.id === 'p1')!.hand[0].id,
  costGold: 0,
  costTokens: 1,
  description: ''
};
useGameStore.setState({ pendingAction: vetoTestAction });
useGameStore.getState()._triggerVetoWindowOrResolveEffect(vetoTestAction, false);
assert.equal(useGameStore.getState().turnPhase, 'VETO_WINDOW');

/* Окно держится ответами, а не часами: само оно не закроется никогда, сколько
   ни жди — закрывает его последний ответивший. */
assert.deepEqual(
  useGameStore.getState().pendingVetoPassedIds,
  [],
  'опрос открыт и пуст'
);

await new Promise(resolve => setTimeout(resolve, 2500));
assert.equal(
  useGameStore.getState().turnPhase,
  'VETO_WINDOW',
  'без ответов окно стоит: таймера, который закрыл бы его сам, больше нет'
);

/* Отвечают все, кроме автора действия: его собственный ход у него самого не
   спрашивают, пока поверх не легло чужое вето. */
for (const p of useGameStore.getState().players) {
  if (p.id === 'p1') continue;
  useGameStore.getState().passVeto(p.id);
}
await new Promise(resolve => setTimeout(resolve, ACTION_HOLD_MS + 300));
assert.equal(
  useGameStore.getState().turnPhase,
  'IDLE',
  'ответил последний — окно закрылось и действие состоялось'
);

/* -------------------------------------------------------------------------
 * Reveal must only ever take the staked card. Addressing the stake by hand
 * index used to alias onto the neighbour once the splice shortened the hand,
 * which made the surviving card disappear from the player's hand in the UI.
 * ---------------------------------------------------------------------- */

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 4,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(['Наследник', 'Шут']),
    activePlot: null,
    ...partial
  };
}

function makeHarness(overrides: Partial<GameState> = {}) {
  const api = {
    players: [] as Player[],
    deck: [] as CardInstance[],
    discardPile: [] as CardInstance[],
    activePlayerId: 'p1',
    turnPhase: 'DOUBT_WINDOW' as GameState['turnPhase'],
    turnSubPhase: 'CARD_PLAY_PHASE' as GameState['turnSubPhase'],
    rules: DEFAULT_RULES,
    coronations: [] as Coronation[],
    pendingAction: null as Action | null,
    pendingDoubtDoubterId: null as string | null,
    isVaBanqueActive: false,
    isVetoed: false,
    vetoChain: 0,
    isPendingActionAfterTruthChallenge: false,
    revealOutcome: null as GameState['revealOutcome'],
    activeSpeechReactions: {} as Record<string, string>,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    overlayInstant: null,
    history: [] as string[],
    ...overrides
  };

  const get = () => api as unknown as GameState;
  const set = (partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)) => {
    const patch = typeof partial === 'function' ? partial(get()) : partial;
    Object.assign(api, patch);
  };

  const state = api as unknown as GameState;
  state.addSealsToPlayer = () => {};
  state.closeRevealOutcome = () => {};
  state._checkEndgameAndAdvanceTurn = () => {};
  state._triggerVetoWindowOrResolveEffect = () => {};

  return { get, set, api };
}

// The reported bug: revealing the staked card must not make the OTHER card
// in hand un-findable. Addressing by index used to alias onto the survivor
// once the splice shortened the hand.
{
  const hand = mintDeck(['Наследник', 'Шут']);
  const stakedId = hand[0].id;
  const survivorId = hand[1].id;

  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand }),
      player({ id: 'p2', name: 'Борис', isBot: true, hand: mintDeck(['Казначей', 'Дуэлянт']) })
    ]
  });

  const action: Action = {
    id: 'bug1',
    type: 'role',
    name: 'Наследник',
    actorId: 'p1',
    roleClaim: 'Наследник',
    stakedCardId: stakedId,
    costGold: 0,
    costTokens: 1,
    description: ''
  };
  api.pendingAction = action;

  executeRevealOutcome(get, set, 'p2');

  const actor = api.players.find(p => p.id === 'p1')!;
  assert.equal(actor.hand.length, 1, 'only the staked card leaves the hand');
  assert.equal(actor.hand[0].id, survivorId, 'the survivor keeps its own identity');
  assert.ok(
    api.discardPile.some(c => c.id === stakedId),
    'the staked instance is the one that reached the discard'
  );
  timerManager.clearAll();
}

// Same guarantee when the staked card is the SECOND one in hand — the case
// index addressing got outright wrong, revealing (and discarding) the
// neighbour instead of the card that was actually put on the table.
{
  const hand = mintDeck(['Шут', 'Наследник']);
  const stakedId = hand[1].id;
  const survivorId = hand[0].id;

  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand }),
      player({ id: 'p2', name: 'Борис', isBot: true, hand: mintDeck(['Казначей', 'Дуэлянт']) })
    ]
  });

  const action: Action = {
    id: 'bug2',
    type: 'role',
    name: 'Наследник',
    actorId: 'p1',
    roleClaim: 'Наследник',
    stakedCardId: stakedId,
    costGold: 0,
    costTokens: 1,
    description: ''
  };
  api.pendingAction = action;

  executeRevealOutcome(get, set, 'p2');

  const actor = api.players.find(p => p.id === 'p1')!;
  assert.equal(api.revealOutcome?.revealedRole, 'Наследник', 'the card on the table is the one revealed');
  assert.equal(api.revealOutcome?.wasTruth, true, 'the claim matches the staked card, so it is the truth');
  assert.equal(actor.hand.length, 1, 'only the staked card leaves the hand');
  assert.equal(actor.hand[0].id, survivorId, 'the survivor keeps its own identity');
  assert.ok(
    api.discardPile.some(c => c.id === stakedId),
    'the staked instance is the one that reached the discard'
  );
  timerManager.clearAll();
}

console.log('doubtResolver.check.ts passed.');
