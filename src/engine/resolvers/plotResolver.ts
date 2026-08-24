import type { Action, GameState, PlotType, Player, GameCard } from '../types';
import { CARD_INFO } from '../cards';
import { declineGen } from '../utils/russianText';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { fallenCoronationPatch, beginCoronationIfNeeded } from './coronation';

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
  const { players, activePlayerId } = get();
  const actor = players.find(p => p.id === activePlayerId);
  if (!actor || actor.actionTokens < 1) return;

  const playedCard = actor.hand[cardIndex];
  if (playedCard !== plotType) return;

  const newHand = [...actor.hand];
  newHand.splice(cardIndex, 1);

  const newPlayers = players.map(p => p.id === actor.id ? {
    ...p,
    actionTokens: p.actionTokens - 1,
    hand: newHand
  } : p);

  triggerResourceFloat(set, actor.id, '-1 ⚡', false);

  const target = targetPlayerId ? players.find(p => p.id === targetPlayerId) : null;
  const targetText = target ? ` (цель: ${target.name})` : '';

  const action: Action = {
    id: Math.random().toString(36).substring(7),
    type: 'plot',
    name: plotType,
    plotType,
    actorId: actor.id,
    targetId: targetPlayerId,
    costGold: 0,
    costTokens: 1,
    description: CARD_INFO[plotType]?.shortDescription ?? ''
  };

  set(state => ({
    players: newPlayers,
    pendingAction: action,
    hasPlayedPlotThisTurn: true,
    isVetoed: false,
    overlayInstant: null,
    isPendingActionAfterTruthChallenge: false,
    turnSubPhase: 'CARD_PLAY_PHASE',
    history: [`🎴 ${actor.name} разыгрывает Интригу «${plotType}»${targetText} (потрачен 1 ⚡).`, ...state.history].slice(0, 50)
  }));

  get()._triggerVetoWindowOrResolveEffect(action, false);
}

export function landPlot(get: StateGetter, set: StateSetter, action: Action): void {
  const { players, discardPile } = get();
  const actor = players.find(p => p.id === action.actorId);
  const plotType = action.plotType;
  if (!actor || !plotType) {
    get()._checkEndgameAndAdvanceTurn();
    return;
  }

  const oldPlot = actor.activePlot;
  const updatedDiscard = oldPlot ? [...discardPile, oldPlot.type] : discardPile;
  const newPlotData = {
    id: Math.random().toString(36).substring(7),
    type: plotType,
    targetPlayerId: action.targetId,
    charges: plotType === 'Сеть информаторов' ? 2 : plotType === 'Тайный заговор' ? 0 : undefined
  };

  set(state => ({
    players: state.players.map(p => p.id === actor.id ? { ...p, activePlot: newPlotData } : p),
    discardPile: updatedDiscard
  }));

  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, ACTION_HOLD_MS);
}

/**
 * Заряжает активные «Тайные заговоры» только от проверок («НЕ ВЕРЮ!») и дуэлей.
 */
export function chargeActiveConspiracies(
  get: StateGetter,
  set: StateSetter,
  reason: string
): void {
  const { players } = get();
  const conspiracyHolders = players.filter(p => p.activePlot?.type === 'Тайный заговор' && (p.activePlot.charges ?? 0) < 4);
  if (conspiracyHolders.length === 0) return;

  const newPlayers = players.map(p => {
    if (p.activePlot?.type === 'Тайный заговор' && (p.activePlot.charges ?? 0) < 4) {
      const nextCharges = Math.min(4, (p.activePlot.charges ?? 0) + 1);
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
    history: [...logs, ...state.history].slice(0, 50)
  }));
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
  if (charges < 1) return;

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
  _isFreeReaction = false
): void {
  const { players } = get();
  const player = players.find(p => p.id === playerId);
  const target = players.find(p => p.id === targetPlayerId);
  if (!player || !target || player.activePlot?.type !== 'Тайный заговор') return;

  const charges = player.activePlot.charges ?? 0;
  if (charges < 1) return;
  if (effect === 'crown' && charges < 3) return;
  if (player.actionTokens < 1) return;

  const tokenCost = 1;
  const cannotBeVetoed = charges >= 4;

  if (tokenCost > 0) {
    triggerResourceFloat(set, player.id, '-1 ⚡', false);
  }

  const action: Action = {
    id: Math.random().toString(36).substring(7),
    type: 'plot',
    name: 'Тайный заговор',
    plotType: 'Тайный заговор',
    actorId: player.id,
    targetId: target.id,
    costGold: 0,
    costTokens: tokenCost,
    conspiracyEffect: effect,
    cannotBeVetoed,
    description: CARD_INFO['Тайный заговор']?.shortDescription ?? ''
  };

  set(state => ({
    players: tokenCost > 0
      ? state.players.map(p => p.id === player.id ? { ...p, actionTokens: p.actionTokens - tokenCost } : p)
      : state.players,
    pendingAction: action,
    conspiracyPrompt: null,
    isVetoed: false,
    overlayInstant: null,
    history: [
      `⚔️ ${player.name} свершает «Тайный заговор» (${charges} зар.)${cannotBeVetoed ? ' [🛡️ Нельзя отменить Вето]' : ''}!`,
      ...state.history
    ].slice(0, 50)
  }));

  if (cannotBeVetoed) {
    applyConspiracyEffect(get, set, action);
    return;
  }
  get()._triggerVetoWindowOrResolveEffect(action, false);
}

