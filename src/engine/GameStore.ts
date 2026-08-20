import { create } from 'zustand';
import type { 
  GameState, 
  Player, 
  Action, 
  GameCard, 
  Role,
  PlotType,
  InstantType,
  RevealOutcome, 
  DuelOutcome, 
  DuelResultType,
  BotArchetype
} from './types';
import { 
  createInitialDeck, 
  drawCardsFromDeck, 
  isRole
} from './cards';
import { botMemory, evaluateBotDoubt } from './Bot';

// Russian grammatical inflection helpers
function declineAcc(name: string): string {
  if (name.endsWith('а')) return name.slice(0, -1) + 'у';
  if (name.endsWith('я')) return name.slice(0, -1) + 'ю';
  if (name.endsWith('й')) return name.slice(0, -1) + 'я';
  if (name.endsWith('ь')) return name.slice(0, -1) + 'я';
  if (!name.endsWith('о') && !name.endsWith('е') && !name.endsWith('и')) return name + 'а';
  return name;
}

function declineGen(name: string): string {
  if (name.endsWith('а')) return name.slice(0, -1) + 'ы';
  if (name.endsWith('я')) return name.slice(0, -1) + 'и';
  if (name.endsWith('й')) return name.slice(0, -1) + 'я';
  if (name.endsWith('ь')) return name.slice(0, -1) + 'я';
  if (!name.endsWith('о') && !name.endsWith('е') && !name.endsWith('и')) return name + 'а';
  return name;
}

function verbDoubted(name: string): string {
  if (name === 'Елена' || name === 'Анна' || name.endsWith('а') || name.endsWith('я')) {
    return 'усомнилась';
  }
  return 'усомнился';
}

