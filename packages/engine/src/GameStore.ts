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
  HAND_SIZE,
  TOTAL_DECK_SIZE
} from './cards';
import { botMemory, clearBotTimers } from './Bot';
import { ALL_BOT_CANDIDATES, getBotArchetype, type BotCandidate } from './botsConfig';
import { accOf, shuffleArray } from './utils/russianText';
import { timerManager } from './utils/timerManager';
import {
  ACTION_HOLD_MS,
  DEAL_STEP_MS,
  FANFARE_MS,
  OPENING_HOLD_MS,
  TOSS_SPIN_MS,
  TOSS_VERDICT_MS
} from './timing';
import { triggerResourceFloat } from './utils/visualEffects';

// Domain Resolvers
import { addSealsToPlayer } from './resolvers/sealsResolver';
import { DEFAULT_RULES, normalizeRules } from './rules';
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
  closeDuelOutcome
} from './resolvers/duelResolver';
import {
  courtAnswered,
  doubtAction,
  passDoubt,
  passVeto,
  executeRevealOutcome,
  closeRevealOutcome,
  proceedAfterDoubtPassed,
  triggerVetoWindowOrResolveEffect,
  proceedAfterVetoWindow,
  resolvePendingActionEffect
} from './resolvers/doubtResolver';
import { playInstant } from './resolvers/instantResolver';
import { checkEndgameAndAdvanceTurn, endTurn } from './resolvers/turnResolver';
import { vetoReset } from './resolvers/vetoChain';

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
let openingTimer: ReturnType<typeof setTimeout> | null = null;

/** Опознание открытия: растёт на каждую партию. См. `OpeningData.id`. */
let openingSeq = 0;


