/**
 * Self-check: кто в окне сомнения ещё думает, кто поверил, а кто проверяет.
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
    revealOutcome: null,
    playerId: 'p2',
    ...over
  });

// Без заявки признака нет ни у кого.
assert.equal(at({ pendingAction: null }), null, 'без заявки сомневаться не в чем');
assert.equal(
  at({ pendingAction: null, turnPhase: 'VETO_WINDOW', pendingDoubtPassedIds: ['p2'] }),
  null,
  'ответ живёт вместе с заявкой и уходит вместе с ней'
);

// Думать можно только пока спрашивают: вне окна молчание это не раздумье.
assert.equal(at({ turnPhase: 'IDLE' }), null);
assert.equal(at({ turnPhase: 'VETO_WINDOW' }), null);

/* А вот ответ держится до конца действия. Окно закрывается в тот же миг, когда
   двор опрошен, и если гасить метки по нему, все кольца пропадают ровно тогда,
   когда становится интересно, кто что ответил. */
assert.equal(at({ turnPhase: 'VETO_WINDOW', pendingDoubtPassedIds: ['p2'] }), 'believed');
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

console.log('seatReaction.check.ts passed.');