export function applyConspiracyEffect(get: StateGetter, set: StateSetter, action: Action): void {
  const { players, discardPile, coronationCandidateId } = get();
  const player = players.find(p => p.id === action.actorId);
  const target = players.find(p => p.id === action.targetId);
  if (!player || !target || player.activePlot?.type !== 'Тайный заговор') {
    get()._checkEndgameAndAdvanceTurn();
    return;
  }

  const charges = player.activePlot.charges ?? 0;
  const effect = action.conspiracyEffect ?? 'gold';
  const newDiscard: GameCard[] = [...discardPile, 'Тайный заговор'];

  if (effect === 'gold') {
    const goldLoss = Math.min(charges, target.gold);
    const newPlayers = players.map(p => {
      if (p.id === target.id) return { ...p, gold: p.gold - goldLoss };
      if (p.id === player.id) return { ...p, activePlot: null };
      return p;
    });
    set(state => ({
      players: newPlayers,
      discardPile: newDiscard,
      conspiracyPrompt: null,
      history: [
        `⚔️ «Тайный заговор» (${charges} зар.): ${target.name} теряет ${goldLoss} 🪙 в казну!`,
        ...state.history
      ].slice(0, 50)
    }));
    if (goldLoss > 0) {
      get()._disruptPlayerPlotsOnLoss(target.id, 'удара Заговора');
      triggerResourceFloat(set, target.id, `-${goldLoss} 🪙 Заговор`, false);
    }
    triggerResourceFloat(set, player.id, `⚔️ Сброс ${goldLoss} 🪙!`, true);
  } else {
    const favorLoss = Math.min(1, target.favor);
    const newTargetFavor = Math.max(0, target.favor - favorLoss);
    const newPlayers = players.map(p => {
      if (p.id === target.id) return { ...p, favor: newTargetFavor };
      if (p.id === player.id) return { ...p, activePlot: null };
      return p;
    });
    set(state => ({
      players: newPlayers,
      discardPile: newDiscard,
      ...fallenCoronationPatch(coronationCandidateId, target.id, newTargetFavor),
      conspiracyPrompt: null,
      history: [
        `💥 «Тайный заговор» (${charges} зар.): ${target.name} лишается 1 👑 короны!`,
        ...state.history
      ].slice(0, 50)
    }));
    if (favorLoss > 0) {
      get()._disruptPlayerPlotsOnLoss(target.id, 'удара Заговора');
      triggerResourceFloat(set, target.id, '-1 👑 Заговор!', false);
    }
    triggerResourceFloat(set, player.id, `⚔️ Лишение 1 👑 у ${target.name}!`, true);
  }

  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, ACTION_HOLD_MS);
}

export function applyMorningPlotReward(get: StateGetter, set: StateSetter, action: Action): void {
  const { players, discardPile, coronationCandidateId } = get();
  const idx = players.findIndex(p => p.id === action.actorId);
  const player = idx >= 0 ? players[idx] : null;
  const plotType = player?.activePlot?.type;
  if (!player || (plotType !== 'Королевский приём' && plotType !== 'Золотая булла')) {
    set({
      pendingAction: null,
      turnPhase: 'IDLE',
      turnSubPhase: 'NORMAL_ACTION_PHASE'
    });
    return;
  }

  const result = resolveMorningPlots(
    [...players],
    idx,
    discardPile,
    coronationCandidateId,
    set
  );
  set({
    players: result.updatedPlayers,
    discardPile: result.curDiscard,
    pendingAction: null,
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE'
  });
  if (result.coronationTriggeredByReception) {
    beginCoronationIfNeeded(get, set, result.nextPlayerUpdated.id);
  }
}

export function discardMorningPlot(get: StateGetter, set: StateSetter, actorId: string): void {
  const { players, discardPile } = get();
  const player = players.find(p => p.id === actorId);
  const plotType = player?.activePlot?.type;
  if (!player || !plotType) {
    set({ pendingAction: null, turnPhase: 'IDLE', turnSubPhase: 'NORMAL_ACTION_PHASE' });
    return;
  }
  set(state => ({
    players: state.players.map(p => p.id === actorId ? { ...p, activePlot: null } : p),
    discardPile: [...discardPile, plotType],
    pendingAction: null,
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE',
    history: [`🛡️ Утренний эффект «${plotType}» ${declineGen(player.name)} отменён Вето.`, ...state.history].slice(0, 50)
  }));
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
