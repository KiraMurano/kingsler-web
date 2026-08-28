/**
 * Единственная точка, где короны уходят с игрока.
 *
 * Раньше это делали четыре резолвера, и каждый сам чинил круг коронации,
 * сам жёг «Королевский приём» и сам рисовал всплывашку. Пятое правило —
 * «Охранная грамота» — в такой россыпи гарантированно где-нибудь забылось бы,
 * поэтому механическая часть потери живёт здесь, а флейворную строку в
 * историю по-прежнему пишет вызывающий: он один знает, чем именно бьёт.
 */
import type { CardInstance, GameState } from '../types';
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

/**
 * Удар, который грамота держит, но который её же и подтачивает: корону он не
 * забирает, а саму грамоту сжигает. Так работают «Распустить слух» и
 * «Тайный заговор».
 *
 * Это то, что не даёт грамоте стать неснимаемой крепостью: иначе её брали бы
 * только два «Обыска покоев» на всю колоду.
 *
 * @param reason существительное в родительном падеже: «слухов», «Заговора».
 * @returns была ли грамота сожжена.
 */
export function burnCharter(
  get: StateGetter,
  set: StateSetter,
  victimId: string,
  reason: string
): boolean {
  const { players } = get();
  const idx = players.findIndex(p => p.id === victimId);
  if (idx === -1) return false;

  const victim = players[idx];
  const plot = victim.activePlot;
  if (plot?.type !== 'Охранная грамота') return false;

  const burned: CardInstance = { id: plot.cardId, card: 'Охранная грамота' };
  const newPlayers = [...players];
  newPlayers[idx] = { ...victim, activePlot: null };

  set(state => ({
    players: newPlayers,
    discardPile: [...state.discardPile, burned],
    history: [
      `📜 «Охранная грамота» ${genOf(victim)} не выдержала ${reason}: корона цела, но грамота сгорела.`,
      ...state.history
    ].slice(0, 50)
  }));
  triggerResourceFloat(set, victimId, '📜 Грамота сгорела', false);

  return true;
}

/** Интриги, которые перестают работать, как только держателя поймали на лжи. */
const PROTECTIVE_PLOTS = ['Стража покоев', 'Охранная грамота'] as const;

/**
 * Держателя защитной интриги уличили в блефе — интрига сгорает.
 *
 * Это то, что не даёт защите быть бесплатной: держать «Стражу» или «Грамоту»
 * и при этом блефовать ролями одновременно нельзя.
 *
 * @returns была ли интрига сожжена.
 */
export function discardProtectiveIntrigueOnBluff(
  get: StateGetter,
  set: StateSetter,
  playerId: string
): boolean {
  const { players } = get();
  const idx = players.findIndex(p => p.id === playerId);
  if (idx === -1) return false;

  const victim = players[idx];
  const plot = victim.activePlot;
  if (!plot) return false;
  if (!PROTECTIVE_PLOTS.some(type => type === plot.type)) return false;

  const burned: CardInstance = { id: plot.cardId, card: plot.type };
  const newPlayers = [...players];
  newPlayers[idx] = { ...victim, activePlot: null };

  set(state => ({
    players: newPlayers,
    discardPile: [...state.discardPile, burned],
    history: [
      `💥 «${plot.type}» ${genOf(victim)} сгорает: ${victim.name} уличён(а) в блефе.`,
      ...state.history
    ].slice(0, 50)
  }));
  triggerResourceFloat(set, playerId, `💥 ${plot.type} сорвана`, false);

  return true;
}
