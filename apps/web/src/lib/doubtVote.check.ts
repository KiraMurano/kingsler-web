/**
 * Self-check: кто в окне сомнения уже ответил, а кого ждут.
 * Run: npx tsx apps/web/src/lib/doubtVote.check.ts
 */
import assert from 'node:assert/strict';
import { doubtVote } from './doubtVote.ts';
import type { Action } from '@kinglier/engine/types';

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

const at = (turnPhase: Parameters<typeof doubtVote>[0]['turnPhase'], passed: string[], playerId: string) =>
  doubtVote({ turnPhase, pendingAction: action, pendingDoubtPassedIds: passed, playerId });

// Вне окна сомнения признака нет ни у кого.
assert.equal(at('IDLE', [], 'p2'), null);
assert.equal(at('VETO_WINDOW', ['p2'], 'p2'), null);
assert.equal(
  doubtVote({ turnPhase: 'DOUBT_WINDOW', pendingAction: null, pendingDoubtPassedIds: [], playerId: 'p2' }),
  null,
  'без заявки сомневаться не в чем'
);

// Заявивший не голосует: сомневаются в нём.
assert.equal(at('DOUBT_WINDOW', [], 'p1'), null);
assert.equal(at('DOUBT_WINDOW', ['p1'], 'p1'), null);

// Остальные — ждут или уже ответили.
assert.equal(at('DOUBT_WINDOW', [], 'p2'), 'waiting');
assert.equal(at('DOUBT_WINDOW', ['p2'], 'p2'), 'passed');
assert.equal(at('DOUBT_WINDOW', ['p2'], 'p3'), 'waiting');
assert.equal(at('DOUBT_WINDOW', ['p2', 'p3'], 'p3'), 'passed');

console.log('doubtVote.check.ts passed.');
