import { create } from 'zustand';
import type {
  GameState,
  Player,
  Action,
  GameCard
} from './types';
import {
  createInitialDeck,
  drawCardsFromDeck,
  TOTAL_DECK_SIZE
} from './cards';
import { botMemory, clearBotTimer } from './Bot';
import { ALL_BOT_CANDIDATES, BOT_ARCHETYPES, getBotArchetype, type BotCandidate } from './botsConfig';
import { declineAcc, shuffleArray } from './utils/russianText';
import { timerManager } from './utils/timerManager';
import { ACTION_HOLD_MS } from './timing';
import { triggerResourceFloat } from './utils/visualEffects';

// Domain Resolvers
import { addSealsToPlayer } from './resolvers/sealsResolver';
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

export { ALL_BOT_CANDIDATES, BOT_ARCHETYPES, getBotArchetype };
export type { BotCandidate };

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
  pendingAction: null,
  pendingDoubtDoubterId: null,

  isVaBanqueActive: false,
  isVetoed: false,
  isPendingActionAfterTruthChallenge: false,

  pendingDuelDefenderCardIndex: null,
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
  cardFlightEvent: null,
  hasCardDeparted: false,
  overlayInstant: null,

  winnerId: null,
  history: [],

  // --------------------------------------------------------------------------
  // GAME LIFECYCLE
  // --------------------------------------------------------------------------

  startGame: (seats) => {
    timerManager.clearAll();
    botMemory.clear();
    const deck = createInitialDeck(); // 44 unified cards

    const humanSeats = seats && seats.length > 0
      ? seats.slice(0, 4)
      : [{ id: 'p1', name: 'Вы', avatar: '/avatars/anton.webp' }];

    const botsNeeded = 4 - humanSeats.length;
    const selectedBots = shuffleArray([...ALL_BOT_CANDIDATES]).slice(0, botsNeeded);

    const players: Player[] = [
      ...humanSeats.map((seat, idx) => ({
        id: seat.id,
        name: seat.name,
        avatar: seat.avatar ?? '/avatars/anton.webp',
        seatNumber: idx + 1,
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
        seatNumber: humanSeats.length + idx + 1,
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

    set({
      players,
      deck,
      discardPile: [],
      activePlayerId: players[0].id,
      turnPhase: 'IDLE',
      turnSubPhase: 'NORMAL_ACTION_PHASE',
      hasUsedNormalActionThisTurn: false,
      hasPlayedRoleThisTurn: false,
      hasPlayedPlotThisTurn: false,
      coronationCandidateId: null,
      coronationOriginId: null,
      pendingAction: null,
      overlayInstant: null,
      isVaBanqueActive: false,
      isVetoed: false,
      isPendingActionAfterTruthChallenge: false,
      pendingDuelDefenderCardIndex: null,
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
      history: [`👑 Новая партия началась! В колоде ${TOTAL_DECK_SIZE} карт (роли, интриги, инстанты). У каждого по 2 🪙, 2 карты и 2 ⚡ жетона действия.`]
    });
  },

  restartGame: () => {
    get().startGame();
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

  _drawCardForPlayerWithInformantCheck: (_playerIndex: number): GameCard => {
    const { deck, discardPile } = get();
    const { drawn, deck: newDeck, discardPile: newDiscardPile } = drawCardsFromDeck(1, deck, discardPile);
    const newCard = drawn[0] || 'Наследник';
    set({ deck: newDeck, discardPile: newDiscardPile });
    return newCard;
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
    timerManager.clearAll();
    const { players, activePlayerId } = get();
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

    if ((actionData.name.includes('Пир') || actionData.name.includes('пир')) && actor.favor >= 5) {
      return; // Feast victory crown limit (cannot buy the 6th winning crown)
    }

    let actorHand = [...actor.hand];
    let newDiscard = [...get().discardPile];
    let stakedCardIndex = actionData.stakedCardIndex !== undefined
      ? actionData.stakedCardIndex
      : 0;

    if (withVaBanque) {
      const vbIdx = actorHand.indexOf('Ва-банк');
      if (vbIdx !== -1) {
        actorHand.splice(vbIdx, 1);
        newDiscard.push('Ва-банк');
        stakedCardIndex = 0;
      }
    }

    const action: Action = {
      ...actionData,
      id: Math.random().toString(36).substring(7),
      costTokens: tokensRequired,
      stakedCardIndex,
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
    const targetInfo = target ? ` на ${declineAcc(target.name)}` : '';
    const stakeNotice = action.roleClaim ? ' (карта на кону)' : '';
    const vbNotice = withVaBanque ? ' 🎲 [ВА-БАНК x2 при проверке!]' : '';

    const isCardExchange = action.type === 'normal' && action.name.includes('Сменить');
    const exchangesTwoCards = (action.stakedCardIndices?.length ?? 1) >= 2;
    const speechText = isCardExchange
      ? `«Меняю карт${exchangesTwoCards ? 'ы' : 'у'}»`
      : action.type === 'normal'
        ? `«${action.name}»`
        : `«Заявляю: ${action.roleClaim}!${withVaBanque ? ' ВА-БАНК!' : ''}${target ? ` Цель: ${target.name}` : ''}»`;

    set(state => ({
      hasCardDeparted: false,
      activeSpeechReactions: { [actor.id]: speechText },
      history: [`${actor.name} заявляет: ${roleName}${targetInfo}${stakeNotice}${vbNotice} (потрачено ${tokensRequired} ⚡).`, ...state.history].slice(0, 50)
    }));

    // 1. Normal actions execute after 1.5s
    if (action.type === 'normal') {
      set({ pendingAction: action, turnPhase: 'IDLE' });
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
      timerSeconds: 0,
      timerMaxSeconds: 0
    });
  },

  // --------------------------------------------------------------------------
  // PLOTS & INSTANTS
  // --------------------------------------------------------------------------

  playPlotAction: (plotType, cardIndex, targetPlayerId) => {
    playPlotAction(get, set, plotType, cardIndex, targetPlayerId);
  },

  playInstant: (playerId, instantType, cardIndex, targetPlayerId) => {
    playInstant(get, set, playerId, instantType, cardIndex, targetPlayerId);
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

  targetDeclareDuel: (targetId, stakedCardIndex = 0) => {
    targetDeclareDuel(get, set, targetId, stakedCardIndex);
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
    clearBotTimer('doubt');
    doubtAction(get, set, doubterId);
  },

  passDoubt: (playerId) => {
    clearBotTimer('doubt');
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
