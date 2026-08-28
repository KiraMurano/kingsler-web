import { create } from 'zustand';
import type {
  GameState,
  Player,
  Action,
  CardInstance
} from './types';
import { byId, idOf, pluck } from './cardInstance';
import {
  createInitialDeck,
  drawCardsFromDeck,
  TOTAL_DECK_SIZE
} from './cards';
import { botMemory, clearBotTimers } from './Bot';
import { ALL_BOT_CANDIDATES, getBotArchetype, type BotCandidate } from './botsConfig';
import { accOf, shuffleArray } from './utils/russianText';
import { timerManager } from './utils/timerManager';
import { ACTION_HOLD_MS, TOSS_SPIN_MS, TOSS_START_MS } from './timing';
import { triggerResourceFloat } from './utils/visualEffects';

// Domain Resolvers
import { addSealsToPlayer } from './resolvers/sealsResolver';
import { canBeTargetedBy } from './targeting';
import {
  disruptPlayerPlotsOnLoss,
  playPlotAction,
  openConspiracyDialog,
  closeConspiracyDialog,
  activateConspiracy
} from './resolvers/plotResolver';
import { executeNormalAction } from './resolvers/normalActionResolver';
import { resolveRoleActionEffect } from './resolvers/roleResolver';
import {
  targetDeclareDuel,
  attackerRetreatDuel,
  attackerAcceptDuel,
  closeDuelOutcome
} from './resolvers/duelResolver';
import {
  doubtAction,
  passDoubt,
  executeRevealOutcome,
  closeRevealOutcome,
  proceedAfterDoubtPassed,
  triggerVetoWindowOrResolveEffect,
  proceedAfterVetoWindow,
  resolvePendingActionEffect
} from './resolvers/doubtResolver';
import { playInstant } from './resolvers/instantResolver';
import { checkEndgameAndAdvanceTurn, endTurn } from './resolvers/turnResolver';

export { ALL_BOT_CANDIDATES, getBotArchetype };
export type { BotCandidate };

/**
 * Отсчёт от последней галочки «Готов» до первого хода.
 *
 * Своя ручка, а не `timerManager`: у того один слот отложенного вызова, и его
 * чистит `clearAll()` — а его зовёт почти каждое действие и начало хода.
 * Отсчёт, потерявший таймер, не закончится никогда, и стол останется под
 * оверлеем навсегда.
 */
let tossStartTimer: ReturnType<typeof setTimeout> | null = null;


