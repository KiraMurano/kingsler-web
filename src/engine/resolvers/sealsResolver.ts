import type { GameState, Player } from '../types';
import { triggerResourceFloat } from '../utils/visualEffects';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function addSealsToPlayer(
  get: StateGetter,
  set: StateSetter,
  playerId: string,
  count: number
): void {
  if (count <= 0) return;
  const { players, coronationCandidateId } = get();
  const pIdx = players.findIndex(p => p.id === playerId);
  if (pIdx === -1) return;

  const player = players[pIdx];
  if (player.favor >= 6) return;

  const totalSeals = player.seals + count;
  const gainedCrowns = Math.floor(totalSeals / 2);
  const newFavor = player.favor + gainedCrowns;
  const remainderSeals = newFavor >= 6 ? 0 : (totalSeals % 2);

  // Royal Charter trigger: +1 💰 from treasury when gaining seals!
  const hasRoyalCharter = player.activePlot?.type === 'Королевская грамота';
  const charterBonusGold = hasRoyalCharter ? 1 : 0;

  const updatedPlayer: Player = {
    ...player,
    gold: player.gold + charterBonusGold,
    seals: remainderSeals,
    favor: Math.min(6, newFavor)
  };

  const newPlayers = [...players];
  newPlayers[pIdx] = updatedPlayer;

  triggerResourceFloat(set, playerId, `+${count} ⚜️`, true);
  if (hasRoyalCharter) {
    window.setTimeout(() => {
      triggerResourceFloat(set, playerId, '+1 💰 Грамота', true);
    }, 250);
  }
  if (gainedCrowns > 0) {
    window.setTimeout(() => {
      triggerResourceFloat(set, playerId, `+${gainedCrowns} 👑`, true);
    }, 450);
  }

  const charterNotice = hasRoyalCharter ? ' 📜 «Королевская грамота» приносит +1 💰!' : '';
  const conversionNotice = gainedCrowns > 0
    ? ` ⚜️ 2 печати трансформировались в +${gainedCrowns} 👑 для ${player.name}!`
    : '';

  set(state => ({
    players: newPlayers,
    history: [`⚜️ ${player.name} получает +${count} ⚜️ Королевскую печать.${charterNotice}${conversionNotice}`, ...state.history].slice(0, 50)
  }));

  if (updatedPlayer.favor >= 6 && !coronationCandidateId) {
    set(state => ({
      coronationCandidateId: updatedPlayer.id,
      history: [`👑 КРУГ КОРОНАЦИИ! ${updatedPlayer.name} набрал 6 👑 через печати! Если никто не собьёт его короны за круг, он станет Королём!`, ...state.history].slice(0, 50)
    }));
  }
}
