import type { Action, GameState, InstantType, CardId } from '../types';
import { CARD_INFO, drawCardsFromDeck } from '../cards';
import { pluck } from '../cardInstance';
import { botMemory } from '../Bot';
import { genOf } from '../utils/russianText';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { fallenCoronationPatch } from './coronation';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

function instantAction(
  actorId: string,
  instantType: InstantType,
  targetPlayerId: string | undefined,
  tokenCost: number,
  cardId: CardId
): Action {
  return {
    id: Math.random().toString(36).substring(7),
    type: 'instant',
    name: instantType,
    instantType,
    actorId,
    targetId: targetPlayerId,
    stakedCardId: cardId,
    costGold: 0,
    costTokens: tokenCost,
    description: CARD_INFO[instantType]?.shortDescription ?? ''
  };
}

export function playInstant(
  get: StateGetter,
  set: StateSetter,
  playerId: string,
  instantType: InstantType,
  cardId: CardId,
  targetPlayerId?: string
): void {
  const { players, pendingAction, discardPile } = get();
  const actor = players.find(p => p.id === playerId);
  if (!actor) return;

  const isFreeInstant = instantType === 'Право вето' || instantType === 'Перенаправление';
  if (!isFreeInstant && actor.actionTokens < 1) return;

  const { taken: card, rest: newHand } = pluck(actor.hand, cardId);
  if (card?.card !== instantType) return;

  const updatedDiscard = [...discardPile, card];

  const tokenCost = isFreeInstant ? 0 : 1;
  const updatedPlayers = players.map(p =>
    p.id === actor.id
      ? {
          ...p,
          actionTokens: p.actionTokens - tokenCost,
          hand: newHand
        }
      : p
  );
  if (tokenCost > 0) {
    triggerResourceFloat(set, actor.id, '-1 ⚡', false);
  }

  const laid = instantAction(actor.id, instantType, targetPlayerId, tokenCost, card.id);
  const speech = `«${instantType}!»`;

  if (instantType === 'Ва-банк') {
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      isVaBanqueActive: true,
      pendingAction: laid,
      overlayInstant: null,
      activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: speech },
      history: [
        `🎲 ${actor.name} играет инстант ⚡ «ВА-БАНК» (потрачен 1 ⚡)! Награда за этот спор удваивается (2 ⚜️ = 1 👑)!`,
        ...state.history
      ].slice(0, 50)
    }));
    triggerResourceFloat(set, actor.id, '⚡ ВА-БАНК! (x2)', true);
    timerManager.scheduleDelay(() => {
      if (get().pendingAction?.instantType === 'Ва-банк') {
        set({ pendingAction: null });
      }
    }, ACTION_HOLD_MS);
  } else if (instantType === 'Право вето') {
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      isVetoed: true,
      overlayInstant: { card: 'Право вето', actorId: actor.id },
      activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: speech },
      history: [
        `🚫 ${actor.name} играет инстант ⚡ «ПРАВО ВЕТО»! Эффект действия отменён!`,
        ...state.history
      ].slice(0, 50)
    }));
    triggerResourceFloat(set, actor.id, '🚫 ПРАВО ВЕТО!', false);

    if (get().turnPhase === 'VETO_WINDOW') {
      timerManager.clearAll();
      /* Полоска обязана исчезнуть в тот же кадр, что и решение: она
         отсчитывала время на решение, которое уже принято. */
      set({ vetoDeadlineAt: null });
      timerManager.scheduleDelay(() => {
        get().proceedAfterVetoWindow();
      }, ACTION_HOLD_MS);
    }
  } else if (instantType === 'Перенаправление' && targetPlayerId) {
    const newTarget = players.find(p => p.id === targetPlayerId);
    if (pendingAction && newTarget) {
      const updatedAction = { ...pendingAction, targetId: targetPlayerId };
      set(state => ({
        players: updatedPlayers,
        discardPile: updatedDiscard,
        pendingAction: updatedAction,
        overlayInstant: { card: 'Перенаправление', actorId: actor.id },
        turnPhase: 'TARGET_REACTION_WINDOW',
        timerSeconds: 0,
        timerMaxSeconds: 0,
        activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: speech },
        history: [
          `🔀 ${actor.name} играет инстант ⚡ «ПЕРЕНАПРАВЛЕНИЕ»! Новая цель атаки: ${newTarget.name}!`,
          ...state.history
        ].slice(0, 50)
      }));
    }
  } else if (instantType === 'Дворцовый переполох' && targetPlayerId) {
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      pendingAction: laid,
      overlayInstant: null,
      isPendingActionAfterTruthChallenge: false,
      isVetoed: false,
      turnSubPhase: 'CARD_PLAY_PHASE',
      activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: speech },
      history: [
        `⚡ ${actor.name} разыгрывает инстант «ДВОРЦОВЫЙ ПЕРЕПОЛОХ» (потрачен 1 ⚡)! Двор может наложить Вето до смены руки ${(() => { const t = players.find(p => p.id === targetPlayerId); return t ? genOf(t) : 'цели'; })()}.`,
        ...state.history
      ].slice(0, 50)
    }));
    get()._triggerVetoWindowOrResolveEffect(laid, false);
  } else if (instantType === 'Обыск покоев' && targetPlayerId) {
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      pendingAction: laid,
      overlayInstant: null,
      isPendingActionAfterTruthChallenge: false,
      isVetoed: false,
      turnSubPhase: 'CARD_PLAY_PHASE',
      activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: speech },
      history: [
        `🔍 ${actor.name} разыгрывает инстант ⚡ «ОБЫСК ПОКОЕВ» (потрачен 1 ⚡) против ${players.find(p => p.id === targetPlayerId)?.name ?? 'цели'}! Двор может наложить Вето.`,
        ...state.history
      ].slice(0, 50)
    }));
    get()._triggerVetoWindowOrResolveEffect(laid, false);
  } else if (instantType === 'Обвинение в измене' && targetPlayerId) {
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      pendingAction: laid,
      overlayInstant: null,
      isPendingActionAfterTruthChallenge: false,
      isVetoed: false,
      turnSubPhase: 'CARD_PLAY_PHASE',
      activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: speech },
      history: [
        `⛓️ ${actor.name} разыгрывает инстант ⚡ «ОБВИНЕНИЕ В ИЗМЕНЕ» (потрачен 1 ⚡) против ${players.find(p => p.id === targetPlayerId)?.name ?? 'цели'}! Двор может наложить Вето.`,
        ...state.history
      ].slice(0, 50)
    }));
    get()._triggerVetoWindowOrResolveEffect(laid, false);
  }
}