export const useGameStore = create<GameState>((set, get) => ({
  // State Properties
  players: [],
  deck: [],
  discardPile: [],
  activePlayerId: 'p1',
  turnPhase: 'IDLE',
  turnSubPhase: 'NORMAL_ACTION_PHASE',

  hasUsedNormalActionThisTurn: false,
  hasPlayedRoleThisTurn: false,
  hasPlayedPlotThisTurn: false,

  coronationCandidateId: null,
  coronationOriginId: null,
  openingToss: null,
  pendingAction: null,
  pendingDoubtDoubterId: null,
  pendingDoubtPassedIds: [],
  pendingDoubtActionId: null,
  vetoDeadlineAt: null,

  isVaBanqueActive: false,
  isVetoed: false,
  isPendingActionAfterTruthChallenge: false,

  pendingDuelDefenderCardId: null,
  pendingDuelDefenderRoleClaim: null,
  duelOutcome: null,

  timerSeconds: 0,
  timerMaxSeconds: 14,
  isTimerPaused: false,

  revealOutcome: null,
  informantPeekData: null,
  conspiracyPrompt: null,

  activeSpeechReactions: {},
  floatingResourceEvents: [],
  overlayInstant: null,

  winnerId: null,
  history: [],

  // --------------------------------------------------------------------------
  // GAME LIFECYCLE
  // --------------------------------------------------------------------------

  startGame: (seats) => {
    timerManager.clearAll();
    if (tossStartTimer !== null) {
      clearTimeout(tossStartTimer);
      tossStartTimer = null;
    }
    botMemory.clear();
    const deck = createInitialDeck(); // состав считается из CARD_COPIES_MAP

    const humanSeats = seats && seats.length > 0
      ? seats.slice(0, 4)
      : [{ id: 'p1', name: 'Вы', avatar: '/avatars/anton.webp' }];

    const botsNeeded = 4 - humanSeats.length;
    const selectedBots = shuffleArray([...ALL_BOT_CANDIDATES]).slice(0, botsNeeded);

    /* Id ботов чеканятся здесь, до перемешивания стола: `b1` должен означать
       бота, а не место. Место живёт в `seatNumber`, который ставится ниже. */
    const seated: Omit<Player, 'seatNumber'>[] = [
      ...humanSeats.map(seat => ({
        id: seat.id,
        name: seat.name,
        avatar: seat.avatar ?? '/avatars/anton.webp',
        title: seat.title,
        isBot: false,
        gold: 2,
        favor: 0,
        seals: 0,
        actionTokens: 2,
        hand: [deck.pop()!, deck.pop()!],
        activePlot: null
      })),
      ...selectedBots.map((b, idx) => ({
        id: `b${idx + 1}`,
        name: b.name,
        avatar: b.avatar,
        isBot: true,
        archetype: b.archetype,
        gold: 2,
        favor: 0,
        seals: 0,
        actionTokens: 2,
        hand: [deck.pop()!, deck.pop()!],
        activePlot: null
      }))
    ];

    /* Одно перемешивание задаёт и рассадку, и порядок хода — и держит их
       согласованными. Порядок хода — это порядок массива (`turnResolver`
       берёт следующего по индексу), а видимая рассадка — `seatNumber`
       относительно зрителя (`web/src/lib/seats.ts`). Круг за столом
       по-прежнему идёт по часовой стрелке, просто неизвестно, кто где. */
    const players: Player[] = shuffleArray(seated).map((p, idx) => ({
      ...p,
      seatNumber: idx + 1
    }));

    /* Жребий: первым ходит случайное место, а не хозяин комнаты. */
    const firstPlayer = players[Math.floor(Math.random() * players.length)];

    set({
      players,
      deck,
      discardPile: [],
      activePlayerId: firstPlayer.id,
      openingToss: {
        winnerId: firstPlayer.id,
        landsAt: Date.now() + TOSS_SPIN_MS,
        readyIds: [],
        startsAt: null
      },
      turnPhase: 'IDLE',
      turnSubPhase: 'NORMAL_ACTION_PHASE',
      hasUsedNormalActionThisTurn: false,
      hasPlayedRoleThisTurn: false,
      hasPlayedPlotThisTurn: false,
      coronationCandidateId: null,
      coronationOriginId: null,
      pendingAction: null,
      pendingDoubtPassedIds: [],
      pendingDoubtActionId: null,
      vetoDeadlineAt: null,
      overlayInstant: null,
      isVaBanqueActive: false,
      isVetoed: false,
      isPendingActionAfterTruthChallenge: false,
      pendingDuelDefenderCardId: null,
      pendingDuelDefenderRoleClaim: null,
      duelOutcome: null,
      timerSeconds: 0,
      timerMaxSeconds: 14,
      revealOutcome: null,
      informantPeekData: null,
      activeSpeechReactions: {},
      floatingResourceEvents: [],
      winnerId: null,
      conspiracyPrompt: null,
      history: [
        `🪙 Жребий брошен: первым ходит ${firstPlayer.name}.`,
        `👑 Новая партия началась! В колоде ${TOTAL_DECK_SIZE} карт (роли, интриги, инстанты). У каждого по 2 🪙, 2 карты и 2 ⚡ жетона действия.`
      ]
    });
  },

  /**
   * «Готов» на экране жребия.
   *
   * Экран снимается готовностью, а не таймером: партия начинается, когда её
   * начал каждый за столом. Боты отмечаются сами и вразнобой — см.
   * `botEngine`; здесь между ними и людьми разницы нет, иначе кружки ботов
   * пришлось бы зажигать отдельным механизмом мимо состояния.
   */
  markReady: (playerId: string) => {
    const { openingToss, players } = get();
    if (!openingToss || openingToss.readyIds.includes(playerId)) return;
    if (!players.some(p => p.id === playerId)) return;

    set({ openingToss: { ...openingToss, readyIds: [...openingToss.readyIds, playerId] } });
    get()._settleOpeningToss();
  },

  _settleOpeningToss: () => {
    const { openingToss, players } = get();
    if (!openingToss || openingToss.startsAt !== null) return;

    const waiting = players.filter(p => !openingToss.readyIds.includes(p.id));
    if (waiting.length > 0) return;

    /* Не в тот же кадр: игрок ещё смотрит на список готовности, а стол уже
       подменился бы под ним. Отсчёт живёт в состоянии, поэтому онлайн-стол
       оживает у всех разом, а не у каждого по своему таймеру. */
    set({ openingToss: { ...openingToss, startsAt: Date.now() + TOSS_START_MS } });
    if (tossStartTimer !== null) clearTimeout(tossStartTimer);
    tossStartTimer = setTimeout(() => {
      tossStartTimer = null;
      set({ openingToss: null });
    }, TOSS_START_MS);
  },

  restartGame: () => {
    const seats = get().players
      .filter(player => !player.isBot)
      .map(player => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        title: player.title
      }));
    get().startGame(seats);
  },

  // --------------------------------------------------------------------------
  // RESOURCE & SEALS RESOLUTION
  // --------------------------------------------------------------------------

  addSealsToPlayer: (playerId: string, count: number) => {
    addSealsToPlayer(get, set, playerId, count);
  },

  _disruptPlayerPlotsOnLoss: (victimId: string, reason: string) => {
    disruptPlayerPlotsOnLoss(get, set, victimId, reason);
  },

  _drawCardForPlayerWithInformantCheck: (_playerIndex: number): CardInstance => {
    const { deck, discardPile } = get();
    const { drawn, deck: newDeck, discardPile: newDiscardPile } = drawCardsFromDeck(1, deck, discardPile);
    set({ deck: newDeck, discardPile: newDiscardPile });
    return drawn[0];
  },

  // --------------------------------------------------------------------------
  // TURN FLOW & PHASE CONTROLS
  // --------------------------------------------------------------------------

  skipNormalActionPhase: () => {
    const { turnPhase, turnSubPhase, pendingAction } = get();
    if (turnPhase !== 'IDLE' || turnSubPhase !== 'NORMAL_ACTION_PHASE' || pendingAction) return;
    set({ turnSubPhase: 'CARD_PLAY_PHASE' });
  },

  endTurnManually: () => {
    const { turnPhase, activePlayerId, players, pendingAction } = get();
    // A normal action briefly sits as a pendingAction while turnPhase is
    // still IDLE, waiting for its ACTION_HOLD_MS timer to apply its effect.
    // Ending the turn here would clear that timer and drop the effect.
    if (turnPhase !== 'IDLE' || pendingAction) return;
    const actor = players.find(p => p.id === activePlayerId);
    if (!actor) return;
    set(state => ({
      history: [`⚡ ${actor.name} завершает свой ход, сохраняя ${actor.actionTokens} ⚡ на проверки.`, ...state.history].slice(0, 50)
    }));
    get().endTurn();
  },

  // --------------------------------------------------------------------------
  // MAIN ACTION EXECUTION
  // --------------------------------------------------------------------------

  performAction: (actionData) => {
    const { players, activePlayerId, turnPhase, pendingAction: alreadyPending, openingToss } = get();

    /* Пока крутится жребий, стол ходов не принимает. Скрим оверлея ловит мышь
       у себя, но онлайн-клиент может прислать действие и мимо него. */
    if (openingToss) return;

    /*
     * Действие принадлежит тому, чей сейчас ход, — и никому больше.
     *
     * Раньше актор брался из `activePlayerId`, а `actionData.actorId`
     * игнорировался. Интерфейс держит выбор цели в собственном состоянии, и
     * оно переживало передачу хода: выбрав «Шантажиста» и нажав «Завершить
     * ход», игрок сохранял висящий прицел и мог ткнуть в жертву посреди
     * чужого хода. Действие не просто проходило — оно проходило ОТ ЛИЦА
     * того, чей был ход. В онлайне это ещё и чужой ход чужими руками, так
     * что проверка обязана жить здесь, а не только в интерфейсе.
     */
    if (actionData.actorId && actionData.actorId !== activePlayerId) return;

    /* И не посреди уже начатого: пока висит заявка или открыто окно реакции,
       новое действие начинать нечем. */
    if (turnPhase !== 'IDLE' || alreadyPending) return;

    timerManager.clearAll();
    const actor = players.find(p => p.id === activePlayerId);
    if (!actor) return;

    const withVaBanque = !!actionData.withVaBanque;
    const tokensRequired = 1;

    // Check action tokens
    if (actor.actionTokens < tokensRequired) {
      return;
    }

    if (actor.gold < actionData.costGold) {
      return;
    }

    /* Цель приходит от клиента как есть: `KinglierRoom` стампует только
       `actorId`. Без этой проверки самописный клиент бил бы Вором по пустой
       казне и Шантажистом сквозь «Стражу покоев». */
    if (actionData.roleClaim && actionData.targetId) {
      const victim = players.find(p => p.id === actionData.targetId);
      if (!victim || !canBeTargetedBy(victim, actionData.roleClaim)) {
        return;
      }
    }

    if ((actionData.name.includes('Пир') || actionData.name.includes('пир')) && actor.favor >= 5) {
      return; // Feast victory crown limit (cannot buy the 6th winning crown)
    }

    let actorHand = [...actor.hand];
    const newDiscard = [...get().discardPile];
    let stakedCardId = actionData.stakedCardId;

    if (withVaBanque) {
      const vbId = idOf(actorHand, 'Ва-банк');
      if (vbId) {
        const { taken, rest } = pluck(actorHand, vbId);
        actorHand = rest;
        if (taken) newDiscard.push(taken);
      }
    }

    // The stake must name a card the actor still holds — playing Ва-банк can
    // have just spent the very card that was picked.
    if (!byId(actorHand, stakedCardId)) {
      stakedCardId = actorHand[0]?.id;
    }

    const action: Action = {
      ...actionData,
      id: Math.random().toString(36).substring(7),
      costTokens: tokensRequired,
      stakedCardId,
      withVaBanque
    };

    // Deduct Action Tokens & Gold cost immediately
    set(state => ({
      players: state.players.map(p => p.id === actor.id ? {
        ...p,
        hand: actorHand,
        actionTokens: p.actionTokens - tokensRequired,
        gold: p.gold - action.costGold
      } : p),
      discardPile: newDiscard,
      turnSubPhase: 'CARD_PLAY_PHASE',
      hasUsedNormalActionThisTurn: action.type === 'normal' ? true : state.hasUsedNormalActionThisTurn,
      hasPlayedRoleThisTurn: action.type === 'role' ? true : state.hasPlayedRoleThisTurn,
      isVaBanqueActive: withVaBanque,
      isVetoed: false,
      overlayInstant: withVaBanque ? { card: 'Ва-банк', actorId: actor.id } : null,
      isPendingActionAfterTruthChallenge: false
    }));

    if (action.costGold > 0) {
      triggerResourceFloat(set, actor.id, `-${action.costGold} 🪙`, false);
    }
    triggerResourceFloat(set, actor.id, `-${tokensRequired} ⚡`, false);
    if (withVaBanque) {
      triggerResourceFloat(set, actor.id, '🎲 ВА-БАНК (x2)', true);
    }

    const roleName = action.roleClaim ? `«${action.roleClaim}»` : action.name;
    const target = action.targetId ? players.find(p => p.id === action.targetId) : null;
    const targetInfo = target ? ` на ${accOf(target)}` : '';
    const stakeNotice = action.roleClaim ? ' (карта на кону)' : '';
    const vbNotice = withVaBanque ? ' 🎲 [ВА-БАНК x2 при проверке!]' : '';

    const isCardExchange = action.type === 'normal' && action.name.includes('Сменить');
    const exchangesTwoCards = (action.stakedCardIds?.length ?? 1) >= 2;
    const speechText = isCardExchange
      ? `«Меняю карт${exchangesTwoCards ? 'ы' : 'у'}»`
      : action.type === 'normal'
        ? `«${action.name}»`
        : `«Заявляю: ${action.roleClaim}!${withVaBanque ? ' ВА-БАНК!' : ''}${target ? ` Цель: ${target.name}` : ''}»`;

    set(state => ({
      activeSpeechReactions: { [actor.id]: speechText },
      history: [`${actor.name} заявляет: ${roleName}${targetInfo}${stakeNotice}${vbNotice} (потрачено ${tokensRequired} ⚡).`, ...state.history].slice(0, 50)
    }));

    // 1. Normal actions execute after 1.5s
    if (action.type === 'normal') {
      set({ pendingAction: action, turnPhase: 'IDLE' });

      /*
       * Обмен карт начинается сразу, без общей паузы.
       *
       * Пауза перед действием нужна, чтобы двор успел прочесть заявку: «пир»,
       * «слух» — это строка, и без задержки её эффект случился бы раньше, чем
       * её заметили. Обмену читать нечего: его заявка — это и есть карты,
       * которые сейчас полетят. Пауза перед ними выглядела поломкой — карты
       * опускались обратно в руку, жетон списывался, и только через две
       * секунды что-то происходило.
       */
      if (isCardExchange) {
        get()._executeNormalAction(action);
        return;
      }

      timerManager.scheduleDelay(() => {
        get()._executeNormalAction(action);
      }, ACTION_HOLD_MS);
      return;
    }

    // 2. Targeted Attack Actions (Вор / Шантажист)
    const isTargetedAttack = (action.roleClaim === 'Вор' || action.roleClaim === 'Шантажист') && !!action.targetId;
    if (isTargetedAttack) {
      set({
        pendingAction: action,
        turnPhase: 'TARGET_REACTION_WINDOW',
        timerSeconds: 0,
        timerMaxSeconds: 0
      });
      return;
    }

    // 3. Non-targeted Role Actions trigger court DOUBT_WINDOW
    set({
      pendingAction: action,
      turnPhase: 'DOUBT_WINDOW',
      pendingDoubtPassedIds: [],
      pendingDoubtActionId: action.id,
      timerSeconds: 0,
      timerMaxSeconds: 0
    });
  },

  // --------------------------------------------------------------------------
  // PLOTS & INSTANTS
  // --------------------------------------------------------------------------

  playPlotAction: (plotType, cardId, targetPlayerId) => {
    playPlotAction(get, set, plotType, cardId, targetPlayerId);
  },

  playInstant: (playerId, instantType, cardId, targetPlayerId) => {
    playInstant(get, set, playerId, instantType, cardId, targetPlayerId);
  },

  openConspiracyDialog: (isImmediateReaction = false) => {
    openConspiracyDialog(get, set, isImmediateReaction);
  },

  closeConspiracyDialog: () => {
    closeConspiracyDialog(set);
  },

  activateConspiracy: (playerId, targetPlayerId, effect, isFreeReaction = false) => {
    activateConspiracy(get, set, playerId, targetPlayerId, effect, isFreeReaction);
  },

  // --------------------------------------------------------------------------
  // TARGETED ATTACKS & DUELS
  // --------------------------------------------------------------------------

  targetAcceptAttack: (targetId: string) => {
    timerManager.clearAll();
    const { pendingAction, turnPhase, players } = get();
    if (turnPhase !== 'TARGET_REACTION_WINDOW' || !pendingAction || pendingAction.targetId !== targetId) return;

    const actor = players.find(p => p.id === pendingAction.actorId);
    const target = players.find(p => p.id === targetId);
    if (!actor || !target) return;

    set(state => ({
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [target.id]: '«Принимаю нападение...»'
      },
      history: [`🏳️ ${target.name} принимает нападение ${actor.name} без боя.`, ...state.history].slice(0, 50)
    }));

    // After target accepts, court gets a chance to doubt in DOUBT_WINDOW
    set({
      turnPhase: 'DOUBT_WINDOW',
      pendingDoubtPassedIds: [],
      pendingDoubtActionId: pendingAction.id,
      timerSeconds: 0,
      timerMaxSeconds: 0
    });
  },

  targetDoubtAttack: (targetId: string) => {
    timerManager.clearAll();
    const { pendingAction, turnPhase } = get();
    if (turnPhase !== 'TARGET_REACTION_WINDOW' || !pendingAction || pendingAction.targetId !== targetId) return;
    get().doubtAction(targetId);
  },

  targetDeclareDuel: (targetId, cardId) => {
    targetDeclareDuel(get, set, targetId, cardId);
  },

  attackerRetreatDuel: (attackerId) => {
    attackerRetreatDuel(get, set, attackerId);
  },

  attackerAcceptDuel: (attackerId) => {
    attackerAcceptDuel(get, set, attackerId);
  },

  closeDuelOutcome: () => {
    closeDuelOutcome(get, set);
  },

  // --------------------------------------------------------------------------
  // DOUBT & REVEAL CHALLENGES
  // --------------------------------------------------------------------------

  doubtAction: (doubterId) => {
    /* Проверка закрывает окно для всех — остальным отвечать больше не на что. */
    clearBotTimers('doubt');
    doubtAction(get, set, doubterId);
  },

  passDoubt: (playerId) => {
    /* Здесь ничего не гасится намеренно: «Верю» — ответ за себя, а не за стол.
       Снимать чужие таймеры значило бы лишать остальных права ответить. */
    passDoubt(get, set, playerId);
  },

  _executeRevealOutcome: (doubterId) => {
    executeRevealOutcome(get, set, doubterId);
  },

  closeRevealOutcome: () => {
    closeRevealOutcome(get, set);
  },

  closeInformantPeek: () => {
    set({ informantPeekData: null, turnPhase: 'IDLE' });
  },

  _proceedAfterDoubtPassed: (action) => {
    proceedAfterDoubtPassed(get, set, action);
  },

  _triggerVetoWindowOrResolveEffect: (action, isAfterTruthChallenge = false) => {
    triggerVetoWindowOrResolveEffect(get, set, action, isAfterTruthChallenge);
  },

  _resolvePendingActionEffect: (action, isAfterTruthChallenge = false) => {
    resolvePendingActionEffect(get, set, action, isAfterTruthChallenge);
  },

  proceedAfterVetoWindow: () => {
    proceedAfterVetoWindow(get, set);
  },

  // --------------------------------------------------------------------------
  // ACTION & ROLE RESOLUTIONS
  // --------------------------------------------------------------------------

  _executeNormalAction: (action) => {
    executeNormalAction(get, set, action);
  },

  _resolveRoleActionEffect: (action, isAfterTruthChallenge = false) => {
    resolveRoleActionEffect(get, set, action, isAfterTruthChallenge);
  },

  // --------------------------------------------------------------------------
  // TURN & ROUND PROGRESSION
  // --------------------------------------------------------------------------

  _checkEndgameAndAdvanceTurn: () => {
    checkEndgameAndAdvanceTurn(get, set);
  },

  endTurn: () => {
    endTurn(get, set);
  }
}));