export const useGameStore = create<GameState>((set, get) => ({
  // State Properties
  rules: DEFAULT_RULES,
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
  opening: null,
  pendingAction: null,
  pendingDoubtDoubterId: null,
  pendingDoubtPassedIds: [],
  pendingDoubtActionId: null,
  pendingVetoPassedIds: [],
  pendingVetoActionId: null,

  isVaBanqueActive: false,
  ...vetoReset(),
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

  startGame: (seats, rulesInput) => {
    timerManager.clearAll();
    if (openingTimer !== null) {
      clearTimeout(openingTimer);
      openingTimer = null;
    }
    botMemory.clear();
    /* Правила нормализуются здесь, а не у вызывающего: и оффлайн-экран, и
       сервер, и тесты попадают в движок через эту дверь, и всем им должно
       достаться одно и то же валидное состояние. */
    const rules = normalizeRules({ ...DEFAULT_RULES, ...rulesInput });
    const deck = createInitialDeck(rules.deck);

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
        actionTokens: rules.actionTokens,
        /* Руки пустые: карты раздаются по одной на стадии `DEAL`, уже при
           открытом столе. Раздать их здесь значит показать игроку готовую
           руку — раздачи как события не будет. */
        hand: [],
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
        actionTokens: rules.actionTokens,
        hand: [],
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
      rules,
      players,
      deck,
      discardPile: [],
      activePlayerId: firstPlayer.id,
      /* Открытие начинается со сбора двора: ни монетки, ни карт ещё нет.
         `winnerId` уже известен, но до жребия его никто не показывает. */
      opening: {
        stage: 'READY',
        id: ++openingSeq,
        winnerId: firstPlayer.id,
        readyIds: [],
        holdUntil: null,
        landsAt: null
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
      pendingVetoPassedIds: [],
      pendingVetoActionId: null,
      overlayInstant: null,
      isVaBanqueActive: false,
      ...vetoReset(),
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
      /* Жребий в летопись попадёт, когда монетка ляжет: писать его здесь
         значит объявить победителя до броска. */
      history: [
        `👑 Новая партия! В колоде ${TOTAL_DECK_SIZE} карт (роли, интриги, инстанты). У каждого по 2 🪙 и 2 ⚡ жетона действия.`
      ]
    });
  },

  /**
   * «Готов» на экране сбора двора.
   *
   * Двор собирается готовностью, а не таймером: жребий бросается, когда партию
   * начал каждый за столом. Боты отмечаются сами и вразнобой — см.
   * `botEngine`; здесь между ними и людьми разницы нет, иначе кружки ботов
   * пришлось бы зажигать отдельным механизмом мимо состояния.
   */
  markReady: (playerId: string) => {
    const { opening, players } = get();
    if (!opening || opening.stage !== 'READY') return;
    if (opening.readyIds.includes(playerId)) return;
    if (!players.some(p => p.id === playerId)) return;

    set({ opening: { ...opening, readyIds: [...opening.readyIds, playerId] } });
    get()._advanceOpening();
  },

  _advanceOpening: () => {
    const { opening, players, deck } = get();
    if (!opening) return;
    if (openingTimer !== null) {
      clearTimeout(openingTimer);
      openingTimer = null;
    }

    /** Следующий шаг той же последовательности — через `delay`. */
    const next = (delay: number) => {
      openingTimer = setTimeout(() => {
        openingTimer = null;
        get()._advanceOpening();
      }, delay);
    };

    /** Стадия доиграна: держим паузу, следующий шаг разберётся дальше. */
    const hold = () => {
      set({ opening: { ...opening, holdUntil: Date.now() + OPENING_HOLD_MS } });
      next(OPENING_HOLD_MS);
    };

    switch (opening.stage) {
      case 'READY': {
        /* Жребий ждёт весь стол: пока хоть кто-то не отметился, монетка не
           взлетает. Отсюда и порядок — сперва готовность, потом бросок. */
        if (players.some(p => !opening.readyIds.includes(p.id))) return;

        /* Собрались — но не в тот же кадр: игрок ещё смотрит на список,
           проверяя, что отметились все, а монетка уже летела бы. */
        if (opening.holdUntil === null) return hold();

        const winner = players.find(p => p.id === opening.winnerId);
        set(state => ({
          opening: {
            ...opening,
            stage: 'TOSS',
            holdUntil: null,
            landsAt: Date.now() + TOSS_SPIN_MS
          },
          history: [
            `🪙 Жребий брошен: первым ходит ${winner?.name ?? 'первый игрок'}.`,
            ...state.history
          ].slice(0, 50)
        }));
        /* Полёт плюс пауза на прочтение имени — и только потом стол. */
        next(TOSS_SPIN_MS + TOSS_VERDICT_MS);
        return;
      }

      case 'TOSS': {
        /* Экран жребия снимается, стол открывается пустым — и тут же начинает
           раздаваться. Паузу на прочтение имени уже отстоял `TOSS_VERDICT_MS`
           выше, второй здесь не нужно. */
        set({ opening: { ...opening, stage: 'DEAL' } });
        next(DEAL_STEP_MS);
        return;
      }

      case 'DEAL': {
        const dealt = players.reduce((n, p) => n + p.hand.length, 0);
        const total = players.length * HAND_SIZE;

        if (dealt < total && deck.length > 0) {
          /* По одной карте по кругу, начиная с того, кому выпал жребий: круг
             тот же, что и порядок хода (см. перемешивание в `startGame`), так
             что раздача читается как первый обход стола. */
          const first = Math.max(0, players.findIndex(p => p.id === opening.winnerId));
          const idx = (first + (dealt % players.length)) % players.length;
          const card = deck[deck.length - 1];

          set(state => ({
            deck: state.deck.slice(0, -1),
            players: state.players.map((p, i) =>
              i === idx ? { ...p, hand: [...p.hand, card] } : p
            )
          }));
          next(DEAL_STEP_MS);
          return;
        }

        /* Роздано. Пауза — чтобы успеть посмотреть на свою руку, прежде чем
           поверх неё встанет объявление. */
        if (opening.holdUntil === null) return hold();

        set({ opening: { ...opening, stage: 'FANFARE', holdUntil: null } });
        next(FANFARE_MS);
        return;
      }

      case 'FANFARE': {
        /* Объявление отстояло своё — и уходит раньше, чем начнётся ход: между
           «партия началась» и первым действием должен быть вдох. */
        if (opening.holdUntil === null) return hold();

        /* Стол оживает. С этого кадра `opening` пуст, и движок принимает ходы. */
        set({ opening: null });
        return;
      }
    }
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
    const { players, activePlayerId, turnPhase, pendingAction: alreadyPending, opening } = get();

    /* Пока крутится жребий, стол ходов не принимает. Скрим оверлея ловит мышь
       у себя, но онлайн-клиент может прислать действие и мимо него. */
    if (opening) return;

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

    const rules = get().rules;
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

    /* Пиром нельзя купить победную корону: кап на единицу ниже порога. */
    if ((actionData.name.includes('Пир') || actionData.name.includes('пир')) && actor.favor >= rules.crownsToWin - 1) {
      return;
    }

    /* Заявление «Шантажиста» стоит золота, если правила так велят. Плата
       берётся здесь, при заявлении, — значит она уходит и при блефе, и при
       вето, и при проигранной дуэли. Это и есть смысл настройки: заявка
       Шантажиста должна стоить денег сама по себе, а не только успешная. */
    if (actionData.roleClaim === 'Шантажист' && actor.gold < rules.blackmailCost) {
      return;
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
      costGold: actionData.costGold + (actionData.roleClaim === 'Шантажист' ? rules.blackmailCost : 0),
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
      ...vetoReset(),
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

    /*
     * «Верю» жертвы — это её ответ в опросе двора, а не отдельная фаза перед
     * ним.
     *
     * Раньше жертва отвечала дважды: сперва «принять / дуэль», потом заново
     * «верю / не верю» вместе со всеми. Второй вопрос не добавлял решения —
     * приняв нападение, она уже сказала, что спорить не будет, — но отбирал
     * ещё один клик и делал пайплайн двухфазным. Поэтому она сразу попадает в
     * список ответивших, и окно открывается уже для остальных.
     */
    const passedIds = [targetId];
    set(state => ({
      turnPhase: 'DOUBT_WINDOW',
      pendingDoubtPassedIds: passedIds,
      pendingDoubtActionId: pendingAction.id,
      timerSeconds: 0,
      timerMaxSeconds: 0,
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [target.id]: '«Верю»'
      },
      history: [`🤝 ${target.name} верит заявке ${actor.name} и нападение не оспаривает.`, ...state.history].slice(0, 50)
    }));

    /* Спрашивать больше некого — например, за столом двое: тогда опрос двора
       закончился, не начавшись. */
    if (courtAnswered(players, actor.id, passedIds)) {
      get()._proceedAfterDoubtPassed(pendingAction);
    }
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

  passVeto: (playerId) => {
    /* Как и «Верю»: ответ за себя. Чужие таймеры не гасятся — остальные ещё
       вправе положить вето. */
    passVeto(get, set, playerId);
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
