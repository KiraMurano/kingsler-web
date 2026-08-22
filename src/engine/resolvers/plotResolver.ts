import type { GameState, PlotType, Player, GameCard } from '../types';
import { declineGen } from '../utils/russianText';
import { triggerResourceFloat, triggerSingleCardFlight } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function disruptPlayerPlotsOnLoss(
  get: StateGetter,
  set: StateSetter,
  victimId: string,
  reason: string
): void {
  const { players } = get();
  const vIdx = players.findIndex(p => p.id === victimId);
  if (vIdx === -1) return;

  const victim = players[vIdx];
  if (victim.activePlot && victim.activePlot.type === 'Королевский приём') {
    const newPlayers = [...players];
    newPlayers[vIdx] = { ...victim, activePlot: null };
    set(state => ({
      players: newPlayers,
      discardPile: [...state.discardPile, 'Королевский приём'],
      history: [`💥 «Королевский приём» ${declineGen(victim.name)} сорван из-за ${reason}! Интрига сгорела.`, ...state.history].slice(0, 50)
    }));
    triggerResourceFloat(set, victim.id, '💥 Интрига сорвана', false);
  }
}

export function playPlotAction(
  get: StateGetter,
  set: StateSetter,
  plotType: PlotType,
  cardIndex: number,
  targetPlayerId?: string
): void {
  timerManager.clearAll();
  const { players, activePlayerId, discardPile } = get();
  const actor = players.find(p => p.id === activePlayerId);
  if (!actor || actor.actionTokens < 1) return;

  const playedCard = actor.hand[cardIndex];
  if (playedCard !== plotType) return;

  // Remove plot card from hand without immediate refill (deferred draw at end of turn)
  const newHand = [...actor.hand];
  newHand.splice(cardIndex, 1);

  const oldPlot = actor.activePlot;
  const updatedDiscard = oldPlot ? [...discardPile, oldPlot.type] : discardPile;

  const newPlotData = {
    id: Math.random().toString(36).substring(7),
    type: plotType,
    targetPlayerId,
    charges: plotType === 'Сеть информаторов' ? 2 : plotType === 'Тайный заговор' ? 0 : undefined
  };

  const newPlayers = players.map(p => p.id === actor.id ? {
    ...p,
    actionTokens: p.actionTokens - 1,
    hand: newHand,
    activePlot: newPlotData
  } : p);

  triggerSingleCardFlight(set, 'to_plot', actor.id, undefined, plotType);
  triggerResourceFloat(set, actor.id, '-1 ⚡', false);

  const target = targetPlayerId ? players.find(p => p.id === targetPlayerId) : null;
  const targetText = target ? ` (цель: ${target.name})` : '';

  set(state => ({
    players: newPlayers,
    discardPile: updatedDiscard,
    hasPlayedPlotThisTurn: true,
    turnSubPhase: 'CARD_PLAY_PHASE',
    history: [`🎴 ${actor.name} разыгрывает Интригу «${plotType}»${targetText} (потрачен 1 ⚡).`, ...state.history].slice(0, 50)
  }));

  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, 1500);
}

/**
 * Заряжает все активные «Тайные заговоры» на столе при триггерах (сомнения, дуэли, кражи).
 */
export function chargeActiveConspiracies(
  get: StateGetter,
  set: StateSetter,
  reason: string
): void {
  const { players } = get();
  const conspiracyHolders = players.filter(p => p.activePlot?.type === 'Тайный заговор' && (p.activePlot.charges ?? 0) < 4);
  if (conspiracyHolders.length === 0) return;

  let promptData: { playerId: string; charges: number; isImmediateReaction: boolean } | null = null;

  const newPlayers = players.map(p => {
    if (p.activePlot?.type === 'Тайный заговор' && (p.activePlot.charges ?? 0) < 4) {
      const curCharges = p.activePlot.charges ?? 0;
      const nextCharges = Math.min(4, curCharges + 1);

      if (!p.isBot && nextCharges >= 2) {
        promptData = {
          playerId: p.id,
          charges: nextCharges,
          isImmediateReaction: true
        };
      }

      return {
        ...p,
        activePlot: {
          ...p.activePlot,
          charges: nextCharges
        }
      };
    }
    return p;
  });

  conspiracyHolders.forEach(p => {
    const nextCharges = Math.min(4, (p.activePlot?.charges ?? 0) + 1);
    triggerResourceFloat(set, p.id, `⚔️ Заговор +1 (${nextCharges}/4)`, true);
  });

  const logs = conspiracyHolders.map(p => {
    const nextCharges = Math.min(4, (p.activePlot?.charges ?? 0) + 1);
    return `⚔️ «Тайный заговор» у ${p.name} набирает силу (${nextCharges}/4) из-за: ${reason}!`;
  });

  set(state => ({
    players: newPlayers,
    conspiracyPrompt: promptData || state.conspiracyPrompt,
    history: [...logs, ...state.history].slice(0, 50)
  }));

  // Bot AI instant reaction evaluation
  conspiracyHolders.forEach(p => {
    if (p.isBot) {
      const nextCharges = Math.min(4, (p.activePlot?.charges ?? 0) + 1);
      if (nextCharges >= 2) {
        timerManager.scheduleDelay(() => {
          const curState = get();
          const curBot = curState.players.find(pl => pl.id === p.id);
          if (!curBot || curBot.activePlot?.type !== 'Тайный заговор') return;
          const charges = curBot.activePlot.charges ?? 0;
          if (charges < 2) return;

          const opponents = curState.players.filter(pl => pl.id !== p.id);
          if (opponents.length === 0) return;

          const sortedOpponents = [...opponents].sort((a, b) => {
            if (b.favor !== a.favor) return b.favor - a.favor;
            return b.gold - a.gold;
          });
          const target = sortedOpponents[0];

          if (charges >= 3 && target.favor >= 1) {
            activateConspiracy(get, set, p.id, target.id, 'crown', true);
          } else if (target.gold >= 2 || charges === 4 || Math.random() < 0.65) {
            activateConspiracy(get, set, p.id, target.id, 'gold', true);
          }
        }, 1200);
      }
    }
  });
}

