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
import { DEFAULT_RULES } from '@kinglier/engine/rules';

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
    vetoOnVeto: false,
    rules: DEFAULT_RULES,
    vaBanqueArmed: false,
    vetoDeadlineAt: null,
    coronationCandidateId: null,
    revealOutcome: null,
    duelOutcome: null,
    exchangePick: null,
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

// 7. Глухая кнопка остаётся видимой и объясняет себя — но тултипом, а не
//    подписью внутри себя: подпись меняла высоту кнопки и ломала ряд.
{
  const view = deriveTableView(
    input({ players: [player('p1', { actionTokens: 0 }), player('p2'), player('p3')] }),
    'p1'
  );
  const court = view.bar.find(b => b.kind === 'court-actions')!;
  assert.equal(court.disabled, true);
  assert.match(court.reason!, /^Нет жетонов/, 'причина — фраза с большой буквы');
  assert.equal(court.tokenBlocked, true, 'жетонов нет — молнию перечёркиваем');

  // А вот когда жетоны есть, но действие уже было, перечёркивать молнию нельзя:
  // она бы врала, будто дело в жетонах.
  const spent = deriveTableView(input({ hasUsedNormalActionThisTurn: true }), 'p1');
  const spentCourt = spent.bar.find(b => b.kind === 'court-actions')!;
  assert.equal(spentCourt.disabled, true);
  assert.match(spentCourt.reason!, /^Действие двора уже было/);
  assert.equal(spentCourt.tokenBlocked, false, 'жетоны на месте — запрет не рисуем');
}

// 7b. Подсказка есть у каждой кнопки в каждой фазе: тултип без текста —
//     это кнопка, о которой игроку негде спросить.
{
  const фазы = [
    input(),
    input({ activePlayerId: 'p2', turnPhase: 'DOUBT_WINDOW', pendingAction: action() }),
    input({
      activePlayerId: 'p2',
      turnPhase: 'TARGET_REACTION_WINDOW',
      pendingAction: action({ roleClaim: 'Вор', targetId: 'p1' })
    }),
    input({
      activePlayerId: 'p1',
      turnPhase: 'DUEL_ATTACKER_WINDOW',
      pendingAction: action({ actorId: 'p1', targetId: 'p2' })
    })
  ];
  for (const состояние of фазы) {
    const view = deriveTableView(состояние, 'p1');
    for (const b of view.bar) {
      assert.ok(b.hint && b.hint.length > 10, `у кнопки «${b.label}» нет подсказки`);
    }
  }
}

// 7c. Подсказка фазы говорит, что делать, и не пуста ни в одной фазе.
{
  for (const состояние of [
    input(),
    input({ activePlayerId: 'p2' }),
    input({ activePlayerId: 'p2', turnPhase: 'DOUBT_WINDOW', pendingAction: action() }),
    input({ turnPhase: 'VETO_WINDOW', pendingAction: action(), vetoDeadlineAt: 1 })
  ]) {
    const view = deriveTableView(состояние, 'p1');
    assert.ok(view.guidance.length > 0, `пустая подсказка в фазе ${view.phase}`);
  }
}

// 8. Реактивные инстанты и Ва-банк в свой ход не «разыгрываются».
{
  const view = deriveTableView(
    input({
      players: [player('p1', { hand: hand('Право вето', 'Ва-банк') }), player('p2'), player('p3')]
    }),
    'p1'
  );
  /* Ни вето, ни Ва-банк не разыгрываются по номиналу в свой ход: первое ждёт
     своего окна, второй — модификатор. Сблефовать ими можно обоими.

     У «Права вето» при этом есть переключатель Ва-банка: блеф — это заявление
     роли, и удвоить его законно. У самого Ва-банка переключателя нет — к себе
     он не подключается. */
  const [vetoId, vbId] = view.viewerHandIds;
  assert.deepEqual(view.menus[vetoId].map(o => o.kind), ['vabanque', 'bluff', 'inspect']);
  assert.deepEqual(view.menus[vbId].map(o => o.kind), ['bluff', 'inspect']);
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
  assert.ok(view.guidance.length > 0, 'даже на пустом столе есть что сказать');
}