function verbCaught(name: string): string {
  if (name === 'Елена' || name === 'Анна' || name.endsWith('а') || name.endsWith('я')) {
    return 'поймала';
  }
  return 'поймал';
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface BotCandidate {
  name: string;
  avatar: string;
  archetype: BotArchetype;
}

export const ALL_BOT_CANDIDATES: BotCandidate[] = [
  {
    name: 'Барон Дима',
    avatar: '🧔',
    archetype: {
      type: 'gambler',
      title: 'Азартный игрок',
      badge: '🎲',
      description: 'Часто рискует и блефует. Удваивает ставки.',
      bluffRate: 0.52,
      doubtAggression: 1.15,
      blockBluffRate: 0.50,
      greed: 0.7,
      targetAggression: 0.75
    }
  },
  {
    name: 'Графиня Елена',
    avatar: '👩‍🦰',
    archetype: {
      type: 'cautious',
      title: 'Осторожный стратег',
      badge: '🛡️',
      description: 'Редко блефует. Проверяет только при высокой уверенности.',
      bluffRate: 0.15,
      doubtAggression: 0.70,
      blockBluffRate: 0.20,
      greed: 0.3,
      targetAggression: 0.4
    }
  },
  {
    name: 'Герцог Виктор',
    avatar: '👨‍🦳',
    archetype: {
      type: 'pragmatic',
      title: 'Прагматик',
      badge: '⚖️',
      description: 'Атакует только лидеров. Оценивает шансы математически.',
      bluffRate: 0.30,
      doubtAggression: 1.00,
      blockBluffRate: 0.35,
      greed: 0.5,
      targetAggression: 0.9
    }
  },
  {
    name: 'Маркиз Вадим',
    avatar: '👱‍♂️',
    archetype: {
      type: 'provocateur',
      title: 'Провокатор',
      badge: '🎭',
      description: 'Ставит ловушки Шутом, плетет Интриги и провоцирует соперников.',
      bluffRate: 0.48,
      doubtAggression: 1.20,
      blockBluffRate: 0.50,
      greed: 0.65,
      targetAggression: 0.8
    }
  },
  {
    name: 'Княгиня Анна',
    avatar: '👸',
    archetype: {
      type: 'opportunist',
      title: 'Оппортунист',
      badge: '🗡️',
      description: 'Крадет ресурсы в самый уязвимый момент.',
      bluffRate: 0.38,
      doubtAggression: 1.05,
      blockBluffRate: 0.40,
      greed: 0.9,
      targetAggression: 0.85
    }
  }
];

export const BOT_ARCHETYPES: Record<string, BotArchetype> = {
  b1: ALL_BOT_CANDIDATES[0].archetype,
  b2: ALL_BOT_CANDIDATES[1].archetype,
  b3: ALL_BOT_CANDIDATES[2].archetype,
  b4: ALL_BOT_CANDIDATES[3].archetype,
  b5: ALL_BOT_CANDIDATES[4].archetype
};

let gameTimerInterval: number | null = null;
let delayTimeout: number | null = null;

function clearAllTimers() {
  if (gameTimerInterval !== null) {
    clearInterval(gameTimerInterval);
    gameTimerInterval = null;
  }
  if (delayTimeout !== null) {
    clearTimeout(delayTimeout);
    delayTimeout = null;
  }
}

function triggerResourceFloat(set: any, playerId: string, text: string, isGain: boolean) {
  const id = Math.random().toString(36).substring(7);
  set((state: GameState) => ({
    floatingResourceEvents: [...state.floatingResourceEvents, { id, playerId, text, isGain }]
  }));
  window.setTimeout(() => {
    set((state: GameState) => ({
      floatingResourceEvents: state.floatingResourceEvents.filter(e => e.id !== id)
    }));
  }, 2400);
}

function triggerSingleCardFlight(
  set: any, 
  flightType: 'to_discard' | 'to_hand' | 'to_plot', 
  actorId?: string, 
  roleClaim?: Role, 
  revealedRole?: GameCard, 
  wasTruth?: boolean
) {
  const id = Math.random().toString(36).substring(7);
  set({
    hasCardDeparted: true,
    cardFlightEvent: {
      id,
      isDuel: false,
      flightType,
      actorId,
      roleClaim,
      revealedRole,
      wasTruth
    }
  });

  window.setTimeout(() => {
    set({
      cardFlightEvent: null
    });
  }, 850);
}

function triggerDuelCardFlight(
  set: any,
  attackerFlight: 'to_discard' | 'to_hand',
  attackerId: string,
  defenderFlight: 'to_discard' | 'to_hand',
  defenderId: string,
  attackerRevealedRole?: GameCard,
  attackerWasTruth?: boolean,
  defenderRevealedRole?: GameCard,
  defenderWasTruth?: boolean
) {
  const id = Math.random().toString(36).substring(7);
  set({
    hasCardDeparted: true,
    cardFlightEvent: {
      id,
      isDuel: true,
      attackerFlight,
      attackerId,
      attackerRevealedRole,
      attackerWasTruth,
      defenderFlight,
      defenderId,
      defenderRevealedRole,
      defenderWasTruth
    }
  });

  window.setTimeout(() => {
    set({
      cardFlightEvent: null
    });
  }, 850);
}

export const useGameStore = create<GameState>((set, get) => ({
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
  pendingAction: null,
  pendingDoubtDoubterId: null,
  
  isVaBanqueActive: false,
  isVetoed: false,
  
  pendingDuelDefenderCardIndex: null,
  pendingDuelDefenderRoleClaim: null,
  duelOutcome: null,
  
  timerSeconds: 0,
  timerMaxSeconds: 14,
  
  revealOutcome: null,
  spyPeekData: null,
  informantPeekData: null,
  
  activeSpeechReactions: {},
  floatingResourceEvents: [],
  cardFlightEvent: null,
  hasCardDeparted: false,
  
  winnerId: null,
  history: [],

  startGame: () => {
    clearAllTimers();
    botMemory.clear();
    const deck = createInitialDeck(); // 36 unified cards
    
    // Draw 2 cards for human player
    const c1 = deck.pop()!;
    const c2 = deck.pop()!;

    // Pick 3 random distinct bots from the candidate pool
    const selectedBots = shuffle([...ALL_BOT_CANDIDATES]).slice(0, 3);

    // 4 Players: 1 Human + 3 Bots (2 Gold, 0 Favor, 0 Seals, 2 Action Tokens)
    const players: Player[] = [
      { 
        id: 'p1', 
        name: 'Вы', 
        avatar: '👑', 
        seatNumber: 1, 
        isBot: false, 
        gold: 2, 
        favor: 0, 
        seals: 0,
        actionTokens: 2,
        hand: [c1, c2],
        activePlot: null
      },
      ...selectedBots.map((b, idx) => ({
        id: `b${idx + 1}`,
        name: b.name,
        avatar: b.avatar,
        seatNumber: idx + 2,
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
      activePlayerId: 'p1',
      turnPhase: 'IDLE',
      turnSubPhase: 'NORMAL_ACTION_PHASE',
      hasUsedNormalActionThisTurn: false,
      hasPlayedRoleThisTurn: false,
      hasPlayedPlotThisTurn: false,
      coronationCandidateId: null,
      pendingAction: null,
      isVaBanqueActive: false,
      isVetoed: false,
      pendingDuelDefenderCardIndex: null,
      pendingDuelDefenderRoleClaim: null,
      duelOutcome: null,
      timerSeconds: 0,
      timerMaxSeconds: 14,
      revealOutcome: null,
      spyPeekData: null,
      informantPeekData: null,
      activeSpeechReactions: {},
      floatingResourceEvents: [],
      winnerId: null,
      history: ['👑 Новая партия началась! В колоде 36 карт (роли, интриги, инстанты). У каждого по 2 💰, 2 карты и 2 ⚡ жетона действия.']
    });
  },

  restartGame: () => {
    get().startGame();
  },

  addSealsToPlayer: (playerId: string, count: number) => {
    if (count <= 0) return;
    const { players, coronationCandidateId } = get();
    const pIdx = players.findIndex(p => p.id === playerId);
    if (pIdx === -1) return;

    const player = players[pIdx];
    if (player.favor >= 6) return;

    const totalSeals = player.seals + count;
    const gainedCrowns = Math.floor(totalSeals / 2);
    const newFavor = player.favor + gainedCrowns;
    const remainderSeals = newFavor >= 6 ? 0 : (totalSeals % 2);

    const updatedPlayer: Player = {
      ...player,
      seals: remainderSeals,
      favor: Math.min(6, newFavor)
    };

    const newPlayers = [...players];
    newPlayers[pIdx] = updatedPlayer;

    triggerResourceFloat(set, playerId, `+${count} ⚜️`, true);
    if (gainedCrowns > 0) {
      window.setTimeout(() => {
        triggerResourceFloat(set, playerId, `+${gainedCrowns} 👑`, true);
      }, 400);
    }

    const conversionNotice = gainedCrowns > 0
      ? ` ⚜️ 2 печати трансформировались в +${gainedCrowns} 👑 для ${player.name}!`
      : '';

    set(state => ({
      players: newPlayers,
      history: [`⚜️ ${player.name} получает +${count} ⚜️ Королевскую печать.${conversionNotice}`, ...state.history].slice(0, 50)
    }));

    if (updatedPlayer.favor >= 6 && !coronationCandidateId) {
      set(state => ({
        coronationCandidateId: updatedPlayer.id,
        history: [`👑 КРУГ КОРОНАЦИИ! ${updatedPlayer.name} набрал 6 👑 через печати! Если никто не собьёт его короны за круг, он станет Королём!`, ...state.history].slice(0, 50)
      }));
    }
  },

  _disruptPlayerPlotsOnLoss: (victimId: string, reason: string) => {
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
  },

  _drawCardForPlayerWithInformantCheck: (_playerIndex: number): GameCard => {
    const { deck, discardPile } = get();
    const { drawn, deck: newDeck, discardPile: newDiscardPile } = drawCardsFromDeck(1, deck, discardPile);
    const newCard = drawn[0] || 'Наследник';

    set({ deck: newDeck, discardPile: newDiscardPile });
    return newCard;
  },

  skipNormalActionPhase: () => {
    const { turnPhase, turnSubPhase } = get();
    if (turnPhase !== 'IDLE' || turnSubPhase !== 'NORMAL_ACTION_PHASE') return;
    set({
      turnSubPhase: 'CARD_PLAY_PHASE'
    });
  },

  endTurnManually: () => {
    const { turnPhase, activePlayerId, players } = get();
    if (turnPhase !== 'IDLE') return;
    const actor = players.find(p => p.id === activePlayerId);
    if (!actor) return;
    set(state => ({
      history: [`⚡ ${actor.name} завершает свой ход, сохраняя ${actor.actionTokens} ⚡ на проверки.`, ...state.history].slice(0, 50)
    }));
    get().endTurn();
  },

  // --------------------------------------------------------------------------
  // ACTION EXECUTION WITH ACTION TOKENS & 3-PHASE STRUCTURE
  // --------------------------------------------------------------------------

  performAction: (actionData) => {
    clearAllTimers();
    const { players, activePlayerId } = get();
    const actor = players.find(p => p.id === activePlayerId);
    if (!actor) return;

    const withVaBanque = !!actionData.withVaBanque;
    const tokensRequired = 1;

    // Check action tokens
    if (actor.actionTokens < tokensRequired) {
      return; // No tokens left
    }

    if (actor.gold < actionData.costGold) {
      return; // Cannot afford gold cost
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
      isVetoed: false
    }));

    if (action.costGold > 0) {
      triggerResourceFloat(set, actor.id, `-${action.costGold} 💰`, false);
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
    
    const speechText = action.type === 'normal' 
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
      delayTimeout = window.setTimeout(() => {
        get()._executeNormalAction(action);
      }, 1500);
      return;
    }

    // 2. Targeted Attack Actions (Вор / Шантажист)
    const isTargetedAttack = (action.roleClaim === 'Вор' || action.roleClaim === 'Шантажист') && !!action.targetId;
    if (isTargetedAttack) {
      const maxSec = 14;
      set({ 
        pendingAction: action, 
        turnPhase: 'TARGET_REACTION_WINDOW',
        timerSeconds: maxSec,
        timerMaxSeconds: maxSec
      });

      gameTimerInterval = window.setInterval(() => {
        const cur = get().timerSeconds;
        if (cur <= 1) {
          clearAllTimers();
          if (get().turnPhase === 'TARGET_REACTION_WINDOW') {
            get().targetAcceptAttack(action.targetId!);
          }
        } else {
          set({ timerSeconds: cur - 1 });
        }
      }, 1000);
      return;
    }

    // 3. Non-targeted Role Actions trigger court DOUBT_WINDOW
    const maxSec = 14;
    set({ 
      pendingAction: action, 
      turnPhase: 'DOUBT_WINDOW',
      timerSeconds: maxSec,
      timerMaxSeconds: maxSec
    });

    gameTimerInterval = window.setInterval(() => {
      const cur = get().timerSeconds;
      if (cur <= 1) {
        clearAllTimers();
        if (get().turnPhase === 'DOUBT_WINDOW') {
          get()._proceedAfterDoubtPassed(action);
        }
      } else {
        set({ timerSeconds: cur - 1 });
      }
    }, 1000);
  },

  playPlotAction: (plotType: PlotType, cardIndex: number, targetPlayerId?: string) => {
    clearAllTimers();
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
      charges: plotType === 'Сеть информаторов' ? 2 : undefined
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

    delayTimeout = window.setTimeout(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 1500);
  },

  playInstant: (playerId: string, instantType: InstantType, cardIndex: number, targetPlayerId?: string) => {
    const { players, pendingAction, discardPile, activePlayerId } = get();
    const actor = players.find(p => p.id === playerId);
    if (!actor || actor.actionTokens < 1) return;

    const card = actor.hand[cardIndex];
    if (card !== instantType) return;

    // Remove instant from hand to discard (deferred draw at end of turn)
    const newHand = [...actor.hand];
    newHand.splice(cardIndex, 1);
    const updatedDiscard = [...discardPile, instantType];

    const updatedPlayers = players.map(p => p.id === actor.id ? { 
      ...p, 
      actionTokens: p.actionTokens - 1,
      hand: newHand 
    } : p);
    triggerResourceFloat(set, actor.id, '-1 ⚡', false);

    const isOwnTurn = actor.id === activePlayerId;

    if (instantType === 'Ва-банк') {
      set(state => ({
        players: updatedPlayers,
        discardPile: updatedDiscard,
        isVaBanqueActive: true,
        history: [`🎲 ${actor.name} играет инстант ⚡ «ВА-БАНК» (потрачен 1 ⚡)! Награда за этот спор удваивается (2 ⚜️ = 1 👑)!`, ...state.history].slice(0, 50)
      }));
      triggerResourceFloat(set, actor.id, '⚡ ВА-БАНК! (x2)', true);
    } else if (instantType === 'Право вето') {
      set(state => ({
        players: updatedPlayers,
        discardPile: updatedDiscard,
        isVetoed: true,
        history: [`🚫 ${actor.name} играет инстант ⚡ «ПРАВО ВЕТО» (потрачен 1 ⚡)! Эффект действия отменён!`, ...state.history].slice(0, 50)
      }));
      triggerResourceFloat(set, actor.id, '🚫 ПРАВО ВЕТО!', false);

      if (get().turnPhase === 'VETO_WINDOW') {
        clearAllTimers();
        delayTimeout = window.setTimeout(() => {
          get().proceedAfterVetoWindow();
        }, 1200);
      }
    } else if (instantType === 'Перенаправление' && targetPlayerId) {
      const newTarget = players.find(p => p.id === targetPlayerId);
      if (pendingAction && newTarget) {
        const updatedAction = { ...pendingAction, targetId: targetPlayerId };
        set(state => ({
          players: updatedPlayers,
          discardPile: updatedDiscard,
          pendingAction: updatedAction,
          turnPhase: 'TARGET_REACTION_WINDOW',
          timerSeconds: 14,
          timerMaxSeconds: 14,
          history: [`🔀 ${actor.name} играет инстант ⚡ «ПЕРЕНАПРАВЛЕНИЕ» (потрачен 1 ⚡)! Новая цель атаки: ${newTarget.name}!`, ...state.history].slice(0, 50)
        }));
      }
    } else if (instantType === 'Дворцовый переполох' && targetPlayerId) {
      const targetIdx = updatedPlayers.findIndex(p => p.id === targetPlayerId);
      if (targetIdx !== -1) {
        const victim = updatedPlayers[targetIdx];
        const { drawn: newTwo, deck: d2, discardPile: disc2 } = drawCardsFromDeck(2, get().deck, [...updatedDiscard, ...victim.hand]);
        updatedPlayers[targetIdx] = { ...victim, hand: newTwo };

        botMemory.invalidatePlayerHand(victim.id);

        set(state => ({
          players: updatedPlayers,
          deck: d2,
          discardPile: disc2,
          history: [`⚡ ${actor.name} играет инстант «ДВОРЦОВЫЙ ПЕРЕПОЛОХ» (потрачен 1 ⚡)! ${victim.name} сбрасывает руку и берет 2 новые карты!`, ...state.history].slice(0, 50)
        }));
        triggerResourceFloat(set, victim.id, '🔄 Смена руки!', false);
      }
      if (isOwnTurn) {
        set({ turnSubPhase: 'CARD_PLAY_PHASE' });
        delayTimeout = window.setTimeout(() => {
          get()._checkEndgameAndAdvanceTurn();
        }, 1200);
      }
    } else if (instantType === 'Шпион' && targetPlayerId) {
      const target = updatedPlayers.find(p => p.id === targetPlayerId);
      if (target) {
        if (!actor.isBot) {
          set(state => ({
            players: updatedPlayers,
            discardPile: updatedDiscard,
            turnSubPhase: 'CARD_PLAY_PHASE',
            spyPeekData: {
              actorId: actor.id,
              targetId: target.id,
              targetCards: [...target.hand]
            },
            turnPhase: 'SPY_PEEK',
            history: [`👁️ ${actor.name} играет инстант ⚡ «ШПИОН» (потрачен 1 ⚡) и тайно изучает карты ${declineGen(target.name)}!`, ...state.history].slice(0, 50)
          }));
        } else {
          if (isRole(target.hand[0])) botMemory.recordSpyPeek(actor.id, target.id, 0, target.hand[0]);
          if (target.hand.length > 1 && isRole(target.hand[1])) {
            botMemory.recordSpyPeek(actor.id, target.id, 1, target.hand[1]);
          }
          set(state => ({
            players: updatedPlayers,
            discardPile: updatedDiscard,
            turnSubPhase: 'CARD_PLAY_PHASE',
            history: [`👁️ ${actor.name} играет инстант ⚡ «ШПИОН» (потрачен 1 ⚡) и тайно изучает карты ${declineGen(target.name)}!`, ...state.history].slice(0, 50)
          }));
          if (isOwnTurn) {
            delayTimeout = window.setTimeout(() => {
              get()._checkEndgameAndAdvanceTurn();
            }, 1200);
          }
        }
      }
    }
  },

  // --------------------------------------------------------------------------
  // TARGETED ATTACK: REACTION METHODS (Accept / Direct Doubt / Duel)
  // --------------------------------------------------------------------------

  targetAcceptAttack: (targetId: string) => {
    clearAllTimers();
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
    const maxSec = 10;
    set({ 
      turnPhase: 'DOUBT_WINDOW',
      timerSeconds: maxSec,
      timerMaxSeconds: maxSec
    });

    gameTimerInterval = window.setInterval(() => {
      const cur = get().timerSeconds;
      if (cur <= 1) {
        clearAllTimers();
        if (get().turnPhase === 'DOUBT_WINDOW') {
          get()._proceedAfterDoubtPassed(pendingAction);
        }
      } else {
        set({ timerSeconds: cur - 1 });
      }
    }, 1000);
  },

  targetDoubtAttack: (targetId: string) => {
    clearAllTimers();
    const { pendingAction, turnPhase } = get();
    if (turnPhase !== 'TARGET_REACTION_WINDOW' || !pendingAction || pendingAction.targetId !== targetId) return;

    get().doubtAction(targetId);
  },

  targetDeclareDuel: (targetId: string, stakedCardIndex = 0) => {
    clearAllTimers();
    const { pendingAction, turnPhase, players } = get();
    if (turnPhase !== 'TARGET_REACTION_WINDOW' || !pendingAction || pendingAction.targetId !== targetId) return;

    const actor = players.find(p => p.id === pendingAction.actorId);
    const target = players.find(p => p.id === targetId);
    if (!actor || !target) return;

    const blockingRole = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';

    set(state => ({
      turnPhase: 'DUEL_ATTACKER_WINDOW',
      pendingDuelDefenderCardIndex: stakedCardIndex,
      pendingDuelDefenderRoleClaim: blockingRole,
      timerSeconds: 14,
      timerMaxSeconds: 14,
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [target.id]: `«ДУЭЛЬ! Мой щит — ${blockingRole}!»`
      },
      history: [`🤺 ${target.name} вызывает ${actor.name} на ДУЭЛЬ, заявляя «${blockingRole}»!`, ...state.history].slice(0, 50)
    }));

    gameTimerInterval = window.setInterval(() => {
      const cur = get().timerSeconds;
      if (cur <= 1) {
        clearAllTimers();
        if (get().turnPhase === 'DUEL_ATTACKER_WINDOW') {
          get().attackerAcceptDuel(actor.id);
        }
      } else {
        set({ timerSeconds: cur - 1 });
      }
    }, 1000);
  },

  attackerRetreatDuel: (attackerId: string) => {
    clearAllTimers();
    const { pendingAction, turnPhase, players } = get();
    if (turnPhase !== 'DUEL_ATTACKER_WINDOW' || !pendingAction || pendingAction.actorId !== attackerId) return;

    const actor = players.find(p => p.id === attackerId);
    const defender = players.find(p => p.id === pendingAction.targetId);
    if (!actor || !defender) return;

    const actorHand = [...actor.hand];
    const stakedIdx = pendingAction.stakedCardIndex ?? 0;
    const discardedCard = actorHand[stakedIdx] || actorHand[0] || 'Наследник';
    actorHand.splice(stakedIdx, 1);

    const newPlayers = players.map(p => p.id === actor.id ? { ...p, hand: actorHand } : p);
    const newDiscard = [...get().discardPile, discardedCard];

    triggerSingleCardFlight(set, 'to_discard', actor.id, pendingAction.roleClaim, discardedCard);

    set(state => ({
      players: newPlayers,
      discardPile: newDiscard,
      turnPhase: 'IDLE',
      turnSubPhase: 'CARD_PLAY_PHASE',
      pendingAction: null,
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [actor.id]: '«Я отступаю... в этот раз.»'
      },
      history: [`🏳️ ${actor.name} отступает перед щитом ${defender.name} (карта атаки сброшена).`, ...state.history].slice(0, 50)
    }));

    delayTimeout = window.setTimeout(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 1200);
  },

  attackerAcceptDuel: (attackerId: string) => {
    clearAllTimers();
    const { pendingAction, pendingDuelDefenderCardIndex, pendingDuelDefenderRoleClaim, turnPhase, players } = get();
    if (turnPhase !== 'DUEL_ATTACKER_WINDOW' || !pendingAction || pendingAction.actorId !== attackerId || !pendingDuelDefenderRoleClaim) return;

    const actor = players.find(p => p.id === attackerId);
    const defender = players.find(p => p.id === pendingAction.targetId);
    if (!actor || !defender) return;

    const actorHand = [...actor.hand];
    const actorStakedIdx = pendingAction.stakedCardIndex ?? 0;
    const actorRevealedRole = actorHand[actorStakedIdx] || actorHand[0] || 'Наследник';
    const actorWasTruth = actorRevealedRole === pendingAction.roleClaim;

    const defenderHand = [...defender.hand];
    const defStakedIdx = pendingDuelDefenderCardIndex ?? 0;
    const defenderRevealedRole = defenderHand[defStakedIdx] || defenderHand[0] || 'Наследник';
    const defenderWasTruth = defenderRevealedRole === pendingDuelDefenderRoleClaim;

    actorHand.splice(actorStakedIdx, 1);
    defenderHand.splice(defStakedIdx, 1);

    const newPlayers = players.map(p => {
      if (p.id === actor.id) return { ...p, hand: actorHand };
      if (p.id === defender.id) return { ...p, hand: defenderHand };
      return p;
    });

    const isVaBanqueActive = get().isVaBanqueActive;
    let resultType: DuelResultType = 'clash_blocked';
    let sealsWinnerId: string | undefined = undefined;
    let bothLostCoin = false;
    let message = '';

    if (actorWasTruth && defenderWasTruth) {
      resultType = 'clash_blocked';
      get().addSealsToPlayer(actor.id, 1);
      get().addSealsToPlayer(defender.id, 1);
      message = `🛡️ ЧЕСТНАЯ ДУЭЛЬ! Оба игрока сказали правду (${actor.name}: «${actorRevealedRole}», ${defender.name}: «${defenderRevealedRole}»). Атака заблокирована, КАЖДЫЙ получает по +1 ⚜️!${isVaBanqueActive ? ' (Ва-банк нейтрализован щитом)' : ''}`;
    } else if (actorWasTruth && !defenderWasTruth) {
      resultType = 'attacker_breakthrough';
      if (!isVaBanqueActive) {
        sealsWinnerId = actor.id;
        get().addSealsToPlayer(actor.id, 1);
      }
      message = `💥 ПРОБИТИЕ ЗАЩИТЫ${isVaBanqueActive ? ' ПОД ВА-БАНКОМ' : ''}! ${actor.name} сказал правду («${actorRevealedRole}»), а ${defender.name} блефовал(а) («${defenderRevealedRole}»). ${isVaBanqueActive ? 'Защитник проиграл дуэль: атака проходит с удвоением (4 💰 / 2 👑, печати отменены)!' : `${actor.name} получает +1 ⚜️, атака проходит!`}`;
    } else if (!actorWasTruth && defenderWasTruth) {
      resultType = 'defender_counter';
      sealsWinnerId = defender.id;
      const defSeals = isVaBanqueActive ? 2 : 1;
      get().addSealsToPlayer(defender.id, defSeals);
      message = `🛡️ КОНТРАТАКА ЩИТОМ${isVaBanqueActive ? ' ПОД ВА-БАНКОМ' : ''}! ${defender.name} подтвердил(а) защиту («${defenderRevealedRole}»), а ${actor.name} блефовал(а) («${actorRevealedRole}»). Атакующий проиграл дуэль под Ва-банком: ${defender.name} получает +${defSeals} ⚜️, атака отбита!`;
    } else {
      resultType = 'mutual_bluff';
      bothLostCoin = false;
      message = `🤡 ОБА ПОПАЛИСЬ! Оба игрока блефовали (${actor.name}: «${actorRevealedRole}», ${defender.name}: «${defenderRevealedRole}»). Атака отменена, никто ничего не получает и не теряет!`;
    }

    const outcome: DuelOutcome = {
      attackerId: actor.id,
      defenderId: defender.id,
      attackerClaim: pendingAction.roleClaim!,
      defenderClaim: pendingDuelDefenderRoleClaim,
      attackerRevealedRole: actorRevealedRole,
      defenderRevealedRole,
      attackerWasTruth: actorWasTruth,
      defenderWasTruth,
      resultType,
      sealsWinnerId,
      bothLostCoin,
      message
    };

    set(state => ({
      players: newPlayers,
      duelOutcome: outcome,
      turnPhase: 'DUEL_OUTCOME',
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [actor.id]: actorWasTruth ? '«Принимаю дуэль! Чистая сталь!»' : '«Принимаю! Посмотрим, кто дрогнет!»',
        [defender.id]: defenderWasTruth ? '«Мой щит непоколебим!»' : '«Я рискнул и ответил вызовом!»'
      },
      history: [message, ...state.history].slice(0, 50)
    }));

    delayTimeout = window.setTimeout(() => {
      get().closeDuelOutcome();
    }, 4000);
  },

  closeDuelOutcome: () => {
    const { duelOutcome, pendingAction } = get();
    if (!duelOutcome || !pendingAction) return;

    triggerDuelCardFlight(
      set,
      'to_discard',
      duelOutcome.attackerId,
      'to_discard',
      duelOutcome.defenderId,
      duelOutcome.attackerRevealedRole,
      duelOutcome.attackerWasTruth,
      duelOutcome.defenderRevealedRole,
      duelOutcome.defenderWasTruth
    );

    const breakthrough = duelOutcome.resultType === 'attacker_breakthrough';
    set({ duelOutcome: null });

    if (breakthrough) {
      get()._triggerVetoWindowOrResolveEffect(pendingAction);
    } else {
      delayTimeout = window.setTimeout(() => {
        get()._checkEndgameAndAdvanceTurn();
      }, 800);
    }
  },

  // --------------------------------------------------------------------------
  // STANDARD DOUBT & CHALLENGE METHODS
  // --------------------------------------------------------------------------

  doubtAction: (doubterId) => {
    clearAllTimers();
    const { pendingAction, turnPhase, players } = get();
    if ((turnPhase !== 'DOUBT_WINDOW' && turnPhase !== 'TARGET_REACTION_WINDOW') || !pendingAction || !pendingAction.roleClaim) return;
    
    const actor = players.find(p => p.id === pendingAction.actorId);
    const doubter = players.find(p => p.id === doubterId);
    if (!actor || !doubter) return;

    // Doubter must spend 1 Action Token!
    if (doubter.actionTokens < 1) {
      return; // Cannot doubt without action token
    }

    // Deduct 1 Action Token from doubter immediately
    let newPlayers = players.map(p => p.id === doubter.id ? { ...p, actionTokens: p.actionTokens - 1 } : p);
    triggerResourceFloat(set, doubter.id, '-1 ⚡', false);

    // Informant Network trigger: all holders receive +1 💰 for every check at court!
    const informantHolders = newPlayers.filter(p => p.activePlot?.type === 'Сеть информаторов');
    if (informantHolders.length > 0) {
      newPlayers = newPlayers.map(p => p.activePlot?.type === 'Сеть информаторов' ? { ...p, gold: p.gold + 1 } : p);
      informantHolders.forEach(p => {
        triggerResourceFloat(set, p.id, '+1 💰 Информаторы', true);
      });
    }

    const informantLogs = informantHolders.map(p => `👁️ «Сеть информаторов» приносит +1 💰 для ${p.name} за проверку при дворе!`);

    set(state => ({
      players: newPlayers,
      pendingDoubtDoubterId: doubter.id,
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [doubter.id]: '«Не верю! Проверяю!»'
      },
      history: [
        ...informantLogs,
        `⚡ ${doubter.name} сомневается в «${pendingAction.roleClaim}» от ${actor.name} и кричит: «НЕ ВЕРЮ!» (потрачен 1 ⚡).`,
        ...state.history
      ].slice(0, 50)
    }));

    delayTimeout = window.setTimeout(() => {
      get()._executeRevealOutcome(doubter.id);
    }, 1200);
  },

  _executeRevealOutcome: (doubterId: string) => {
    clearAllTimers();
    const { pendingAction, players, isVaBanqueActive } = get();
    if (!pendingAction || !pendingAction.roleClaim) return;

    const actor = players.find(p => p.id === pendingAction.actorId);
    const doubter = players.find(p => p.id === doubterId);
    if (!actor || !doubter) return;

    const claimedRole = pendingAction.roleClaim;
    const actorHand = [...actor.hand];
    let stakedIndex = pendingAction.stakedCardIndex ?? 0;
    if (stakedIndex < 0 || stakedIndex >= actorHand.length) stakedIndex = 0;

    const revealedRole = actorHand[stakedIndex] || actorHand[0] || 'Наследник';
    const wasTruth = revealedRole === claimedRole;

    const newPlayers = [...players];
    const actorIdx = newPlayers.findIndex(p => p.id === actor.id);
    const doubterIdx = newPlayers.findIndex(p => p.id === doubter.id);

    let jesterBonus = false;
    let blackBookApplied = false;
    let sealsWinnerId: string | undefined = undefined;
    let sealsCount = 0;
    let dossierBonusPlayerId: string | undefined = undefined;
    const doubterPlot = doubter.activePlot;

    if (wasTruth) {
      // Failed check: Black Book is discarded without reward
      if (doubterPlot && doubterPlot.type === 'Чёрная книга') {
        newPlayers[doubterIdx] = { ...newPlayers[doubterIdx], activePlot: null };
        set(state => ({ discardPile: [...state.discardPile, 'Чёрная книга'] }));
      }

      if (claimedRole === 'Шут') {
        if (actor.favor < 6) {
          const nextFavor = Math.min(6, actor.favor + 1);
          const gained = nextFavor - actor.favor;
          newPlayers[actorIdx] = { ...actor, favor: nextFavor };
          jesterBonus = true;
          triggerResourceFloat(set, actor.id, `+${gained} 👑`, true);
        }

        if (newPlayers[actorIdx].favor >= 6 && !get().coronationCandidateId) {
          set(state => ({
            coronationCandidateId: actor.id,
            history: [`👑 КРУГ КОРОНАЦИИ! ${actor.name} через ловушку Шута набрал 6 👑! Если никто не собьёт его короны за круг, он победит!`, ...state.history].slice(0, 50)
          }));
        }
      } else {
        // Under Va-banque, truth does NOT grant seals to actor (0 seals, only x2 role effect)
        if (!isVaBanqueActive) {
          sealsWinnerId = actor.id;
          sealsCount = 1;
        }
      }
    } else {
      // Caught bluffing!
      // Check Black Book (Чёрная книга) for doubter: grants +1 👑 directly, NO seals!
      if (doubterPlot && doubterPlot.type === 'Чёрная книга') {
        blackBookApplied = true;
        if (doubter.favor < 6) {
          const nextFavor = Math.min(6, doubter.favor + 1);
          const gained = nextFavor - doubter.favor;
          newPlayers[doubterIdx] = { 
            ...newPlayers[doubterIdx], 
            favor: nextFavor, 
            activePlot: null 
          };
          triggerResourceFloat(set, doubter.id, `+${gained} 👑 Чёрная книга!`, true);
        } else {
          newPlayers[doubterIdx] = { 
            ...newPlayers[doubterIdx], 
            activePlot: null 
          };
        }
        set(state => ({ discardPile: [...state.discardPile, 'Чёрная книга'] }));

        if (newPlayers[doubterIdx].favor >= 6 && !get().coronationCandidateId) {
          set(state => ({
            coronationCandidateId: doubter.id,
            history: [`👑 КРУГ КОРОНАЦИИ! ${doubter.name} через Чёрную книгу набрал(а) 6 👑! Если никто не собьёт короны за круг, он(а) победит!`, ...state.history].slice(0, 50)
          }));
        }
      } else {
        // Normal doubt / Va-banque doubt: awards seals
        sealsWinnerId = doubter.id;
        sealsCount = isVaBanqueActive ? 2 : 1;
      }

      // Check Dossier (Досье) on the accused actor: awards +1 👑 directly!
      const dossierOwner = newPlayers.find(p => p.activePlot?.type === 'Досье' && p.activePlot.targetPlayerId === actor.id);
      if (dossierOwner) {
        dossierBonusPlayerId = dossierOwner.id;
        const dIdx = newPlayers.findIndex(p => p.id === dossierOwner.id);
        const dNextFavor = Math.min(6, dossierOwner.favor + 1);
        const dGained = dNextFavor - dossierOwner.favor;
        newPlayers[dIdx] = { 
          ...newPlayers[dIdx], 
          favor: dNextFavor, 
          activePlot: null 
        };
        triggerResourceFloat(set, dossierOwner.id, `+${dGained} 👑 Досье!`, true);
        set(state => ({ discardPile: [...state.discardPile, 'Досье'] }));

        if (newPlayers[dIdx].favor >= 6 && !get().coronationCandidateId) {
          set(state => ({
            coronationCandidateId: dossierOwner.id,
            history: [`👑 КРУГ КОРОНАЦИИ! ${dossierOwner.name} через Досье набрал(а) 6 👑! Если никто не собьёт короны за круг, он(а) победит!`, ...state.history].slice(0, 50)
          }));
        }
      }
    }

    // Remove revealed card from hand to discard
    actorHand.splice(stakedIndex, 1);
    newPlayers[actorIdx] = { ...newPlayers[actorIdx], hand: actorHand };
    const newDiscard = [...get().discardPile, revealedRole];

    if (isRole(revealedRole)) botMemory.recordRevealedCard(actor.id, revealedRole);

    const vaBanqueNotice = isVaBanqueActive ? ' 🎲 (Сыгран ВА-БАНК!)' : '';
    const blackBookNotice = (doubterPlot?.type === 'Чёрная книга' && !wasTruth) ? ' 📕 (Сработала Чёрная книга!)' : '';
    const dossierNotice = dossierBonusPlayerId ? ` 📜 (Досье принесло +1 👑 для ${players.find(p => p.id === dossierBonusPlayerId)?.name}!)` : '';

    const actorAcc = declineAcc(actor.name);
    const doubterDoubted = verbDoubted(doubter.name);
    const doubterCaught = verbCaught(doubter.name);

    let message = '';
    if (wasTruth) {
      if (claimedRole === 'Шут') {
        if (isVaBanqueActive) {
          message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «Шут»! Ловушка под Ва-банком: ${actor.name} получает +4 💰 и +1 👑 (печати отменены)!${vaBanqueNotice}`;
        } else {
          message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «Шут»! Ловушка сработала: ${actor.name} получает +1 👑!`;
        }
      } else {
        if (isVaBanqueActive) {
          message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «${claimedRole}»! Эффект роли удваивается (печати отменены)!${vaBanqueNotice}`;
        } else {
          message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «${claimedRole}»! ${actor.name} получает +1 ⚜️, и действие исполняется!`;
        }
      }
    } else {
      if (blackBookApplied) {
        message = `${doubter.name} ${doubterCaught} ${actorAcc} на лжи! На кону была карта «${revealedRole}» вместо «${claimedRole}». Сработала «Чёрная книга»: ${doubter.name} получает +1 👑 напрямую (без печатей)!${vaBanqueNotice}${dossierNotice}`;
      } else {
        message = `${doubter.name} ${doubterCaught} ${actorAcc} на лжи! На кону была карта «${revealedRole}» вместо «${claimedRole}». ${doubter.name} получает +${sealsCount} ⚜️, а действие отменяется.${vaBanqueNotice}${blackBookNotice}${dossierNotice}`;
      }
    }

    const outcome: RevealOutcome = {
      accuserId: doubter.id,
      accusedId: actor.id,
      claimedRole,
      wasTruth,
      revealedRole,
      sealsWinnerId,
      actionExecuted: wasTruth && (claimedRole !== 'Шут' || isVaBanqueActive),
      jesterBonus,
      vaBanqueBonus: isVaBanqueActive,
      dossierBonusPlayerId,
      message
    };

    set(state => ({
      players: newPlayers,
      discardPile: newDiscard,
      revealOutcome: outcome,
      turnPhase: 'REVEAL_OUTCOME',
      pendingDoubtDoubterId: null,
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [actor.id]: wasTruth ? (claimedRole === 'Шут' ? '«Ха-ха! Попались на Шута!»' : '«Вот моя карта! Чистая правда!»') : '«Увы... раскрыли блеф!»'
      },
      history: [outcome.message, ...state.history].slice(0, 50)
    }));

    if (sealsWinnerId && sealsCount > 0) {
      get().addSealsToPlayer(sealsWinnerId, sealsCount);
    }

    delayTimeout = window.setTimeout(() => {
      get().closeRevealOutcome();
    }, 2800);
  },

  passDoubt: (playerId) => {
    clearAllTimers();
    const { turnPhase, pendingAction, players, discardPile, coronationCandidateId } = get();
    if (turnPhase !== 'DOUBT_WINDOW' || !pendingAction || !pendingAction.roleClaim) return;

    const actor = players.find(p => p.id === pendingAction.actorId);
    if (!actor) return;

    // Check observing bots who have >= 1 Action Token
    const bots = players.filter(p => p.isBot && p.id !== pendingAction.actorId && p.id !== playerId && p.actionTokens >= 1);
    const botDoubter = bots.find(b => {
      const decision = evaluateBotDoubt(
        b, 
        actor, 
        pendingAction.roleClaim!, 
        false, 
        coronationCandidateId,
        pendingAction.targetId,
        discardPile,
        players
      );
      return decision.shouldDoubt;
    });

    if (botDoubter) {
      get().doubtAction(botDoubter.id);
    } else {
      get()._proceedAfterDoubtPassed(pendingAction);
    }
  },

  closeRevealOutcome: () => {
    const { revealOutcome, pendingAction } = get();
    if (!revealOutcome) return;

    triggerSingleCardFlight(
      set, 
      'to_discard', 
      revealOutcome.accusedId, 
      revealOutcome.claimedRole, 
      revealOutcome.revealedRole, 
      revealOutcome.wasTruth
    );
    set({ revealOutcome: null });

    if (revealOutcome.wasTruth && (revealOutcome.claimedRole !== 'Шут' || revealOutcome.vaBanqueBonus) && pendingAction) {
      get()._triggerVetoWindowOrResolveEffect(pendingAction, true);
    } else {
      delayTimeout = window.setTimeout(() => {
        get()._checkEndgameAndAdvanceTurn();
      }, 800);
    }
  },

  closeInformantPeek: () => {
    set({ informantPeekData: null, turnPhase: 'IDLE' });
  },

  _proceedAfterDoubtPassed: (action: Action) => {
    clearAllTimers();

    triggerSingleCardFlight(set, 'to_hand', action.actorId, action.roleClaim);

    set(state => ({
      history: [`🂠 Действие «${action.roleClaim}» от ${state.players.find(p => p.id === action.actorId)?.name || 'игрока'} не оспорено двором (карта остаётся в руке).`, ...state.history].slice(0, 50)
    }));

    get()._triggerVetoWindowOrResolveEffect(action, false);
  },

  _triggerVetoWindowOrResolveEffect: (action: Action, isAfterTruthChallenge = false) => {
    clearAllTimers();
    const { isVetoed, players } = get();

    if (isVetoed) {
      set(state => ({
        history: [`🚫 Действие «${action.roleClaim || action.name}» отменено Правом вето!`, ...state.history].slice(0, 50)
      }));
      delayTimeout = window.setTimeout(() => {
        get()._checkEndgameAndAdvanceTurn();
      }, 1200);
      return;
    }

    // Check if any opponent holds Royal Veto and has >= 1 action token
    const hasVetoHolder = players.some(p => p.id !== action.actorId && p.hand.includes('Право вето') && p.actionTokens >= 1);

    if (hasVetoHolder) {
      set({
        turnPhase: 'VETO_WINDOW',
        timerSeconds: 4,
        timerMaxSeconds: 4
      });

      gameTimerInterval = window.setInterval(() => {
        const cur = get().timerSeconds;
        if (cur <= 1) {
          clearAllTimers();
          if (get().turnPhase === 'VETO_WINDOW') {
            get().proceedAfterVetoWindow();
          }
        } else {
          set({ timerSeconds: cur - 1 });
        }
      }, 1000);
    } else {
      delayTimeout = window.setTimeout(() => {
        get()._resolveRoleActionEffect(action, isAfterTruthChallenge);
      }, 800);
    }
  },

  proceedAfterVetoWindow: () => {
    clearAllTimers();
    const { pendingAction, isVetoed } = get();
    if (!pendingAction) {
      get()._checkEndgameAndAdvanceTurn();
      return;
    }

    if (isVetoed) {
      set(state => ({
        history: [`🚫 Действие «${pendingAction.roleClaim || pendingAction.name}» отменено Правом вето!`, ...state.history].slice(0, 50)
      }));
      delayTimeout = window.setTimeout(() => {
        get()._checkEndgameAndAdvanceTurn();
      }, 1200);
    } else {
      get()._resolveRoleActionEffect(pendingAction);
    }
  },

  _executeNormalAction: (action: Action) => {
    let newPlayers = [...get().players];
    const actorIdx = newPlayers.findIndex(p => p.id === action.actorId);
    let actor = newPlayers[actorIdx];

    if (action.name.includes('Просить') || action.name.includes('содержание')) {
      actor = { ...actor, gold: actor.gold + 1 };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, actor.id, '+1 💰', true);
    } else if (action.name.includes('Пир') || action.name.includes('пир')) {
      if (actor.favor < 5) {
        actor = { ...actor, favor: actor.favor + 1 };
        newPlayers[actorIdx] = actor;
        triggerResourceFloat(set, actor.id, '+1 👑', true);
      }
    } else if (action.name.includes('Слух') || action.name.includes('слух')) {
      if (action.targetId) {
        const targetIdx = newPlayers.findIndex(p => p.id === action.targetId);
        if (targetIdx !== -1 && newPlayers[targetIdx].favor > 0) {
          newPlayers[targetIdx] = { ...newPlayers[targetIdx], favor: newPlayers[targetIdx].favor - 1 };
          triggerResourceFloat(set, action.targetId, '-1 👑', false);

          get()._disruptPlayerPlotsOnLoss(action.targetId, 'распущенных слухов');

          if (get().coronationCandidateId === action.targetId && newPlayers[targetIdx].favor < 6) {
            set(state => ({
              coronationCandidateId: null,
              history: [`⚖️ Коронация ${newPlayers[targetIdx].name} сорвана слухами! Влияние упало ниже 6 👑!`, ...state.history].slice(0, 50)
            }));
          }
        }
      }
    } else if (action.name.includes('Сменить') || action.name.includes('сменить')) {
      // 🔄 Сменить карту: this action explicitly draws a new card immediately in Phase 2 so player can use it in Phase 3
      const cardIdx = action.stakedCardIndex ?? 0;
      const returnedCard = actor.hand[cardIdx] || actor.hand[0];
      
      const newDiscard = [...get().discardPile, returnedCard];
      const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } = drawCardsFromDeck(1, get().deck, newDiscard);
      const newCard = drawn[0] || 'Наследник';
      
      const newHand = [...actor.hand];
      newHand[cardIdx] = newCard;
      actor = { ...actor, hand: newHand };
      newPlayers[actorIdx] = actor;
      botMemory.invalidatePlayerHand(actor.id);
      
      const drawNotice = actor.id === 'p1' ? ` (получена новая карта: «${newCard}»)` : '';
      const reshuffleNotice = wasReshuffled ? ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.` : '';

      set(state => ({
        deck: newDeck,
        discardPile: newDiscardPile,
        players: newPlayers,
        history: [`🔄 ${actor.name} сбросил карту и бесплатно взял новую из колоды${drawNotice}.${reshuffleNotice}`, ...state.history].slice(0, 50)
      }));
    }

    set({ players: newPlayers });
    
    delayTimeout = window.setTimeout(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, 1200);
  },

  _resolveRoleActionEffect: (action: Action, isAfterTruthChallenge = false) => {
    let newPlayers = [...get().players];
    const actorIdx = newPlayers.findIndex(p => p.id === action.actorId);
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
      delayTimeout = window.setTimeout(() => {
        get()._checkEndgameAndAdvanceTurn();
      }, 1800);
    } else if (role === 'Казначей') {
      const gold = isVB ? 6 : 3;
      actor = { ...actor, gold: actor.gold + gold };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, actor.id, `+${gold} 💰${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
      set({ players: newPlayers });
      delayTimeout = window.setTimeout(() => {
        get()._checkEndgameAndAdvanceTurn();
      }, 1800);
    } else if (role === 'Рыцарь' || role === 'Шут') {
      const gold = isVB ? 4 : 2;
      actor = { ...actor, gold: actor.gold + gold };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, actor.id, `+${gold} 💰${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
      set({ players: newPlayers });
      delayTimeout = window.setTimeout(() => {
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
        triggerResourceFloat(set, action.targetId, `-${stolen} 💰`, false);
        triggerResourceFloat(set, actor.id, `+${stolen} 💰${isVB ? ' (x2 Ва-банк!)' : ''}`, true);

        if (stolen > 0) {
          get()._disruptPlayerPlotsOnLoss(action.targetId, 'кражи Вора');
        }
      }
      set({ players: newPlayers });
      delayTimeout = window.setTimeout(() => {
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
      delayTimeout = window.setTimeout(() => {
        get()._checkEndgameAndAdvanceTurn();
      }, 1800);
    } else {
      delayTimeout = window.setTimeout(() => {
        get()._checkEndgameAndAdvanceTurn();
      }, 1800);
    }
  },

  completeSpyAction: () => {
    set({ spyPeekData: null });
    get()._checkEndgameAndAdvanceTurn();
  },

  _checkEndgameAndAdvanceTurn: () => {
    const { players, coronationCandidateId, activePlayerId, hasPlayedRoleThisTurn, hasPlayedPlotThisTurn } = get();
    const actor = players.find(p => p.id === activePlayerId);

    if (actor && actor.favor >= 6 && !coronationCandidateId) {
      set(state => ({ 
        coronationCandidateId: actor.id,
        history: [`👑 КРУГ КОРОНАЦИИ! ${actor.name} набрал ${actor.favor} 👑! Если никто не собьёт его короны за полный круг, он победит!`, ...state.history].slice(0, 50)
      }));
    }

    // Check if actor has tokens left and can still make plays
    if (!actor || actor.actionTokens <= 0 || (hasPlayedRoleThisTurn && hasPlayedPlotThisTurn && actor.hand.length === 0)) {
      get().endTurn();
    } else {
      // Return to IDLE in Phase 3 so active player can take a 2nd action or finish turn
      set({
        turnPhase: 'IDLE',
        turnSubPhase: 'CARD_PLAY_PHASE',
        pendingAction: null,
        isVaBanqueActive: false,
        isVetoed: false
      });
    }
  },

  endTurn: () => {
    clearAllTimers();
    const { players, activePlayerId, coronationCandidateId, deck, discardPile } = get();

    // 1. Refill any players who have < 2 cards in hand (deferred card draw)
    let curDeck = deck;
    let curDiscard = discardPile;
    const refilledPlayers = players.map(p => {
      if (p.hand.length < 2) {
        const needed = 2 - p.hand.length;
        const { drawn, deck: newD, discardPile: newDisc } = drawCardsFromDeck(needed, curDeck, curDiscard);
        curDeck = newD;
        curDiscard = newDisc;
        return { ...p, hand: [...p.hand, ...drawn] };
      }
      return p;
    });

    const currentIndex = refilledPlayers.findIndex(p => p.id === activePlayerId);
    const nextIndex = (currentIndex + 1) % refilledPlayers.length;
    const nextPlayer = refilledPlayers[nextIndex];

    // 2. Refill nextPlayer action tokens to 2 at turn start
    const updatedPlayers = refilledPlayers.map(p => {
      if (p.id === nextPlayer.id) {
        return { ...p, actionTokens: 2 };
      }
      return p;
    });

    // 3. Phase 1 Morning Triggers: Check Royal Reception / Informant Network expiry at start of nextPlayer's turn
    let coronationTriggeredByReception = false;
    let nextPlayerUpdated = updatedPlayers[nextIndex];

    if (nextPlayerUpdated.activePlot && nextPlayerUpdated.activePlot.type === 'Королевский приём') {
      const newFavor = Math.min(6, nextPlayerUpdated.favor + 1);
      nextPlayerUpdated = {
        ...nextPlayerUpdated,
        favor: newFavor,
        activePlot: null
      };
      updatedPlayers[nextIndex] = nextPlayerUpdated;
      triggerResourceFloat(set, nextPlayerUpdated.id, '+1 👑 Бал удался!', true);

      curDiscard = [...curDiscard, 'Королевский приём'];
      set(state => ({
        history: [`👑 Королевский приём ${declineGen(nextPlayerUpdated.name)} успешно состоялся! Получено +1 👑!`, ...state.history].slice(0, 50)
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
      curDiscard = [...curDiscard, 'Сеть информаторов'];
      set(state => ({
        history: [`👁️ Действие «Сети информаторов» ${declineGen(nextPlayerUpdated.name)} завершилось после полного круга.`, ...state.history].slice(0, 50)
      }));
    }

    // 4. Check Coronation victory if candidate held >= 6 crowns for entire round
    if (coronationCandidateId && nextPlayer.id === coronationCandidateId) {
      if (nextPlayerUpdated.favor >= 6) {
        set(state => ({
          players: updatedPlayers,
          deck: curDeck,
          discardPile: curDiscard,
          winnerId: nextPlayer.id,
          turnPhase: 'GAME_OVER',
          history: [`👑 КОРОНАЦИЯ СОСТОЯЛАСЬ! ${nextPlayer.name} удержал(а) ${nextPlayerUpdated.favor} 👑 целый круг и становится полноправным Королём Kinglier!`, ...state.history].slice(0, 50)
        }));
        return;
      } else {
        set({ coronationCandidateId: null });
      }
    }

    const newCandidateId = coronationTriggeredByReception ? nextPlayerUpdated.id : coronationCandidateId;

    set({ 
      players: updatedPlayers,
      deck: curDeck,
      discardPile: curDiscard,
      activePlayerId: nextPlayer.id, 
      turnPhase: 'IDLE', 
      turnSubPhase: 'NORMAL_ACTION_PHASE',
      hasUsedNormalActionThisTurn: false,
      hasPlayedRoleThisTurn: false,
      hasPlayedPlotThisTurn: false,
      coronationCandidateId: newCandidateId,
      pendingAction: null, 
      isVaBanqueActive: false,
      isVetoed: false,
      pendingDuelDefenderCardIndex: null, 
      pendingDuelDefenderRoleClaim: null, 
      duelOutcome: null, 
      activeSpeechReactions: {}, 
      timerSeconds: 0, 
      revealOutcome: null, 
      spyPeekData: null, 
      informantPeekData: null,
    });
  }
}));
