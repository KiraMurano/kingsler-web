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
import type { GameRules } from '@kinglier/engine/rules';
import { DEFAULT_RULES, normalizeRules } from '@kinglier/engine/rules';

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
    opening: null,
    vetoChain: 0,
    pendingVetoPassedIds: [],
    overlayInstant: null,
    vetoOnVeto: false,
    rules: DEFAULT_RULES,
    vaBanqueArmed: false,
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

// 4. Нападение: ответ жертвы однофазный — верю, не верю или дуэль картой.
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

  /* Две кнопки, а не три: дуэль объявляется нажатием на карту, которой
     защищаются, и кнопкой её не назвать. Отдельная «Дуэль» была лишним шагом
     к тому же меню на карте. */
  assert.deepEqual(view.bar.map(b => b.kind), ['believe', 'doubt']);

  const [shieldId, redirectId] = view.viewerHandIds;
  assert.deepEqual(view.menus[shieldId].map(o => o.kind), ['duel-shield', 'inspect']);
  assert.deepEqual(view.menus[redirectId].map(o => o.kind), ['play', 'duel-bluff', 'inspect']);
  assert.equal(
    view.menus[redirectId].find(o => o.kind === 'play')!.spendsToken,
    true,
    '«Перенаправление» — ход, а не щит: стоит жетона'
  );
}

/* 4a. Цену дуэли в меню задают правила партии, а не собственная мерка экрана.
 *
 * Дефект, ради которого это здесь: меню требовало жетон всегда, и с выключенным
 * «Дуэль тратит жетон хода» щит было не поднять вовсе. */
{
  const underAttack = (rules: GameRules, over: Partial<Player> = {}) =>
    deriveTableView(
      input({
        activePlayerId: 'p2',
        turnPhase: 'TARGET_REACTION_WINDOW',
        pendingAction: action({ roleClaim: 'Вор', targetId: 'p1' }),
        rules,
        players: [
          player('p1', { hand: hand('Казначей', 'Шут'), actionTokens: 0, gold: 0, ...over }),
          player('p2'),
          player('p3')
        ]
      }),
      'p1'
    );
  const shieldOf = (view: ReturnType<typeof deriveTableView>) =>
    view.menus[view.viewerHandIds[0]].find(o => o.kind === 'duel-shield')!;

  // Жетонов нет, но правила их и не требуют — щит поднимается.
  const free = shieldOf(underAttack(normalizeRules({ duelCostsToken: false })));
  assert.equal(free.disabled, false, 'без требования жетона дуэль доступна и при 0 ⚡');
  assert.equal(free.spendsToken, false, 'и молнию на ней не рисуем');

  // Жетон нужен, а его нет — и купить нечем.
  const blocked = shieldOf(underAttack(normalizeRules({ duelCostsToken: true })));
  assert.equal(blocked.disabled, true);
  assert.match(blocked.reason!, /^Нет жетонов/);
  assert.equal(blocked.tokenBlocked, true, 'дело именно в жетонах — молнию перечёркиваем');

  // Надбавка золотом видна в подписи и берётся из правил.
  const paid = shieldOf(
    underAttack(normalizeRules({ duelCostsToken: false, duelCost: 2 }), { gold: 5 })
  );
  assert.equal(paid.disabled, false);
  assert.match(paid.label, /2 🪙/, 'цена названа на самой кнопке');

  // Надбавка есть, а золота на неё нет — и это не про жетоны.
  const broke = shieldOf(
    underAttack(normalizeRules({ duelCostsToken: false, duelCost: 2 }), { gold: 1 })
  );
  assert.equal(broke.disabled, true);
  assert.match(broke.reason!, /^Не хватает золота/);
  assert.equal(broke.tokenBlocked, false, 'молния бы врала: жетоны ни при чём');

  // Платная дуэль: жетона нет, но его заменяет золото по цене проверки.
  const bought = shieldOf(
    underAttack(
      normalizeRules({
        duelCostsToken: true,
        paidDoubtEnabled: true,
        paidDoubtCost: 2,
        paidDuelEnabled: true,
        duelCost: 1
      }),
      { gold: 5 }
    )
  );
  assert.equal(bought.disabled, false, 'без жетона щит покупается');
  assert.match(bought.label, /3 🪙/, 'цена проверки плюс стоимость дуэли');
  assert.equal(bought.spendsToken, false, 'жетона у неё нет — платит золотом');
}