/**
 * Открывает диалог активации «Тайного заговора».
 */
export function openConspiracyDialog(
  get: StateGetter,
  set: StateSetter,
  isImmediateReaction = false
): void {
  const human = get().players.find(p => !p.isBot);
  if (!human || human.activePlot?.type !== 'Тайный заговор') return;
  const charges = human.activePlot.charges ?? 0;
  if (charges < 2) return;

  set({
    conspiracyPrompt: {
      playerId: human.id,
      charges,
      isImmediateReaction
    }
  });
}

/**
 * Закрывает диалог активации «Тайного заговора».
 */
export function closeConspiracyDialog(
  set: StateSetter
): void {
  set({ conspiracyPrompt: null });
}

/**
 * Активирует «Тайный заговор» против выбранной цели с выбранным эффектом.
 */
export function activateConspiracy(
  get: StateGetter,
  set: StateSetter,
  playerId: string,
  targetPlayerId: string,
  effect: 'gold' | 'crown',
  isFreeReaction = false
): void {
  const { players, discardPile, coronationCandidateId } = get();
  const player = players.find(p => p.id === playerId);
  const target = players.find(p => p.id === targetPlayerId);
  if (!player || !target || player.activePlot?.type !== 'Тайный заговор') return;

  const charges = player.activePlot.charges ?? 0;
  if (charges < 2) return;
  if (effect === 'crown' && charges < 3) return;

  if (!isFreeReaction && player.actionTokens < 1) return;

  const tokenCost = isFreeReaction ? 0 : 1;
  const isUnvetoable = charges >= 4;

  let newPlayers = [...players];
  let newCoronationCandidateId = coronationCandidateId;
  const newDiscard: GameCard[] = [...discardPile, 'Тайный заговор'];

  if (tokenCost > 0) {
    triggerResourceFloat(set, player.id, '-1 ⚡', false);
  }

  if (effect === 'gold') {
    const goldLoss = Math.min(3, target.gold);
    newPlayers = newPlayers.map(p => {
      if (p.id === target.id) {
        return { ...p, gold: p.gold - goldLoss };
      }
      if (p.id === player.id) {
        return {
          ...p,
          actionTokens: p.actionTokens - tokenCost,
          activePlot: null
        };
      }
      return p;
    });

    if (goldLoss > 0) {
      get()._disruptPlayerPlotsOnLoss(target.id, 'удара Заговора');
      triggerResourceFloat(set, target.id, `-${goldLoss} 🪙 Заговор`, false);
    }
    triggerResourceFloat(set, player.id, `⚔️ Сброс ${goldLoss} 🪙!`, true);

    set(state => ({
      players: newPlayers,
      discardPile: newDiscard,
      conspiracyPrompt: null,
      history: [
        `⚔️ ${player.name} свершает «Тайный заговор» (${charges} зар.)! ${target.name} теряет ${goldLoss} 🪙 в казну!${isFreeReaction ? ' (Мгновенная реакция, 0 ⚡)' : ''}${isUnvetoable ? ' [🛡️ Нельзя отменить Вето]' : ''}`,
        ...state.history
      ].slice(0, 50)
    }));
  } else {
    // Effect === 'crown'
    const favorLoss = Math.min(1, target.favor);
    const newTargetFavor = Math.max(0, target.favor - favorLoss);
    if (target.id === coronationCandidateId && newTargetFavor < 6) {
      newCoronationCandidateId = null;
    }

    newPlayers = newPlayers.map(p => {
      if (p.id === target.id) {
        return { ...p, favor: newTargetFavor };
      }
      if (p.id === player.id) {
        return {
          ...p,
          actionTokens: p.actionTokens - tokenCost,
          activePlot: null
        };
      }
      return p;
    });

    if (favorLoss > 0) {
      get()._disruptPlayerPlotsOnLoss(target.id, 'удара Заговора');
      triggerResourceFloat(set, target.id, `-1 👑 Заговор!`, false);
    }
    triggerResourceFloat(set, player.id, `⚔️ Лишение 1 👑 у ${target.name}!`, true);

    set(state => ({
      players: newPlayers,
      discardPile: newDiscard,
      coronationCandidateId: newCoronationCandidateId,
      conspiracyPrompt: null,
      history: [
        `💥 ${player.name} свершает «Тайный заговор» (${charges} зар.)! ${target.name} лишается 1 👑 короны!${isFreeReaction ? ' (Мгновенная реакция, 0 ⚡)' : ''}${isUnvetoable ? ' [🛡️ Нельзя отменить Вето]' : ''}`,
        ...state.history
      ].slice(0, 50)
    }));
  }
}

