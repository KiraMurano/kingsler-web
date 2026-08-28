import type { Action, TurnPhase } from '@kinglier/engine/types';

/** Что игрок уже сказал в окне сомнения. `null` — окно его не касается. */
export type DoubtVote = 'passed' | 'waiting';

export interface DoubtVoteInput {
  turnPhase: TurnPhase;
  pendingAction: Action | null;
  pendingDoubtPassedIds: string[];
  playerId: string;
}

/**
 * Кто уже нажал «Верю», а кого ещё ждут.
 *
 * Реплика «Верю.» в пузыре гаснет через пару секунд, а окно сомнения висит,
 * пока не ответят все, — и по столу становится не видно, чей ответ держит ход.
 * Признак нужен стойкий, на всё время окна.
 *
 * Заявивший не голосует: сомневаются в НЁМ. Пометить его «ждём ответа» значило
 * бы ждать, пока он усомнится в себе.
 */
export function doubtVote({
  turnPhase,
  pendingAction,
  pendingDoubtPassedIds,
  playerId
}: DoubtVoteInput): DoubtVote | null {
  if (turnPhase !== 'DOUBT_WINDOW' || !pendingAction) return null;
  if (pendingAction.actorId === playerId) return null;
  return pendingDoubtPassedIds.includes(playerId) ? 'passed' : 'waiting';
}
