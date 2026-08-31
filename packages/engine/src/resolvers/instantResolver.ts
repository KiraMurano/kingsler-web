import type { Action, GameState, InstantType, CardId } from '../types';
import { CARD_INFO, drawCardsFromDeck } from '../cards';
import { pluck } from '../cardInstance';
import { playPayment } from '../rules';
import { botMemory } from '../Bot';
import { genOf } from '../utils/russianText';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { loseCrowns } from './crownLoss';
import { plotDisrupted } from './plotResolver';
import { canBeTargetedBy, canBeTargetedByInstant } from '../targeting';
import { vetoPlayed, vetoReset, vetoPollAnswered, vetoTopActorId } from './vetoChain';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

function instantAction(
  actorId: string,
  instantType: InstantType,
  targetPlayerId: string | undefined,
  tokenCost: number,
  goldCost: number,
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
    costGold: goldCost,
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
  const { players, pendingAction, discardPile, rules } = get();
  const actor = players.find(p => p.id === playerId);
  if (!actor) return;

  /*
   * Законность «Перенаправления» проверяется ДО списания.
   *
   * Оно ложится только на живую атаку и только на цель, которую этой ролью
   * вообще можно выбрать. Раньше проверка стояла внутри ветки эффекта и
   * ничего не стоила — теперь карта тратит жетон, и уйти он может только за
   * перевод, который действительно состоится.
   */
  if (instantType === 'Перенаправление') {
    const newTarget = players.find(p => p.id === targetPlayerId);
    const claim = pendingAction?.roleClaim;
    const allowed =
      !!pendingAction &&
      !!newTarget &&
      !!claim &&
      newTarget.id !== pendingAction.actorId &&
      canBeTargetedBy(newTarget, claim);
    if (!allowed) return;
  }

  /*
   * Вето не кладут поверх собственной карты.
   *
   * Наверху лежит либо само действие, либо последнее вето — и отменять то,
   * что сам только что положил, бессмысленно: своё действие ты и так можешь
   * не делать, а вето на своё вето лишь возвращает действие, которое ты этим
   * вето и отменял. Чистая потеря карты, и именно её выбирал бот, попадая в
   * новый круг опроса сразу после собственного вето.
   */
  if (instantType === 'Право вето' && pendingAction) {
    const { overlayInstant } = get();
    if (playerId === vetoTopActorId(pendingAction.actorId, overlayInstant)) return;
  }

  /*
   * Целевой инстант не играется по пустой цели.
   *
   * «Обыск покоев» против игрока без интриги не делает ничего — резолвер ниже
   * честно пишет в летопись «не сработал», — но карта к тому моменту уже
   * сброшена, а жетон списан. Проверяем до списания: заставу ставим здесь, а
   * не только в интерфейсе, потому что сюда же приходят ходы по сети.
   */
  if (targetPlayerId) {
    const victim = players.find(p => p.id === targetPlayerId);
    if (victim && !canBeTargetedByInstant(victim, instantType)) return;
  }

  /* Бесплатен только щит двора: «Право вето» отвечает на чужой ход и жетона
     не стоит. «Перенаправление» переводит нападение на соседа — это ход, а не
     защита, и он оплачивается жетоном, как любой другой. */
  const isFreeInstant = instantType === 'Право вето';
  const payment = isFreeInstant ? { tokens: 0, gold: 0 } : playPayment(rules, actor);
  if (!payment) return;

  const { taken: card, rest: newHand } = pluck(actor.hand, cardId);
  if (card?.card !== instantType) return;

  const updatedDiscard = [...discardPile, card];

  const updatedPlayers = players.map(p =>
    p.id === actor.id
      ? {
          ...p,
          actionTokens: p.actionTokens - payment.tokens,
          gold: p.gold - payment.gold,
          hand: newHand
        }
      : p
  );
  if (payment.gold > 0) {
    triggerResourceFloat(set, actor.id, `-${payment.gold} 🪙`, false);
  }
  if (payment.tokens > 0) {
    triggerResourceFloat(set, actor.id, '-1 ⚡', false);
  }

  const laid = instantAction(actor.id, instantType, targetPlayerId, payment.tokens, payment.gold, card.id);
  const speech = `«${instantType}!»`;
  const spent = payment.tokens > 0 ? 'потрачен 1 ⚡' : payment.gold > 0 ? `потрачено ${payment.gold} 🪙` : 'бесплатно';

  if (instantType === 'Ва-банк') {
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      isVaBanqueActive: true,
      pendingAction: laid,
      overlayInstant: null,
      activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: speech },
      history: [
        `🎲 ${actor.name} играет инстант ⚡ «ВА-БАНК» (${spent})! Награда за этот спор удваивается (2 ⚜️ = 1 👑)!`,
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
      /*
       * Круг опроса начинается заново ТЕМ ЖЕ `set`, что меняет цепочку.
       *
       * Это одно событие, и увидеть его наполовину нельзя. Раньше ответы
       * гасились следующим `set`, и подписчик — движок ботов — успевал
       * проснуться между ними: цепочка уже новая, а список ответивших ещё
       * старый. Боты, ответившие в прошлом круге, отфильтровывались как
       * «уже ответившие», планировать было некого, а второй `set` движок не
       * будил (цепочка в нём не менялась). Опрос оставался ждать ответов,
       * которых никто не даст, — стол вставал намертво ровно на вето в вето.
       */
      pendingVetoPassedIds: [],
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
        /* Ответы прошлого круга уже погашены выше, вместе с цепочкой: вопрос
           теперь другой, и «пропустил первое вето» не значит «пропускаю
           встречное». Автор действия в новом круге появляется — отменили
           именно его, ему и отвечать, — а сам наложивший вето выпадает.
           Длина цепочки ограничена только числом «Прав вето» на руках.

           Здесь остаётся одно: спрашивать может быть уже некого. */
        const { players, pendingAction: pending, overlayInstant: top } = get();
        if (pending && vetoPollAnswered(players, vetoTopActorId(pending.actorId, top), [])) {
          get().proceedAfterVetoWindow();
        }
      } else {
        /* Вето на вето запрещено — отвечать больше нечем и незачем: окно
           закрывается сразу, задержка только чтобы карту успели прочесть. */
        timerManager.scheduleDelay(() => {
          get().proceedAfterVetoWindow();
        }, ACTION_HOLD_MS);
      }
    }
  } else if (instantType === 'Перенаправление' && pendingAction && targetPlayerId) {
    const newTarget = players.find(p => p.id === targetPlayerId)!;
    const updatedAction = { ...pendingAction, targetId: targetPlayerId };

    /*
     * Перевод — такой же ход, как любой другой, и двор отвечает на него вето.
     *
     * Раньше эта ветка выставляла окно реакции новой жертвы напрямую, минуя
     * окно вето: «Перенаправление» было единственной картой в игре, которую
     * нельзя было отменить вовсе. Нападающий смотрел, как его удар уводят на
     * соседа, с «Правом вето» на руках и без единой возможности его сыграть.
     *
     * Ветируется именно перевод, а не нападение: вето вернёт цель на прежнюю,
     * и удар состоится — по тому, на кого его и направляли. Ради этого
     * запоминается прежняя цель.
     */
    set(state => ({
      players: updatedPlayers,
      discardPile: updatedDiscard,
      pendingAction: updatedAction,
      overlayInstant: { card: 'Перенаправление', actorId: actor.id },
      pendingRedirectFromId: pendingAction.targetId ?? null,
      ...vetoReset(),
      turnPhase: 'VETO_WINDOW',
      pendingVetoPassedIds: [],
      pendingVetoActionId: updatedAction.id,
      timerSeconds: 0,
      timerMaxSeconds: 0,
      activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: speech },
      history: [
        `🔀 ${actor.name} играет инстант ⚡ «ПЕРЕНАПРАВЛЕНИЕ» (${spent})! Новая цель атаки: ${newTarget.name}. Двор может отменить перевод «Правом вето».`,
        ...state.history
      ].slice(0, 50)
    }));

    /* Спрашивать может быть некого: наверху лежит карта переведшего, и его не
       спрашивают, а больше за столом никого не осталось. */
    const after = get();
    if (
      vetoPollAnswered(
        after.players,
        vetoTopActorId(updatedAction.actorId, after.overlayInstant),
        []
      )
    ) {
      get().proceedAfterVetoWindow();
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
        `⚡ ${actor.name} разыгрывает инстант «ДВОРЦОВЫЙ ПЕРЕПОЛОХ» (${spent})! Двор может наложить Вето до смены руки ${(() => { const t = players.find(p => p.id === targetPlayerId); return t ? genOf(t) : 'цели'; })()}.`,
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
        `🔍 ${actor.name} разыгрывает инстант ⚡ «ОБЫСК ПОКОЕВ» (${spent}) против ${players.find(p => p.id === targetPlayerId)?.name ?? 'цели'}! Двор может наложить Вето.`,
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
        `⛓️ ${actor.name} разыгрывает инстант ⚡ «ОБВИНЕНИЕ В ИЗМЕНЕ» (${spent}) против ${players.find(p => p.id === targetPlayerId)?.name ?? 'цели'}! Двор может наложить Вето.`,
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
        ...plotDisrupted(searched.id, state.plotPulses),
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