// 10. Что произошло — короткой фразой, и только своими словами.
{
  // Чужая заявка.
  const заявка = deriveTableView(
    input({ activePlayerId: 'p2', pendingAction: action({ roleClaim: 'Шут' }) }),
    'p1'
  );
  assert.match(заявка.event, /P2 заявляет «Шут»/);

  // Целевая заявка называет жертву.
  const целевая = deriveTableView(
    input({
      activePlayerId: 'p2',
      pendingAction: action({ roleClaim: 'Вор', targetId: 'p3' })
    }),
    'p1'
  );
  assert.match(целевая.event, /на P3/);

  // Действие двора.
  const двор = deriveTableView(
    input({
      activePlayerId: 'p2',
      pendingAction: action({ type: 'normal', name: 'Устроить пир', roleClaim: undefined })
    }),
    'p1'
  );
  assert.match(двор.event, /P2: устроить пир/);

  // Разоблачение с печатью — то, ради чего блок и просили вернуть.
  const блеф = deriveTableView(
    input({
      activePlayerId: 'p2',
      revealOutcome: {
        accuserId: 'p1',
        accusedId: 'p2',
        claimedRole: 'Шут',
        wasTruth: false,
        revealedRole: 'Вор',
        sealsWinnerId: 'p1',
        message: ''
      }
    }),
    'p1'
  );
  assert.match(блеф.event, /P1 разоблачил/);
  assert.match(блеф.event, /блеф/);
  assert.match(блеф.event, /\+1 ⚜️/, 'печать за разоблачение видна');

  // Правда — другая фраза.
  const правда = deriveTableView(
    input({
      activePlayerId: 'p2',
      revealOutcome: {
        accuserId: 'p1',
        accusedId: 'p2',
        claimedRole: 'Шут',
        wasTruth: true,
        revealedRole: 'Шут',
        message: ''
      }
    }),
    'p1'
  );
  assert.match(правда.event, /говорил правду/);

  // Спокойный стол — рассказывать нечего.
  assert.equal(deriveTableView(input(), 'p1').event, '');
}

// 11. Подсказка не повторяет событие: вместе они читаются как одна фраза,
//     а не как одно и то же сообщение дважды подряд.
{
  const view = deriveTableView(
    input({
      activePlayerId: 'p2',
      turnPhase: 'DOUBT_WINDOW',
      pendingAction: action({ roleClaim: 'Наследник' })
    }),
    'p1'
  );
  assert.match(view.event, /заявляет «Наследник»/);
  assert.doesNotMatch(view.guidance, /заявляет/, 'подсказка не пересказывает событие');
  assert.equal(view.guidance, 'Поверить или проверить?');
}

// 12. Склоняем ботов, но не ники живых игроков.
{
  const бот = (id: string, name: string) => player(id, { name, isBot: true });
  const живой = (id: string, name: string) => player(id, { name, isBot: false });

  const поБоту = deriveTableView(
    input({
      activePlayerId: 'p2',
      players: [живой('p1', 'Мурена'), бот('p2', 'Княгиня Анна'), бот('p3', 'Барон Дима')],
      pendingAction: action({ roleClaim: 'Вор', targetId: 'p3' })
    }),
    'p1'
  );
  assert.match(поБоту.event, /на Барона Диму/, 'титул бота склоняется вместе с именем');

  const поЖивому = deriveTableView(
    input({
      activePlayerId: 'p2',
      players: [живой('p1', 'Мурена'), бот('p2', 'Княгиня Анна'), бот('p3', 'Барон Дима')],
      pendingAction: action({ roleClaim: 'Вор', targetId: 'p1' })
    }),
    'p1'
  );
  assert.match(поЖивому.event, /на Мурена/, 'ник живого игрока не склоняется');
  assert.doesNotMatch(поЖивому.event, /Мурену/);
}

/* Выбор карт к обмену забирает правую колонку себе.
 *
 * Пока идут отметки, «Завершить ход» из колонки уходит: ход, отданный
 * посреди выбора, — это ход, отданный по случайности. Отмена живёт в баннере
 * над столом, а не среди кнопок. */
{
  const hand = player('p1').hand;

  const idle = deriveTableView(input(), 'p1');
  assert.ok(
    idle.bar.some(b => b.kind === 'court-actions'),
    'без выбора колонка обычная'
  );

  const empty = deriveTableView(input({ exchangePick: [] }), 'p1');
  assert.deepEqual(
    empty.bar.map(b => b.kind),
    ['exchange-confirm'],
    'выбор оставляет в колонке одну кнопку'
  );
  assert.equal(empty.bar[0].disabled, true, 'ни одна карта не отмечена — жать нечего');

  const one = deriveTableView(input({ exchangePick: [hand[0].id] }), 'p1');
  assert.equal(one.bar[0].label, 'Сменить 1 карту');
  assert.equal(one.bar[0].disabled, false);

  const two = deriveTableView(input({ exchangePick: [hand[0].id, hand[1].id] }), 'p1');
  assert.equal(two.bar[0].label, 'Сменить 2 карты');

  assert.notEqual(one.id, two.id, 'отметка меняет картинку, значит и подпись под ней');
  assert.notEqual(idle.id, empty.id, 'открытый выбор — уже другая картинка');
}

// ==========================================================================
// Круг коронации не отбирает ход
// ==========================================================================
// Регрессия: круг проверялся раньше своего хода, и активный игрок получал
// вместо кнопок табличку «сбейте влияние претендента». Сбивать было нечем —
// панель действий не появлялась, и стол стоял до конца круга.
{
  const view = deriveTableView(input({ activePlayerId: 'p1', coronationCandidateId: 'p2' }), 'p1');
  assert.equal(view.phase, 'turn', 'на своём ходу игрок ходит, а не смотрит на объявление');
  assert.ok(view.bar.length > 0, 'кнопки действий на месте');
  assert.ok(
    view.guidance.includes('Круг коронации'),
    'но про круг игроку всё равно сказано — это последний шанс сбить претендента'
  );
}

