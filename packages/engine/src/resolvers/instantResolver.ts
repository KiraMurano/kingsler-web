import type { Action, GameState, InstantType, CardId } from '../types';
import { CARD_INFO, drawCardsFromDeck } from '../cards';
import { pluck } from '../cardInstance';
import { botMemory } from '../Bot';
import { genOf } from '../utils/russianText';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS, VETO_WINDOW_MS } from '../timing';
import { loseCrowns } from './crownLoss';
import { canBeTargetedBy } from '../targeting';
import { vetoPlayed, vetoReset } from './vetoChain';

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
    const chain = vetoPlayed(get().vetoChain);
    /* Чётная цепочка означает, что вето отменили встречным вето и эффект
       всё-таки состоится. Первое вето — цепочка 1, отмена; второе — 2,
       действие возвращается; третье — снова отмена, и так по кругу. */
    const cancels = chain.isVetoed;
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      ...chain,
      overlayInstant: { card: 'Право вето', actorId: actor.id },
      activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: speech },
      history: [
        chain.vetoChain === 1
          ? `🚫 ${actor.name} играет инстант ⚡ «ПРАВО ВЕТО»! Эффект действия отменён!`
          : `🚫 ${actor.name} играет ⚡ «ПРАВО ВЕТО» поверх предыдущего (${chain.vetoChain}-е в цепочке)! ${cancels ? 'Эффект снова отменён' : 'Отмена снята — действие состоится'}!`,
        ...state.history
      ].slice(0, 50)
    }));
    triggerResourceFloat(set, actor.id, chain.vetoChain === 1 ? '🚫 ПРАВО ВЕТО!' : `🚫 ВЕТО НА ВЕТО (${chain.vetoChain})!`, false);

    if (get().turnPhase === 'VETO_WINDOW') {
      timerManager.clearAll();
      if (get().rules.vetoOnVeto) {
        /* Окно не закрывается, а начинается заново: двор должен успеть
           ответить на само вето. Длина цепочки ничем не ограничена — она
           упирается только в число «Прав вето», оставшихся на руках. */
        set({ vetoDeadlineAt: Date.now() + VETO_WINDOW_MS });
        timerManager.scheduleDelay(() => {
          if (get().turnPhase === 'VETO_WINDOW') get().proceedAfterVetoWindow();
        }, VETO_WINDOW_MS);
      } else {
        /* Полоска обязана исчезнуть в тот же кадр, что и решение: она
           отсчитывала время на решение, которое уже принято. */
        set({ vetoDeadlineAt: null });
        timerManager.scheduleDelay(() => {
          get().proceedAfterVetoWindow();
        }, ACTION_HOLD_MS);
      }
    }
  } else if (instantType === 'Перенаправление' && targetPlayerId) {
    const newTarget = players.find(p => p.id === targetPlayerId);
    const claim = pendingAction?.roleClaim;
    const redirectAllowed =
      !!pendingAction &&
      !!newTarget &&
      !!claim &&
      newTarget.id !== pendingAction.actorId &&
      canBeTargetedBy(newTarget, claim);

    if (redirectAllowed && pendingAction && newTarget) {
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
      ...vetoReset(),
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
      ...vetoReset(),
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
      ...vetoReset(),
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
    if (victim) {
      const result = loseCrowns(get, set, victim.id, 1, 'обвинения в измене', 'Измена!');
      if (result.kind === 'lost') {
        set(state => ({
          history: [`⛓️ «Обвинение в измене»: ${victim.name} теряет -1 👑!`, ...state.history].slice(0, 50)
        }));
        triggerResourceFloat(set, actor.id, `⛓️ Донос на ${victim.name}!`, true);
      } else if (result.kind === 'no_crowns') {
        set(state => ({
          history: [`⛓️ «Обвинение в измене» против ${victim.name} не сработало: у цели 0 👑!`, ...state.history].slice(0, 50)
        }));
      }
      // kind === 'blocked_by_charter': строку в историю уже написала грамота.
    }
    if (isOwnTurn) holdThenAdvance();
    return;
  }

  if (isOwnTurn) holdThenAdvance();
}
