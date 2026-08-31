import type { Action, GameState } from '../types';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { loseCrowns } from './crownLoss';
import { addSealsToPlayer } from './sealsResolver';

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
  const crownsToWin = get().rules.crownsToWin;

  if (role === 'Наследник') {
    const crowns = isVB ? 2 : 1;
    const targetFavor = Math.min(crownsToWin, actor.favor + crowns);
    const actualGained = targetFavor - actor.favor;
    actor = { ...actor, favor: targetFavor };
    newPlayers[actorIdx] = actor;
    triggerResourceFloat(set, actor.id, `+${actualGained} 👑${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
    set({ players: newPlayers });
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
  } else if (role === 'Казначей') {
    const gold = isVB ? 6 : 3;
    actor = { ...actor, gold: actor.gold + gold };
    newPlayers[actorIdx] = actor;
    triggerResourceFloat(set, actor.id, `+${gold} 🪙${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
    set({ players: newPlayers });
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
  } else if (role === 'Дуэлянт') {
    /* Дуэлянт берёт печатью, а не золотом: две печати — корона, так что
       обычный розыгрыш щита это половина шага к престолу. Ва-банк удваивает
       её, как и всё остальное. */
    const seals = isVB ? 2 : 1;
    set({ players: newPlayers });
    addSealsToPlayer(get, set, actor.id, seals);
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
  } else if (role === 'Шут') {
    const gold = isVB ? 4 : 2;
    actor = { ...actor, gold: actor.gold + gold };
    newPlayers[actorIdx] = actor;
    triggerResourceFloat(set, actor.id, `+${gold} 🪙${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
    set({ players: newPlayers });
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
  } else if (role === 'Вор' && action.targetId) {
    const targetIdx = newPlayers.findIndex(p => p.id === action.targetId);
    let stolen = 0;
    if (targetIdx !== -1) {
      const maxStolen = isVB ? 4 : 2;
      stolen = Math.min(maxStolen, newPlayers[targetIdx].gold);
      newPlayers[targetIdx] = { ...newPlayers[targetIdx], gold: newPlayers[targetIdx].gold - stolen };
      actor = { ...actor, gold: actor.gold + stolen };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, action.targetId, `-${stolen} 🪙`, false);
      triggerResourceFloat(set, actor.id, `+${stolen} 🪙${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
    }
    set({ players: newPlayers });
    if (stolen > 0) {
      get()._disruptPlayerPlotsOnLoss(action.targetId, 'кражи Вора');
    }
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
  } else if (role === 'Шантажист' && action.targetId) {
    set({ players: newPlayers });
    const maxSteal = isVB ? 2 : 1;
    const result = loseCrowns(get, set, action.targetId, maxSteal, 'шантажа');
    newPlayers = [...get().players];

    /* Шантажист крадёт, а не уничтожает: себе он забирает ровно столько,
       сколько реально снялось с жертвы. Под «Охранной грамотой» это ноль.

       В обычной партии сюда с грамотой не попасть — её держателя нет в списке
       целей Шантажиста. Ветка остаётся страховкой: она описывает, что
       происходит, если защита всё же оказалась на месте к моменту применения
       эффекта. */
    const stolen = result.kind === 'lost' ? result.amount : 0;
    if (stolen > 0) {
      const idx = newPlayers.findIndex(p => p.id === action.actorId);
      const thief = newPlayers[idx];
      const nextFavor = Math.min(crownsToWin, thief.favor + stolen);
      const actualGained = nextFavor - thief.favor;
      newPlayers[idx] = { ...thief, favor: nextFavor };
      set({ players: newPlayers });
      triggerResourceFloat(set, thief.id, `+${actualGained} 👑${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
    }

    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
  } else {
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
  }
}
