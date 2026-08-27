/**
 * Self-check: `deriveTableView` — единственный источник того, что видно.
 *
 * Случай, ради которого всё затевалось, — №3: два разных `pendingAction.id`
 * при одинаковом видимом содержимом обязаны дать один и тот же `view.id`.
 * Именно на нём строятся ключи `AnimatePresence`, и именно его нестабильность
 * пересоздавала правую колонку на каждый ход бота.
 *
 * Run: npx tsx apps/web/src/lib/tableView.check.ts
 */
import assert from 'node:assert/strict';
import { deriveTableView } from './tableView.ts';
import type { TableViewInput } from './tableView.ts';
import type { Action, GameCard, Player } from '@kinglier/engine/types';
import type { CardInstance } from '@kinglier/engine/cardInstance';

let seq = 0;
function hand(...cards: GameCard[]): CardInstance[] {
  return cards.map(card => ({ id: `c${seq++}`, card }));
}

function player(id: string, over: Partial<Player> = {}): Player {
  return {
    id,
    name: id.toUpperCase(),
    avatar: '',
    seatNumber: Number(id.slice(1)),
    isBot: id !== 'p1',
    gold: 10,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: hand('Наследник', 'Рыцарь'),
    activePlot: null,
    ...over
  };
}

function input(over: Partial<TableViewInput> = {}): TableViewInput {
  return {
    players: [player('p1'), player('p2'), player('p3')],
    activePlayerId: 'p1',
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE',
    pendingAction: null,
    pendingDoubtDoubterId: null,
    pendingDoubtPassedIds: [],
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
    isVetoed: false,
    vetoDeadlineAt: null,
    coronationCandidateId: null,
    ...over
  };
}

function action(over: Partial<Action> = {}): Action {
  return {
    id: 'a1',
    type: 'role',
    name: 'Наследник',
    roleClaim: 'Наследник',
    actorId: 'p2',
    costGold: 0,
    costTokens: 1,
    description: '',
    ...over
  };
}

// 1. Свой ход: две кнопки в панели, у каждой карты — розыгрыш, блеф, подробнее.
{
  const view = deriveTableView(input(), 'p1');
  assert.equal(view.phase, 'turn');
  assert.deepEqual(
    view.bar.map(b => b.kind),
    ['court-actions', 'end-turn'],
    'заговора нет — значит и кнопки заговора нет'
  );
  assert.equal(view.viewerHandIds.length, 2, 'у зрителя две карты — два меню');
  for (const cardId of view.viewerHandIds) {
    assert.deepEqual(
      view.menus[cardId].map(o => o.kind),
      ['play', 'bluff', 'inspect'],
      'роль в свой ход играется, блефуется и читается'
    );
  }
}

// 2. Чужой ход: кнопок нет, у своих карт остаётся только «Подробнее».
{
  const view = deriveTableView(input({ activePlayerId: 'p2' }), 'p1');
  assert.equal(view.phase, 'waiting');
  assert.deepEqual(view.bar, [], 'в чужой ход нажимать нечего');
  assert.deepEqual(
    view.menus[view.viewerHandIds[0]].map(o => o.kind),
    ['inspect'],
    'чужой ход — карту можно только прочитать'
  );
}

// 3. ГЛАВНОЕ: id не зависит от того, что не видно.
{
  const a = deriveTableView(
    input({ activePlayerId: 'p2', pendingAction: action({ id: 'a1' }), turnPhase: 'DOUBT_WINDOW' }),
    'p1'
  );
  const b = deriveTableView(
    input({ activePlayerId: 'p2', pendingAction: action({ id: 'a2' }), turnPhase: 'DOUBT_WINDOW' }),
    'p1'
  );
  assert.equal(a.id, b.id, 'другой id действия при том же видимом — тот же view.id');

  const c = deriveTableView(
    input({
      activePlayerId: 'p2',
      pendingAction: action({ id: 'a1', roleClaim: 'Вор' }),
      turnPhase: 'DOUBT_WINDOW'
    }),
    'p1'
  );
  assert.notEqual(a.id, c.id, 'сменилась заявка — сменился view.id');
}

