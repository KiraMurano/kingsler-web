import type { Action, RevealOutcome, TurnPhase } from '@kinglier/engine/types';

/** Что игрок делает в окне сомнения. `null` — окно его не касается. */
export type SeatReaction = 'thinking' | 'believed' | 'doubted';

export interface SeatReactionInput {
  turnPhase: TurnPhase;
  pendingAction: Action | null;
  pendingDoubtPassedIds: string[];
  pendingDoubtDoubterId: string | null;
  pendingDoubtActionId: string | null;
  revealOutcome: RevealOutcome | null;
  playerId: string;
}

/**
 * Кто ещё думает, кто поверил, а кто пошёл проверять.
 *
 * Реплика в пузыре гаснет через пару секунд, а окно сомнения висит, пока не
 * ответят все, — и по столу становится не видно, чей ответ держит ход. Признак
 * нужен стойкий, на всё время окна.
 *
 * Заявивший не голосует: сомневаются в НЁМ. Пометить его «ждём ответа» значило
 * бы ждать, пока он усомнится в себе.
 *
 * Ответ держится, пока держится заявка, а не пока открыто окно. Окно
 * закрывается в тот же миг, когда двор опрошен, — и если гасить метки по нему,
 * все кольца пропадают ровно тогда, когда становится интересно, кто что
 * ответил.
 *
 * Но именно ЭТА заявка, а не любая следующая: опрос принадлежит той, по
 * которой его вели (`pendingDoubtActionId`). Иначе действие, которое окна не
 * открывает — обычное, интрига, инстант, — застаёт список прошлого опроса
 * нетронутым, и стол показывает решения прошлого хода как свежие.
 *
 * Усомнившийся помечен и после окна: заявка уходит на вскрытие, и метка должна
 * доехать вместе с ней. Во вскрытии обвинителя зовут `revealOutcome.accuserId`
 * — там `pendingDoubtDoubterId` уже погашен.
 */
export function seatReaction({
  turnPhase,
  pendingAction,
  pendingDoubtPassedIds,
  pendingDoubtDoubterId,
  pendingDoubtActionId,
  revealOutcome,
  playerId
}: SeatReactionInput): SeatReaction | null {
  if (revealOutcome?.accuserId === playerId) return 'doubted';

  if (!pendingAction || pendingAction.actorId === playerId) return null;

  /* Опрос принадлежит своей заявке. Чужой — не показывается вовсе. */
  const polled = pendingDoubtActionId === pendingAction.id;
  if (polled && pendingDoubtDoubterId === playerId) return 'doubted';
  if (polled && pendingDoubtPassedIds.includes(playerId)) return 'believed';

  /* Думать можно только пока спрашивают. Вне окна молчание — это не
     раздумье, а просто отсутствие вопроса. */
  return turnPhase === 'DOUBT_WINDOW' ? 'thinking' : null;
}
