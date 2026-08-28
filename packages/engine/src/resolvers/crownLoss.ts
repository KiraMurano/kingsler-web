/**
 * Единственная точка, где короны уходят с игрока.
 *
 * Раньше это делали четыре резолвера, и каждый сам чинил круг коронации,
 * сам жёг «Королевский приём» и сам рисовал всплывашку. Пятое правило —
 * «Охранная грамота» — в такой россыпи гарантированно где-нибудь забылось бы,
 * поэтому механическая часть потери живёт здесь, а флейворную строку в
 * историю по-прежнему пишет вызывающий: он один знает, чем именно бьёт.
 */
import type { GameState } from '../types';
import { genOf } from '../utils/russianText';
import { triggerResourceFloat } from '../utils/visualEffects';
import { fallenCoronationPatch } from './coronation';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export type CrownLossResult =
  | { kind: 'lost'; amount: number }
  | { kind: 'blocked_by_charter' }
  | { kind: 'no_crowns' };

/**
 * Снимает до `amount` корон с игрока.
 *
 * @param reason      существительное в родительном падеже: «шантажа»,
 *                    «обвинения в измене». Идёт и в срыв «Королевского приёма»,
 *                    и в строку о сорванной коронации.
 * @param floatLabel  необязательный суффикс всплывашки: «Измена!», «Заговор!».
 * @returns сколько корон реально снялось и почему, если не снялось.
 *          «Шантажист» крадёт ровно `amount` из результата: под грамотой это 0,
 *          и переносить себе ему нечего.
 */
export function loseCrowns(
  get: StateGetter,
  set: StateSetter,
  victimId: string,
  amount: number,
  reason: string,
  floatLabel?: string
): CrownLossResult {
  const { players } = get();
  const idx = players.findIndex(p => p.id === victimId);
  if (idx === -1) return { kind: 'no_crowns' };
  const victim = players[idx];

  if (victim.activePlot?.type === 'Охранная грамота') {
    set(state => ({
      history: [
        `📜 «Охранная грамота» защищает ${genOf(victim)}: ${reason} не отнимает корон.`,
        ...state.history
      ].slice(0, 50)
    }));
    triggerResourceFloat(set, victimId, '📜 Грамота держит', true);
    return { kind: 'blocked_by_charter' };
  }

  const lost = Math.min(amount, victim.favor);
  if (lost <= 0) return { kind: 'no_crowns' };

  const newFavor = victim.favor - lost;
  const newPlayers = [...players];
  newPlayers[idx] = { ...victim, favor: newFavor };

  set(state => ({
    players: newPlayers,
    ...fallenCoronationPatch(state.coronationCandidateId, victimId, newFavor),
    history: [
      ...(state.coronationCandidateId === victimId && newFavor < 6
        ? [`⚖️ Коронация ${victim.name} сорвана: ${reason}. Влияние упало ниже 6 👑!`]
        : []),
      ...state.history
    ].slice(0, 50)
  }));

  triggerResourceFloat(set, victimId, `-${lost} 👑${floatLabel ? ` ${floatLabel}` : ''}`, false);
  get()._disruptPlayerPlotsOnLoss(victimId, reason);

  return { kind: 'lost', amount: lost };
}