// 4. Нападение: щит против Вора — Казначей, у него «дуэль: защита».
{
  const attacked = input({
    activePlayerId: 'p2',
    turnPhase: 'TARGET_REACTION_WINDOW',
    pendingAction: action({ roleClaim: 'Вор', targetId: 'p1' }),
    players: [
      player('p1', { hand: hand('Казначей', 'Перенаправление') }),
      player('p2'),
      player('p3')
    ]
  });
  const view = deriveTableView(attacked, 'p1');
  assert.equal(view.phase, 'under-attack');
  assert.deepEqual(view.bar.map(b => b.kind), ['accept-attack', 'doubt']);
  const [shieldId, redirectId] = view.viewerHandIds;
  assert.deepEqual(view.menus[shieldId].map(o => o.kind), ['duel-shield', 'inspect']);
  assert.deepEqual(view.menus[redirectId].map(o => o.kind), ['play', 'duel-bluff', 'inspect']);
}

// 5. Нападение чужой ролью: карта, не являющаяся щитом, идёт только в блеф-дуэль.
{
  const attacked = input({
    activePlayerId: 'p2',
    turnPhase: 'TARGET_REACTION_WINDOW',
    pendingAction: action({ roleClaim: 'Шантажист', targetId: 'p1' }),
    players: [player('p1', { hand: hand('Шут', 'Рыцарь') }), player('p2'), player('p3')]
  });
  const view = deriveTableView(attacked, 'p1');
  const [jester, knight] = view.viewerHandIds;
  assert.deepEqual(view.menus[jester].map(o => o.kind), ['duel-bluff', 'inspect']);
  assert.deepEqual(
    view.menus[knight].map(o => o.kind),
    ['duel-shield', 'inspect'],
    'против Шантажиста щит — Рыцарь'
  );
}

// 6. Окно вето: кнопок нет, вето играется картой, дедлайн доезжает до модели.
{
  const deadline = 1_000_000;
  const view = deriveTableView(
    input({
      turnPhase: 'VETO_WINDOW',
      activePlayerId: 'p2',
      pendingAction: action(),
      vetoDeadlineAt: deadline,
      players: [player('p1', { hand: hand('Право вето', 'Шут') }), player('p2'), player('p3')]
    }),
    'p1'
  );
  assert.equal(view.phase, 'veto');
  assert.deepEqual(view.bar, [], 'в окне вето кнопок нет — только карта');
  assert.equal(view.deadlineAt, deadline);
  const [vetoId, jesterId] = view.viewerHandIds;
  assert.deepEqual(view.menus[vetoId].map(o => o.kind), ['veto', 'inspect']);
  assert.deepEqual(view.menus[jesterId].map(o => o.kind), ['inspect']);
}

// 7. Глухие кнопки остаются видимыми и объясняют себя одним словом.
{
  const view = deriveTableView(
    input({ players: [player('p1', { actionTokens: 0 }), player('p2'), player('p3')] }),
    'p1'
  );
  const court = view.bar.find(b => b.kind === 'court-actions')!;
  assert.equal(court.disabled, true);
  assert.equal(court.reason, 'нет ⚡');

  const spent = deriveTableView(input({ hasUsedNormalActionThisTurn: true }), 'p1');
  assert.equal(spent.bar.find(b => b.kind === 'court-actions')!.reason, 'уже было');
}

// 8. Реактивные инстанты и Ва-банк в свой ход не «разыгрываются».
{
  const view = deriveTableView(
    input({
      players: [player('p1', { hand: hand('Право вето', 'Ва-банк') }), player('p2'), player('p3')]
    }),
    'p1'
  );
  for (const id of view.viewerHandIds) {
    assert.deepEqual(view.menus[id].map(o => o.kind), ['bluff', 'inspect']);
  }
}

// 9. Пустой стол. На первом кадре партии `players` ещё пуст — модель обязана
//    пережить это, а не уронить приложение: хук считается до того, как App
//    успевает отрисовать заставку «СОЗЫВ ДВОРА».
{
  const view = deriveTableView(input({ players: [] }), 'p1');
  assert.equal(view.phase, 'waiting');
  assert.deepEqual(view.bar, []);
  assert.deepEqual(view.viewerHandIds, []);
  assert.deepEqual(view.menus, {});
  assert.equal(view.actor, null);
}

console.log('tableView.check: ok');
