import type { Action, GameState } from '../types';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { chargeActiveConspiracies } from './plotResolver';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function resolveRoleActionEffect(
  get: StateGetter,
  set: StateSetter,
  action: Action,
  isAfterTruthChallenge = false
): void {
  let newPlayers = [...get().players];
  const actorIdx = newPlayers.findIndex(p => p.id === action.actorId);
  if (actorIdx === -1) return;
  let actor = newPlayers[actorIdx];
  const role = action.roleClaim;
  const isVB = isAfterTruthChallenge && get().isVaBanqueActive;

  if (role === 'Наследник') {
    const crowns = isVB ? 2 : 1;
    const targetFavor = Math.min(6, actor.favor + crowns);
    const actualGained = targetFavor - actor.favor;
    actor = { ...actor, favor: targetFavor };
    newPlayers[actorIdx] = actor;
    triggerResourceFloat(set, actor.id, `+${actualGained} 👑${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
    set({ players: newPlayers });
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 1800);
  } else if (role === 'Казначей') {
    const gold = isVB ? 6 : 3;
    actor = { ...actor, gold: actor.gold + gold };
    newPlayers[actorIdx] = actor;
    triggerResourceFloat(set, actor.id, `+${gold} 🪙${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
    set({ players: newPlayers });
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 1800);
  } else if (role === 'Рыцарь' || role === 'Шут') {
    const gold = isVB ? 4 : 2;
    actor = { ...actor, gold: actor.gold + gold };
    newPlayers[actorIdx] = actor;
    triggerResourceFloat(set, actor.id, `+${gold} 🪙${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
    set({ players: newPlayers });
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 1800);
  } else if (role === 'Вор' && action.targetId) {
    const targetIdx = newPlayers.findIndex(p => p.id === action.targetId);
    if (targetIdx !== -1) {
      const maxStolen = isVB ? 4 : 2;
      const stolen = Math.min(maxStolen, newPlayers[targetIdx].gold);
      newPlayers[targetIdx] = { ...newPlayers[targetIdx], gold: newPlayers[targetIdx].gold - stolen };
      actor = { ...actor, gold: actor.gold + stolen };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, action.targetId, `-${stolen} 🪙`, false);
      triggerResourceFloat(set, actor.id, `+${stolen} 🪙${isVB ? ' (x2 Ва-банк!)' : ''}`, true);

      if (stolen > 0) {
        get()._disruptPlayerPlotsOnLoss(action.targetId, 'кражи Вора');
        chargeActiveConspiracies(get, set, `кражу золота Вором (${actor.name})`);
      }
    }
    set({ players: newPlayers });
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 1800);
  } else if (role === 'Шантажист' && action.targetId) {
    const targetIdx = newPlayers.findIndex(p => p.id === action.targetId);
    if (targetIdx !== -1 && newPlayers[targetIdx].favor > 0) {
      const maxSteal = isVB ? 2 : 1;
      const stolen = Math.min(maxSteal, newPlayers[targetIdx].favor);
      newPlayers[targetIdx] = { ...newPlayers[targetIdx], favor: newPlayers[targetIdx].favor - stolen };
      triggerResourceFloat(set, action.targetId, `-${stolen} 👑`, false);

      get()._disruptPlayerPlotsOnLoss(action.targetId, 'шантажа');
      chargeActiveConspiracies(get, set, `шантаж короны Шантажистом (${actor.name})`);

      const nextFavor = Math.min(6, actor.favor + stolen);
      const actualGained = nextFavor - actor.favor;
      actor = { ...actor, favor: nextFavor };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, actor.id, `+${actualGained} 👑${isVB ? ' (x2 Ва-банк!)' : ''}`, true);

      if (get().coronationCandidateId === action.targetId && newPlayers[targetIdx].favor < 6) {
        set(state => ({
          coronationCandidateId: null,
          history: [`⚖️ Коронация ${newPlayers[targetIdx].name} сорвана шантажом! Влияние упало ниже 6 👑!`, ...state.history].slice(0, 50)
        }));
      }
    }
    set({ players: newPlayers });
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 1800);
  } else {
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 1800);
  }
}
