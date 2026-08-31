/**
 * Накопители интриг: заряды «Тайного заговора» и монеты «Сети информаторов».
 *
 * У обеих карт счётчик на лице и общее правило кормления: **считается чужая
 * возня при дворе, а не своя.** Держатель, разгоняющий себе счётчик
 * собственными проверками, обесценил бы обе — у него и так есть жетоны на
 * проверки, а карта задумана как плата за чужие споры.
 *
 * Здесь же — три способа уйти со стола. Отыгранная интрига уходит ударом
 * (`spent`), сорванная чужим ударом — дёрганьем (`disrupt`), вытесненная
 * новой или сеть после третьей монеты — молча. Третья монета сети сама по
 * себе — тот же `charge`, что и первые две.
 *
 * Run: npx tsx packages/engine/src/resolvers/plotMeters.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from '../types.ts';
import { mintDeck } from '../cardInstance.ts';
import { useGameStore } from '../GameStore.ts';
import { timerManager } from '../utils/timerManager.ts';
import { INFORMANT_PAYOUTS, initialCharges } from './plotResolver.ts';

function seat(id: string, hand: GameCard[], plot?: Player['activePlot']): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: Number(id.slice(1)),
    isBot: false,
    gold: 6,
    favor: 1,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(hand).map(c => ({ ...c, id: `${id}${c.id}` })),
    activePlot: plot ?? null
  };
}

/** Стол, на котором p1 заявил роль, а двор решает, верить ли. */
function table(seats: Player[], actorId = 'p1') {
  const actor = seats.find(p => p.id === actorId)!;
  useGameStore.setState({
    players: seats,
    deck: mintDeck(['Вор', 'Шут', 'Казначей', 'Наследник']),
    discardPile: [],
    activePlayerId: actorId,
    turnPhase: 'DOUBT_WINDOW',
    turnSubPhase: 'CARD_PLAY_PHASE',
    pendingAction: {
      id: 'a1',
      type: 'role',
      name: 'Наследник',
      roleClaim: 'Наследник',
      actorId,
      stakedCardId: actor.hand[0].id,
      costGold: 0,
      costTokens: 1,
      description: ''
    },
    pendingDoubtDoubterId: null,
    pendingDoubtPassedIds: [],
    plotPulses: [],
    coronations: [],
    winnerId: null,
    history: []
  });
}

const plotOf = (id: string) => useGameStore.getState().players.find(p => p.id === id)!.activePlot;
const goldOf = (id: string) => useGameStore.getState().players.find(p => p.id === id)!.gold;

const conspiracy = (charges: number): Player['activePlot'] =>
  ({ id: 'k', cardId: 'cKons', type: 'Тайный заговор', charges });
const informant = (charges: number): Player['activePlot'] =>
  ({ id: 'i', cardId: 'cSet', type: 'Сеть информаторов', charges });

/* --- 1. Накопитель заводится сам, по типу интриги. ---------------------- */
{
  assert.equal(initialCharges('Тайный заговор'), 0);
  assert.equal(initialCharges('Сеть информаторов'), 0);
  assert.equal(initialCharges('Досье'), undefined, 'у остальных интриг счётчика нет');
  assert.equal(initialCharges('Королевский приём'), undefined);
}

/* --- 2. Своей проверкой Заговор не кормят. ------------------------------ */
{
  table([
    seat('p1', ['Наследник', 'Шут']),
    seat('p2', ['Вор', 'Шут'], conspiracy(1)),
    seat('p3', ['Казначей', 'Шут'], conspiracy(1))
  ]);

  useGameStore.getState().doubtAction('p2');

  assert.equal(plotOf('p2')!.charges, 1, 'проверяющий свой Заговор не заряжает');
  assert.equal(plotOf('p3')!.charges, 2, 'а чужой — заряжает');
  assert.deepEqual(
    useGameStore.getState().plotPulses,
    [{ cardId: 'cKons', kind: 'charge' }],
    'заряженная интрига кивает — и кивает только она'
  );
  timerManager.clearAll();
}

