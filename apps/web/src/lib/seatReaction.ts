import type { Action, GameState, RevealOutcome, TurnPhase } from '@kinglier/engine/types';
import { vetoAnswerRequired, vetoTopActorId } from '@kinglier/engine/resolvers/vetoChain';

/**
 * Что игрок делает в открытом окне. `null` — окно его не касается.
 *
 * Окон два, и оба — опросы: сомнение («верю / не верю») и вето («вето /
 * пропустить»). Признаки у них общие не для экономии, а потому что вопрос к
 * столу один и тот же: чей ответ сейчас держит ход.
 */
export type SeatReaction = 'thinking' | 'believed' | 'doubted' | 'passed' | 'vetoed';

export interface SeatReactionInput {
  turnPhase: TurnPhase;
  pendingAction: Action | null;
  pendingDoubtPassedIds: string[];
  pendingDoubtDoubterId: string | null;
  pendingDoubtActionId: string | null;
  pendingVetoPassedIds: string[];
  pendingVetoActionId: string | null;
  /**
   * Что лежит поверх действия.
   *
   * По нему узнаётся и тот, кто наложил последнее вето, и тот, кого в этом
   * круге не спрашивают: это один и тот же игрок — свою карту не отменяют.
   */
  overlayInstant: GameState['overlayInstant'];
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
  pendingVetoPassedIds,
  pendingVetoActionId,
  overlayInstant,
  revealOutcome,
  playerId
}: SeatReactionInput): SeatReaction | null {
  if (revealOutcome?.accuserId === playerId) return 'doubted';

  if (!pendingAction) return null;

  /*
   * Окно вето — такой же опрос, и стол обязан показывать его так же: кто уже
   * пропустил, кто ещё думает, кто вмешался. Без этого окно, которое держится
   * ответами, а не часами, выглядит зависшим — не видно, чьего ответа ждут.
   *
   * Опрос вето ПЕРЕКРЫВАЕТ опрос сомнения, а не показывается рядом: он идёт
   * по той же заявке, но позже, и стол обязан отвечать на вопрос «что сейчас».
   * Возвращать зелёное «Верю» после того, как игрок уже пропустил вето, —
   * значит откатывать метку назад во времени.
   *
   * И стоит ДО отсечки автора: пока его действие никто не отменил, его не
   * спрашивают, но встречное вето в цепочке — это ровно его ответ, и там он
   * участвует наравне со всеми.
   */
  if (pendingVetoActionId === pendingAction.id) {
    if (overlayInstant?.card === 'Право вето' && overlayInstant.actorId === playerId) {
      return 'vetoed';
    }
    if (!vetoAnswerRequired(playerId, vetoTopActorId(pendingAction.actorId, overlayInstant))) {
      return null;
    }
    if (pendingVetoPassedIds.includes(playerId)) return 'passed';
    /* Думать можно только пока спрашивают — как и в окне сомнения. */
    return turnPhase === 'VETO_WINDOW' ? 'thinking' : null;
  }

  if (pendingAction.actorId === playerId) return null;

  /* Опрос принадлежит своей заявке. Чужой — не показывается вовсе. */
  const polled = pendingDoubtActionId === pendingAction.id;
  if (polled && pendingDoubtDoubterId === playerId) return 'doubted';
  if (polled && pendingDoubtPassedIds.includes(playerId)) return 'believed';

  /* Думать можно только пока спрашивают. Вне окна молчание — это не
     раздумье, а просто отсутствие вопроса. */
  return turnPhase === 'DOUBT_WINDOW' ? 'thinking' : null;
}
