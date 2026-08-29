/**
 * Self-check: кто ещё думает, кто ответил и что именно ответил — в обоих
 * опросах, сомнения и вето.
 * Run: npx tsx apps/web/src/lib/seatReaction.check.ts
 */
import assert from 'node:assert/strict';
import { seatReaction, type SeatReactionInput } from './seatReaction.ts';
import type { Action, RevealOutcome } from '@kinglier/engine/types';

const action: Action = {
  id: 'a1',
  type: 'role',
  name: 'Наследник',
  roleClaim: 'Наследник',
  actorId: 'p1',
  costGold: 0,
  costTokens: 1,
  description: ''
};

const at = (over: Partial<SeatReactionInput>) =>
  seatReaction({
    turnPhase: 'DOUBT_WINDOW',
    pendingAction: action,
    pendingDoubtPassedIds: [],
    pendingDoubtDoubterId: null,
    pendingDoubtActionId: action.id,
    pendingVetoPassedIds: [],
    /* По умолчанию опроса вето не было: он начинается только когда окно
       действительно открылось по ЭТОЙ заявке. */
    pendingVetoActionId: null,
    overlayInstant: null,
    revealOutcome: null,
    playerId: 'p2',
    ...over
  });

/** То же, но окно вето по текущей заявке уже открывалось. */
const veto = (over: Partial<SeatReactionInput> = {}) =>
  at({ turnPhase: 'VETO_WINDOW', pendingVetoActionId: action.id, ...over });

// Без заявки признака нет ни у кого.
assert.equal(at({ pendingAction: null }), null, 'без заявки сомневаться не в чем');
assert.equal(
  at({ pendingAction: null, turnPhase: 'VETO_WINDOW', pendingDoubtPassedIds: ['p2'] }),
  null,
  'ответ живёт вместе с заявкой и уходит вместе с ней'
);

// Думать можно только пока спрашивают: вне окна молчание это не раздумье.
assert.equal(at({ turnPhase: 'IDLE' }), null);
assert.equal(
  at({ turnPhase: 'VETO_WINDOW' }),
  null,
  'окно вето открыто, но опрос по этой заявке не начинался — спрашивать нечего'
);

/* А вот ответ держится до конца действия. Окно закрывается в тот же миг, когда
   двор опрошен, и если гасить метки по нему, все кольца пропадают ровно тогда,
   когда становится интересно, кто что ответил. */
assert.equal(at({ turnPhase: 'IDLE', pendingDoubtPassedIds: ['p2'] }), 'believed');

// Заявивший не голосует: сомневаются в нём.
assert.equal(at({ playerId: 'p1' }), null);
assert.equal(at({ playerId: 'p1', pendingDoubtPassedIds: ['p1'] }), null);

// Остальные думают, пока не ответят.
assert.equal(at({}), 'thinking');
assert.equal(at({ pendingDoubtPassedIds: ['p2'] }), 'believed');
assert.equal(at({ pendingDoubtPassedIds: ['p2'], playerId: 'p3' }), 'thinking');

// Усомнившийся помечен и в окне, и после него — во вскрытии.
assert.equal(at({ pendingDoubtDoubterId: 'p2' }), 'doubted');
assert.equal(
  at({ pendingDoubtDoubterId: 'p2', pendingDoubtPassedIds: ['p2'] }),
  'doubted',
  'проверка перебивает «верю»: она и случилась позже'
);

const reveal = { accuserId: 'p3', accusedId: 'p1' } as RevealOutcome;
assert.equal(
  at({ turnPhase: 'REVEAL_OUTCOME', revealOutcome: reveal, playerId: 'p3' }),
  'doubted',
  'во вскрытии обвинителя зовут accuserId — pendingDoubtDoubterId уже погашен'
);
assert.equal(
  at({ turnPhase: 'REVEAL_OUTCOME', revealOutcome: reveal, playerId: 'p2' }),
  null,
  'остальные во вскрытии ничего не показывают'
);

// Даже вне окна: усомнившийся помечен, пока движок его помнит.
assert.equal(at({ turnPhase: 'IDLE', pendingDoubtDoubterId: 'p2' }), 'doubted');