export function resolveInstantEffect(
  get: StateGetter,
  set: StateSetter,
  action: Action
): void {
  const { players, discardPile, activePlayerId } = get();
  const actor = players.find(p => p.id === action.actorId);
  const instantType = action.instantType;
  if (!actor || !instantType) {
    get()._checkEndgameAndAdvanceTurn();
    return;
  }

  const isOwnTurn = actor.id === activePlayerId;
  const holdThenAdvance = () => {
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
  };

  if (instantType === 'Дворцовый переполох' && action.targetId) {
    const targetIdx = players.findIndex(p => p.id === action.targetId);
    if (targetIdx !== -1) {
      const victim = players[targetIdx];
      const {
        drawn: newTwo,
        deck: d2,
        discardPile: disc2
      } = drawCardsFromDeck(2, get().deck, [...discardPile, ...victim.hand]);
      const newPlayers = players.map(p => p.id === victim.id ? { ...p, hand: newTwo } : p);
      botMemory.invalidatePlayerHand(victim.id);
      set(state => ({
        players: newPlayers,
        deck: d2,
        discardPile: disc2,
        history: [
          `⚡ «Дворцовый переполох»: ${victim.name} сбрасывает руку и берёт 2 новые карты!`,
          ...state.history
        ].slice(0, 50)
      }));
      triggerResourceFloat(set, victim.id, '🔄 Смена руки!', false);
    }
    if (isOwnTurn) holdThenAdvance();
    return;
  }

  if (instantType === 'Обыск покоев' && action.targetId) {
    const victim = players.find(p => p.id === action.targetId);
    if (victim?.activePlot) {
      const plotType = victim.activePlot.type;
      const searched = { id: victim.activePlot.cardId, card: plotType };
      const newPlayers = players.map(p =>
        p.id === victim.id ? { ...p, activePlot: null } : p
      );
      set(state => ({
        players: newPlayers,
        discardPile: [...state.discardPile, searched],
        history: [
          `🔍 «Обыск покоев»: интрига ${genOf(victim)} («${plotType}») сброшена!`,
          ...state.history
        ].slice(0, 50)
      }));
      triggerResourceFloat(set, victim.id, '🔍 Интрига сброшена!', false);
    } else if (victim) {
      set(state => ({
        history: [
          `🔍 «Обыск покоев» против ${victim.name} не сработал: у цели нет активной интриги.`,
          ...state.history
        ].slice(0, 50)
      }));
    }
    if (isOwnTurn) holdThenAdvance();
    return;
  }

  if (instantType === 'Обвинение в измене' && action.targetId) {
    const victim = players.find(p => p.id === action.targetId);
    if (victim && victim.favor > 0) {
      const newPlayers = players.map(p =>
        p.id === victim.id ? { ...p, favor: p.favor - 1 } : p
      );
      set(state => ({
        players: newPlayers,
        ...fallenCoronationPatch(state.coronationCandidateId, victim.id, victim.favor - 1),
        history: [
          `⛓️ «Обвинение в измене»: ${victim.name} теряет -1 👑!`,
          ...(state.coronationCandidateId === victim.id && victim.favor - 1 < 6
            ? [`⚖️ Коронация ${victim.name} сорвана Обвинением в измене! Влияние упало ниже 6 👑!`]
            : []),
          ...state.history
        ].slice(0, 50)
      }));
      get()._disruptPlayerPlotsOnLoss(victim.id, 'обвинения в измене');
      triggerResourceFloat(set, victim.id, '-1 👑 Измена!', false);
      triggerResourceFloat(set, actor.id, `⛓️ Донос на ${victim.name}!`, true);
    } else if (victim) {
      set(state => ({
        history: [
          `⛓️ «Обвинение в измене» против ${victim.name} не сработало: у цели 0 👑!`,
          ...state.history
        ].slice(0, 50)
      }));
    }
    if (isOwnTurn) holdThenAdvance();
    return;
  }

  if (isOwnTurn) holdThenAdvance();
}