// 4b. Сказавшего «Верю» второй раз не спрашивают: жертва входит в опрос двора
//     с уже засчитанным ответом, и кнопок «верю / не верю» ей больше не дают.
{
  const после = input({
    activePlayerId: 'p2',
    turnPhase: 'DOUBT_WINDOW',
    pendingAction: action({ roleClaim: 'Вор', targetId: 'p1' }),
    pendingDoubtPassedIds: ['p1']
  });
  const view = deriveTableView(после, 'p1');
  assert.equal(view.phase, 'waiting', 'свой ответ дают один раз');
  assert.deepEqual(view.bar, []);

  /* А вот двор, который ещё не отвечал, спрашивают как обычно. */
  const третий = deriveTableView(после, 'p3');
  assert.equal(третий.phase, 'doubt');
  assert.deepEqual(третий.bar.map(b => b.kind), ['doubt', 'believe']);
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

// 6. Окно вето — опрос, а не таймер: у каждого спрашиваемого есть
//    «Пропустить», а само вето по-прежнему играется картой.
{
  const открыто = input({
    turnPhase: 'VETO_WINDOW',
    activePlayerId: 'p2',
    pendingAction: action(),
    players: [player('p1', { hand: hand('Право вето', 'Шут') }), player('p2'), player('p3')]
  });
  const view = deriveTableView(открыто, 'p1');
  assert.equal(view.phase, 'veto');
  assert.deepEqual(view.bar.map(b => b.kind), ['veto-pass'], 'отказ — кнопкой, вето — картой');
  const [vetoId, jesterId] = view.viewerHandIds;
  assert.deepEqual(view.menus[vetoId].map(o => o.kind), ['veto', 'inspect']);
  assert.deepEqual(view.menus[jesterId].map(o => o.kind), ['inspect']);

  /* ГЛАВНОЕ: отсутствие «Права вето» на руках НЕ пропускает ход за игрока.
     Его спрашивают ровно так же, и жать «Пропустить» он обязан сам — иначе
     закрывшееся само окно означало бы «вето ни у кого нет». */
  const безКарты = deriveTableView(
    { ...открыто, players: [player('p1', { hand: hand('Шут', 'Рыцарь') }), player('p2'), player('p3')] },
    'p1'
  );
  assert.equal(безКарты.phase, 'veto', 'без вето на руках игрока всё равно спрашивают');
  assert.deepEqual(безКарты.bar.map(b => b.kind), ['veto-pass'], 'и кнопка отказа у него есть');

  /* Ответивший выпадает из опроса — второй раз своё «Пропустить» не жмут. */
  const ответил = deriveTableView({ ...открыто, pendingVetoPassedIds: ['p1'] }, 'p1');
  assert.equal(ответил.phase, 'waiting', 'свой ответ дают один раз');
  assert.deepEqual(ответил.bar, []);

  /* Автора собственного действия не спрашивают, пока поверх не легло вето. */
  const автор = deriveTableView(открыто, 'p2');
  assert.notEqual(автор.phase, 'veto', 'свой ход у автора не переспрашивают');

  /* А как только его действие отменили — спрашивают: встречное вето его. */
  const вето = { card: 'Право вето', actorId: 'p3' } as const;
  const отменён = deriveTableView(
    { ...открыто, isVetoed: true, vetoChain: 1, overlayInstant: вето },
    'p2'
  );
  assert.equal(отменён.phase, 'veto', 'отменили его действие — ему и отвечать');
  assert.deepEqual(отменён.bar.map(b => b.kind), ['veto-pass']);

  /* А вот сам наложивший вето из опроса выпадает: вето поверх собственного
     вето ничего не отменяет, и предлагать его — предлагать сжечь карту. */
  const наложивший = deriveTableView(
    { ...открыто, isVetoed: true, vetoChain: 1, overlayInstant: вето },
    'p3'
  );
  assert.notEqual(наложивший.phase, 'veto', 'своё же вето не переспрашивают');
  assert.deepEqual(наложивший.bar, []);
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
  assert.match(spentCourt.reason!, /^Обычное действие уже было/);
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
    input({ turnPhase: 'VETO_WINDOW', activePlayerId: 'p2', pendingAction: action() }),
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

/* --- Пока идёт открытие партии, у стола нет фазы. ---
 *
 * `activePlayerId` — это победитель жребия, и он известен с самого `startGame`,
 * а `turnPhase` всё открытие стоит в `IDLE`. Вместе это давало победителю
 * готовую панель своего хода ещё до броска монетки: он смотрел жребий, уже
 * зная его исход. */
{
  const открытие = {
    stage: 'TOSS' as const,
    id: 1,
    winnerId: 'p1',
    readyIds: ['p1', 'p2', 'p3'],
    holdUntil: null,
    landsAt: Date.now() + 1000
  };
  const view = deriveTableView(input({ activePlayerId: 'p1', opening: открытие }), 'p1');
  assert.equal(view.phase, 'waiting', 'победителю жребия не показывают его ход заранее');
  assert.deepEqual(view.bar, [], 'и кнопок хода тоже');

  /* А как только открытие кончилось — ход начинается как обычно. */
  const после = deriveTableView(input({ activePlayerId: 'p1' }), 'p1');
  assert.equal(после.phase, 'turn');
}

console.log('tableView.check: ok');