/* --- Опрос принадлежит своей заявке. ---
 *
 * Дефект, ради которого добавлен `pendingDoubtActionId`: список ответов
 * гасится при ОТКРЫТИИ окна сомнения, а действие, которое окна не открывает
 * (обычное, интрига, инстант), заставало прошлый список нетронутым. На
 * следующем ходу стол показывал решения прошлого как свежие. */
assert.equal(
  at({ pendingDoubtActionId: 'другая-заявка', pendingDoubtPassedIds: ['p2'], turnPhase: 'IDLE' }),
  null,
  'ответы по прошлой заявке не показываются на новой'
);
assert.equal(
  at({ pendingDoubtActionId: 'другая-заявка', pendingDoubtDoubterId: 'p2', turnPhase: 'IDLE' }),
  null,
  'и проверка тоже'
);
assert.equal(
  at({ pendingDoubtActionId: null, pendingDoubtPassedIds: ['p2'], turnPhase: 'IDLE' }),
  null,
  'опроса не было вовсе — показывать нечего'
);
/* Но пока идёт своё окно, человек думает как обычно. */
assert.equal(at({ pendingDoubtActionId: 'другая-заявка' }), 'thinking');

/* --- Окно вето: те же признаки, свой набор ответов. ---
 *
 * Оно держится ответами, а не часами, поэтому по столу обязано быть видно,
 * чьего ответа ждут: иначе стоящее окно неотличимо от зависшего стола. */
assert.equal(veto(), 'thinking', 'ответа ещё нет — игрок думает');
assert.equal(veto({ pendingVetoPassedIds: ['p2'] }), 'passed', 'пропустил');
assert.equal(veto({ pendingVetoPassedIds: ['p3'] }), 'thinking', 'ответил сосед, не он');

/* Наложивший вето узнаётся по карте, лежащей поверх действия. */
const overlay = { card: 'Право вето', actorId: 'p2' } as const;
assert.equal(veto({ overlayInstant: overlay }), 'vetoed');
assert.equal(veto({ overlayInstant: overlay, playerId: 'p3' }), 'thinking', 'вето наложил не он');

/* Не спрашивают того, чья карта наверху, — и это ОДНО правило на оба случая.
   Пока наверху действие, молчит его автор. */
assert.equal(veto({ playerId: 'p1' }), null);
/* Как только сверху легло чужое вето — автора спрашивают: встречное вето это
   ровно его ответ. */
assert.equal(veto({ playerId: 'p1', overlayInstant: overlay }), 'thinking');
assert.equal(
  veto({ playerId: 'p1', overlayInstant: overlay, pendingVetoPassedIds: ['p1'] }),
  'passed'
);
/* А сам наложивший вето из опроса выпадает: отменять своё же нечего, и
   «Не накладываю Вето» сразу после «Право вето!» он не говорит. */
assert.equal(
  veto({ playerId: 'p2', overlayInstant: overlay }),
  'vetoed',
  'положивший вето показан вето, а не «думает»'
);

/* Ответ вето перекрывает ответ сомнения: опрос тот же, но заданный позже.
   Иначе, пропустив вето, игрок снова загорался бы зелёным «Верю» — метка
   откатилась бы назад во времени. */
assert.equal(
  veto({ pendingDoubtPassedIds: ['p2'], pendingVetoPassedIds: ['p2'] }),
  'passed',
  'после ответа в окне вето стол показывает именно его'
);
assert.equal(
  veto({ turnPhase: 'IDLE', pendingDoubtPassedIds: ['p2'], pendingVetoPassedIds: ['p2'] }),
  'passed',
  'и держит его, когда окно уже закрылось, — а не откатывается к «Верю»'
);

/* Опрос вето принадлежит своей заявке ровно так же, как и опрос сомнения. */
assert.equal(
  at({ turnPhase: 'IDLE', pendingVetoActionId: 'другая-заявка', pendingVetoPassedIds: ['p2'] }),
  null,
  'ответы по прошлой заявке на новой не показываются'
);

console.log('seatReaction.check.ts passed.');