/* --- 3. Дуэль заряжает всех: считается сам факт вызова. ----------------- */
{
  table([
    seat('p1', ['Наследник', 'Дуэлянт']),
    seat('p2', ['Дуэлянт', 'Шут'], conspiracy(0)),
    seat('p3', ['Казначей', 'Шут'], conspiracy(0))
  ]);
  /* Нападение на p2, чтобы ему было чем ответить дуэлью. */
  useGameStore.setState({
    turnPhase: 'TARGET_REACTION_WINDOW',
    pendingAction: { ...useGameStore.getState().pendingAction!, roleClaim: 'Вор', name: 'Вор', targetId: 'p2' }
  });

  const shield = useGameStore.getState().players.find(p => p.id === 'p2')!.hand[0].id;
  useGameStore.getState().targetDeclareDuel('p2', shield);

  assert.equal(plotOf('p2')!.charges, 1, 'вызвавший на дуэль заряжается тоже');
  assert.equal(plotOf('p3')!.charges, 1, 'и посторонний за столом — тоже');
  timerManager.clearAll();
}

/* --- 4. Сеть платит за чужую проверку и считает монеты. ----------------- */
{
  table([
    seat('p1', ['Наследник', 'Шут']),
    seat('p2', ['Вор', 'Шут'], informant(0)),
    seat('p3', ['Казначей', 'Шут'], informant(0))
  ]);
  const before = goldOf('p3');

  useGameStore.getState().doubtAction('p2');

  assert.equal(plotOf('p2')!.charges, 0, 'своя проверка сети не платит');
  assert.equal(plotOf('p3')!.charges, 1, 'чужая — платит и считается');
  assert.equal(goldOf('p3'), before + 1, 'монета действительно пришла');
  assert.deepEqual(
    useGameStore.getState().plotPulses,
    [{ cardId: 'cSet', kind: 'charge' }],
    'принесённая монета видна на самой карте'
  );
  timerManager.clearAll();
}

/* --- 5. Третья монета сворачивает сеть — но это всё та же монета. ------- */
{
  table([
    seat('p1', ['Наследник', 'Шут']),
    seat('p2', ['Вор', 'Шут']),
    seat('p3', ['Казначей', 'Шут'], informant(INFORMANT_PAYOUTS - 1))
  ]);
  const before = goldOf('p3');

  useGameStore.getState().doubtAction('p2');

  const after = useGameStore.getState();
  assert.equal(goldOf('p3'), before + 1, 'последняя монета всё-таки выплачена');
  assert.equal(plotOf('p3'), null, 'и сеть сворачивается');
  assert.ok(
    after.discardPile.some(c => c.id === 'cSet' && c.card === 'Сеть информаторов'),
    'карта ушла в сброс тем же экземпляром'
  );
  assert.deepEqual(
    after.plotPulses,
    [{ cardId: 'cSet', kind: 'charge' }],
    'последняя монета — тот же бейдж, что и первые две, а не удар сработки'
  );
  timerManager.clearAll();
}

/* --- 6. Вытесненная интрига уходит молча. ------------------------------- */
{
  table([
    seat('p1', ['Досье', 'Шут'], informant(1)),
    seat('p2', ['Вор', 'Шут']),
    seat('p3', ['Казначей', 'Шут'])
  ]);
  useGameStore.setState({ turnPhase: 'IDLE', pendingAction: null });

  const newPlot = useGameStore.getState().players[0].hand[0].id;
  useGameStore.getState().playPlotAction('Досье', newPlot, 'p2');

  const after = useGameStore.getState();
  assert.ok(
    after.discardPile.some(c => c.id === 'cSet'),
    'прежняя сеть ушла в сброс сразу при выкладке новой'
  );
  assert.deepEqual(
    after.plotPulses,
    [],
    'но она не отыграна, а вытеснена — такая карта улетает молча'
  );
  timerManager.clearAll();
}

console.log('plotMeters.check: ok');