export function resolveMorningPlots(
  updatedPlayers: Player[],
  nextIndex: number,
  curDiscard: GameCard[],
  coronationCandidateId: string | null,
  set: StateSetter
): {
  updatedPlayers: Player[];
  curDiscard: GameCard[];
  coronationTriggeredByReception: boolean;
  nextPlayerUpdated: Player;
} {
  let nextPlayerUpdated = updatedPlayers[nextIndex];
  let coronationTriggeredByReception = false;
  let newDiscard = [...curDiscard];

  if (nextPlayerUpdated.activePlot && nextPlayerUpdated.activePlot.type === 'Королевский приём') {
    const newFavor = Math.min(6, nextPlayerUpdated.favor + 1);
    nextPlayerUpdated = {
      ...nextPlayerUpdated,
      favor: newFavor,
      activePlot: null
    };
    updatedPlayers[nextIndex] = nextPlayerUpdated;
    triggerResourceFloat(set, nextPlayerUpdated.id, '+1 👑 Бал удался!', true);

    newDiscard = [...newDiscard, 'Королевский приём'];
    set(state => ({
      history: [`👑 Королевский приём ${declineGen(nextPlayerUpdated.name)} успешно состоялся! Получено +1 👑!`, ...state.history].slice(0, 50)
    }));

    if (newFavor >= 6 && !coronationCandidateId) {
      coronationTriggeredByReception = true;
    }
  } else if (nextPlayerUpdated.activePlot && nextPlayerUpdated.activePlot.type === 'Золотая булла') {
    const totalSeals = nextPlayerUpdated.seals + 1;
    const gainedCrowns = Math.floor(totalSeals / 2);
    const newFavor = Math.min(6, nextPlayerUpdated.favor + gainedCrowns);
    const remainderSeals = newFavor >= 6 ? 0 : (totalSeals % 2);

    nextPlayerUpdated = {
      ...nextPlayerUpdated,
      seals: remainderSeals,
      favor: newFavor,
      activePlot: null
    };
    updatedPlayers[nextIndex] = nextPlayerUpdated;
    triggerResourceFloat(set, nextPlayerUpdated.id, '+1 ⚜️ Булла!', true);
    if (gainedCrowns > 0) {
      setTimeout(() => {
        triggerResourceFloat(set, nextPlayerUpdated.id, `+${gainedCrowns} 👑`, true);
      }, 350);
    }

    newDiscard = [...newDiscard, 'Золотая булла'];
    const convNotice = gainedCrowns > 0 ? ` (2 печати дали +${gainedCrowns} 👑)` : '';
    set(state => ({
      history: [`📜 «Золотая булла» ${declineGen(nextPlayerUpdated.name)} принесла +1 ⚜️ печать${convNotice}!`, ...state.history].slice(0, 50)
    }));

    if (newFavor >= 6 && !coronationCandidateId) {
      coronationTriggeredByReception = true;
    }
  } else if (nextPlayerUpdated.activePlot && nextPlayerUpdated.activePlot.type === 'Сеть информаторов') {
    nextPlayerUpdated = {
      ...nextPlayerUpdated,
      activePlot: null
    };
    updatedPlayers[nextIndex] = nextPlayerUpdated;
    newDiscard = [...newDiscard, 'Сеть информаторов'];
    set(state => ({
      history: [`👁️ Действие «Сети информаторов» ${declineGen(nextPlayerUpdated.name)} завершилось после полного круга.`, ...state.history].slice(0, 50)
    }));
  }

  return {
    updatedPlayers,
    curDiscard: newDiscard,
    coronationTriggeredByReception,
    nextPlayerUpdated
  };
}
