import type { GameState, Player } from '../types';
import { triggerResourceFloat } from '../utils/visualEffects';
import { beginCoronationIfNeeded } from './coronation';

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
  const { players, rules } = get();
  const crownsToWin = rules.crownsToWin;
  const pIdx = players.findIndex(p => p.id === playerId);
  if (pIdx === -1) return;

  const player = players[pIdx];
  if (player.favor >= crownsToWin) return;

  /* Цена «Охранной грамоты»: пока она лежит, печати держателю не идут.
     Именно не идут, а не копятся — иначе защита была бы бесплатной, а после
     сброса грамоты в игрока прилетала бы пачка отложенных корон. */
  if (player.activePlot?.type === 'Охранная грамота') {
    set(state => ({
      history: [
        `📜 «Охранная грамота» ${player.name}: печать (+${count} ⚜️) не начислена — такова цена защиты.`,
        ...state.history
      ].slice(0, 50)
    }));
    return;
  }

  const totalSeals = player.seals + count;
  const gainedCrowns = Math.floor(totalSeals / 2);
  const newFavor = player.favor + gainedCrowns;
  const remainderSeals = newFavor >= crownsToWin ? 0 : (totalSeals % 2);

  // Royal Bulla trigger: +1 🪙 from treasury when gaining seals!
  const hasRoyalCharter = player.activePlot?.type === 'Золотая булла';
  const charterBonusGold = hasRoyalCharter ? 1 : 0;

  const updatedPlayer: Player = {
    ...player,
    gold: player.gold + charterBonusGold,
    seals: remainderSeals,
    favor: Math.min(crownsToWin, newFavor)
  };

  const newPlayers = [...players];
  newPlayers[pIdx] = updatedPlayer;

  triggerResourceFloat(set, playerId, `+${count} ⚜️`, true);
  if (hasRoyalCharter) {
    setTimeout(() => {
      triggerResourceFloat(set, playerId, '+1 🪙 Булла', true);
    }, 250);
  }
  if (gainedCrowns > 0) {
    setTimeout(() => {
      triggerResourceFloat(set, playerId, `+${gainedCrowns} 👑`, true);
    }, 450);
  }

  const charterNotice = hasRoyalCharter ? ' 📜 «Золотая булла» приносит +1 🪙!' : '';
  const conversionNotice = gainedCrowns > 0
    ? ` ⚜️ 2 печати трансформировались в +${gainedCrowns} 👑 для ${player.name}!`
    : '';

  set(state => ({
    players: newPlayers,
    history: [`⚜️ ${player.name} получает +${count} ⚜️ Королевскую печать.${charterNotice}${conversionNotice}`, ...state.history].slice(0, 50)
  }));

  if (updatedPlayer.favor >= crownsToWin) {
    beginCoronationIfNeeded(get, set, updatedPlayer.id);
  }
}