// Чужой ход во время круга — по-прежнему объявление.
{
  const view = deriveTableView(input({ activePlayerId: 'p2', coronationCandidateId: 'p2' }), 'p1');
  assert.equal(view.phase, 'coronation', 'вне своего хода круг остаётся объявлением');
}

// Круг за самого зрителя читается иначе: ему нечего сбивать.
{
  const view = deriveTableView(input({ activePlayerId: 'p1', coronationCandidateId: 'p1' }), 'p1');
  assert.equal(view.phase, 'turn');
  assert.ok(view.guidance.includes('за вас'), 'претенденту сказано, что круг идёт за него');
}

// Реакции по-прежнему важнее своего хода: окно вето не должно теряться.
{
  const view = deriveTableView(
    input({
      activePlayerId: 'p1',
      coronationCandidateId: 'p2',
      turnPhase: 'VETO_WINDOW',
      pendingAction: action()
    }),
    'p1'
  );
  assert.equal(view.phase, 'veto', 'окно вето важнее и хода, и круга');
}

// ==========================================================================
// Ва-банк как переключатель, а не карта для розыгрыша
// ==========================================================================
{
  const me = player('p1', { hand: hand('Наследник', 'Ва-банк') });
  const view = deriveTableView(input({ players: [me, player('p2'), player('p3')] }), 'p1');
  const heirId = me.hand[0].id;
  const vbId = me.hand[1].id;

  /* Порядок зафиксирован: «Ва-банк» взводят ДО выбора, чем играть, поэтому он
     стоит первым — перед «Разыграть» и «Блеф». */
  assert.deepEqual(
    view.menus[heirId].map(o => o.kind),
    ['vabanque', 'play', 'bluff', 'inspect'],
    'Ва-банк первым, дальше розыгрыш, блеф и осмотр'
  );

  const vbKinds = view.menus[vbId].map(o => o.kind);
  assert.ok(!vbKinds.includes('play'), 'сам Ва-банк не разыгрывается — он модификатор');
  assert.ok(!vbKinds.includes('vabanque'), 'и к самому себе не подключается');
  assert.deepEqual(vbKinds, ['bluff', 'inspect'], 'у него только блеф и осмотр');
}

// Без Ва-банка в руке переключателя нет.
{
  const me = player('p1', { hand: hand('Наследник', 'Рыцарь') });
  const view = deriveTableView(input({ players: [me, player('p2'), player('p3')] }), 'p1');
  assert.ok(
    !view.menus[me.hand[0].id].map(o => o.kind).includes('vabanque'),
    'нечего подключать — нечего и показывать'
  );
}

// Взведённое состояние доезжает до пункта и меняет картинку.
{
  const me = player('p1', { hand: hand('Наследник', 'Ва-банк') });
  const players = [me, player('p2'), player('p3')];
  const off = deriveTableView(input({ players }), 'p1');
  const on = deriveTableView(input({ players, vaBanqueArmed: true }), 'p1');
  const pick = (v: typeof off) => v.menus[me.hand[0].id].find(o => o.kind === 'vabanque');
  assert.equal(off.menus[me.hand[0].id][0].kind, 'vabanque', 'переключатель стоит первым');
  assert.equal(pick(off)!.tone, 'ember', 'и он оранжевый');
  assert.equal(pick(off)!.active, false);
  assert.equal(pick(on)!.active, true);
  assert.ok(pick(off)!.toggle, 'это переключатель, а не действие');
  assert.notEqual(off.id, on.id, 'взведённый Ва-банк обязан менять картинку');
}

// ==========================================================================
// Заряженный Заговор играется нажатием на карту
// ==========================================================================
{
  const full = { id: 'x', cardId: 'plot-1', type: 'Тайный заговор' as const, charges: 4 };
  const me = player('p1', { activePlot: full });
  const view = deriveTableView(input({ players: [me, player('p2'), player('p3')] }), 'p1');

  assert.deepEqual(
    view.menus['plot-1'].map(o => o.kind),
    ['conspiracy', 'inspect'],
    'у лежащего заряженного Заговора своё меню: разыграть и осмотреть'
  );
  assert.ok(
    !view.bar.some(b => b.kind === 'conspiracy'),
    'кнопки «Свершить заговор» в панели больше нет'
  );
}

// На неполном заряде меню нет — бить нечем.
for (const charges of [0, 1, 2, 3]) {
  const me = player('p1', {
    activePlot: { id: 'x', cardId: 'plot-1', type: 'Тайный заговор' as const, charges }
  });
  const view = deriveTableView(input({ players: [me, player('p2'), player('p3')] }), 'p1');
  assert.equal(view.menus['plot-1'], undefined, `на ${charges} зарядах Заговор не разряжается`);
}

// В чужой ход — тоже нет.
{
  const me = player('p1', {
    activePlot: { id: 'x', cardId: 'plot-1', type: 'Тайный заговор' as const, charges: 4 }
  });
  const view = deriveTableView(
    input({ players: [me, player('p2'), player('p3')], activePlayerId: 'p2' }),
    'p1'
  );
  assert.equal(view.menus['plot-1'], undefined, 'Заговор разряжается только в свой ход');
}

console.log('tableView.check: ok');
