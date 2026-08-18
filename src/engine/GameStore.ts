import { create } from 'zustand';
import type { 
  GameState, 
  Player, 
  Role, 
  Action, 
  RevealOutcome, 
  DuelOutcome, 
  DuelResultType, 
  BotArchetype 
} from './types';
import { ALL_ROLES } from './roles';
import { botMemory, evaluateBotDoubt, evaluateBotSpyTake } from './Bot';

export function createInitialDeck(): Role[] {
  const deck: Role[] = [];
  ALL_ROLES.forEach(r => {
    deck.push(r, r, r);
  });
  return shuffle(deck);
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function declineAcc(name: string): string {
  if (name === 'Вы') return 'вас';
  if (name === 'Маша') return 'Машу';
  if (name === 'Саша') return 'Сашу';
  if (name === 'Дима') return 'Диму';
  if (name === 'Юля') return 'Юлю';
  if (name === 'Антон') return 'Антона';
  return name;
}

export function declineGen(name: string): string {
  if (name === 'Вы') return 'вас';
  if (name === 'Маша') return 'Маши';
  if (name === 'Саша') return 'Саши';
  if (name === 'Дима') return 'Димы';
  if (name === 'Юля') return 'Юли';
  if (name === 'Антон') return 'Антона';
  return name;
}

export function verbDoubted(name: string): string {
  if (name === 'Вы') return 'усомнились';
  if (name === 'Маша' || name === 'Юля') return 'усомнилась';
  return 'усомнился';
}

export function verbCaught(name: string): string {
  if (name === 'Вы') return 'поймали';
  if (name === 'Маша' || name === 'Юля') return 'поймала';
  return 'поймал';
}

export function verbLoses(name: string): string {
  if (name === 'Вы') return 'Вы теряете';
  return `${name} теряет`;
}

// 5 Curated Personality Archetypes for Kinglier Bots
export const BOT_ARCHETYPES: Record<string, BotArchetype> = {
  b1: {
    type: 'gambler',
    title: 'Азартная',
    badge: '🎲',
    description: 'Обожает блефовать и проверять других на кураже. Часто рискует.',
    bluffRate: 0.55,
    doubtAggression: 1.35,
    blockBluffRate: 0.55,
    greed: 0.6,
    targetAggression: 0.7
  },
  b2: {
    type: 'cautious',
    title: 'Стратег',
    badge: '🛡️',
    description: 'Осторожен, избегает сомнительных авантюр, бережет свои жизни.',
    bluffRate: 0.18,
    doubtAggression: 0.75,
    blockBluffRate: 0.20,
    greed: 0.3,
    targetAggression: 0.4
  },
  b3: {
    type: 'pragmatic',
    title: 'Тактик',
    badge: '⚖️',
    description: 'Считает вероятности и карты в сбросе. Блефует только при выгоде.',
    bluffRate: 0.32,
    doubtAggression: 1.05,
    blockBluffRate: 0.35,
    greed: 0.5,
    targetAggression: 0.6
  },
  b4: {
    type: 'provocateur',
    title: 'Провокатор',
    badge: '🎭',
    description: 'Ставит психологические ловушки, провоцирует игроков на ошибки.',
    bluffRate: 0.48,
    doubtAggression: 1.20,
    blockBluffRate: 0.50,
    greed: 0.8,
    targetAggression: 0.8
  },
  b5: {
    type: 'opportunist',
    title: 'Оппортунист',
    badge: '🗡️',
    description: 'Жестко атакует лидеров и отнимает у них короны в критический момент.',
    bluffRate: 0.38,
    doubtAggression: 1.15,
    blockBluffRate: 0.40,
    greed: 0.4,
    targetAggression: 0.95
  }
};

export function drawCardsFromDeck(
  count: number, 
  currentDeck: Role[], 
  currentDiscardPile: Role[]
): { 
  drawn: Role[]; 
  deck: Role[]; 
  discardPile: Role[]; 
  wasReshuffled: boolean;
  reshuffledCount: number;
} {
  let deck = [...currentDeck];
  let discardPile = [...currentDiscardPile];
  const drawn: Role[] = [];
  let wasReshuffled = false;
  let reshuffledCount = 0;

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discardPile.length > 0) {
        reshuffledCount = discardPile.length;
        deck = shuffle([...discardPile]);
        discardPile = [];
        wasReshuffled = true;
      }
    }
    if (deck.length > 0) {
      drawn.push(deck.pop()!);
    }
  }

  return { drawn, deck, discardPile, wasReshuffled, reshuffledCount };
}

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

function triggerSingleCardFlight(set: any, flightType: 'to_discard' | 'to_hand', actorId: string, role?: Role) {
  const id = Math.random().toString(36).substring(7);
  set({
    cardFlightEvent: { id, isDuel: false, flightType, actorId, role },
    hasCardDeparted: true
  });
  window.setTimeout(() => {
    set((state: GameState) => state.cardFlightEvent?.id === id ? { cardFlightEvent: null } : {});
  }, 950);
}

function triggerDuelCardFlight(set: any, attackerFlight: 'to_discard' | 'to_hand', attackerId: string, defenderFlight: 'to_discard' | 'to_hand', defenderId: string) {
  const id = Math.random().toString(36).substring(7);
  set({
    cardFlightEvent: { id, isDuel: true, attackerFlight, attackerId, defenderFlight, defenderId },
    hasCardDeparted: true
  });
  window.setTimeout(() => {
    set((state: GameState) => state.cardFlightEvent?.id === id ? { cardFlightEvent: null } : {});
  }, 950);
}

export const useGameStore = create<GameState>((set, get) => ({
  players: [],
  deck: [],
  discardPile: [],
  activePlayerId: '',
  turnPhase: 'IDLE',
  coronationCandidateId: null,
  pendingAction: null,
  
  pendingDuelDefenderCardIndex: null,
  pendingDuelDefenderRoleClaim: null,
  duelOutcome: null,
  
  timerSeconds: 0,
  timerMaxSeconds: 14,
  
  revealOutcome: null,
  spyPeekData: null,
  
  damagedPlayerIds: [],
  screenDamageFlash: false,
  activeSpeechReactions: {},
  floatingResourceEvents: [],
  cardFlightEvent: null,
  hasCardDeparted: false,
  
  winnerId: null,
  history: [],

  startGame: () => {
    clearAllTimers();
    botMemory.clear();
    let deck = createInitialDeck();
    
    // Draw 2 distinct cards for human player to ensure rich strategic options at start
    const c1 = deck.pop()!;
    let c2Idx = deck.findIndex((c: Role) => c !== c1);
    if (c2Idx === -1) c2Idx = 0;
    const [c2] = deck.splice(c2Idx, 1);

    // 6 Players: all start on equal, clean, fresh footing (2 Gold, 0 Favor, 3 Reputation)
    const players: Player[] = [
      { id: 'p1', name: 'Вы', avatar: '/avatars/sasha.jpg', seatNumber: 1, isBot: false, gold: 2, favor: 0, reputation: 3, hand: [c1, c2] },
      { id: 'b1', name: 'Маша', avatar: '/avatars/masha.jpg', seatNumber: 2, isBot: true, archetype: BOT_ARCHETYPES.b1, gold: 2, favor: 0, reputation: 3, hand: [deck.pop()!, deck.pop()!] },
      { id: 'b2', name: 'Саша', avatar: '/avatars/sasha.jpg', seatNumber: 3, isBot: true, archetype: BOT_ARCHETYPES.b2, gold: 2, favor: 0, reputation: 3, hand: [deck.pop()!, deck.pop()!] },
      { id: 'b3', name: 'Дима', avatar: '/avatars/dima.jpg', seatNumber: 4, isBot: true, archetype: BOT_ARCHETYPES.b3, gold: 2, favor: 0, reputation: 3, hand: [deck.pop()!, deck.pop()!] },
      { id: 'b4', name: 'Юля', avatar: '/avatars/yulia.jpg', seatNumber: 5, isBot: true, archetype: BOT_ARCHETYPES.b4, gold: 2, favor: 0, reputation: 3, hand: [deck.pop()!, deck.pop()!] },
      { id: 'b5', name: 'Антон', avatar: '/avatars/anton.jpg', seatNumber: 6, isBot: true, archetype: BOT_ARCHETYPES.b5, gold: 2, favor: 0, reputation: 3, hand: [deck.pop()!, deck.pop()!] },
    ];

    set({
      players,
      deck,
      discardPile: [],
      activePlayerId: 'p1',
      turnPhase: 'IDLE',
      coronationCandidateId: null,
      pendingAction: null,
      pendingDuelDefenderCardIndex: null,
      pendingDuelDefenderRoleClaim: null,
      duelOutcome: null,
      timerSeconds: 0,
      timerMaxSeconds: 14,
      revealOutcome: null,
      spyPeekData: null,
      damagedPlayerIds: [],
      screenDamageFlash: false,
      activeSpeechReactions: {},
      floatingResourceEvents: [],
      winnerId: null,
      history: ['👑 Новая партия началась! Каждый игрок получил по 2 💰 и 2 тайные карты. Цель: 5 👑.']
    });
  },

  restartGame: () => {
    get().startGame();
  },

  performAction: (actionData) => {
    clearAllTimers();
    const { players, activePlayerId } = get();
    const actor = players.find(p => p.id === activePlayerId);
    if (!actor || actor.reputation <= 0) return;

    if (actor.gold < actionData.costGold) {
      return; // Cannot afford
    }

    // Victory crown (5th 👑) cannot be bought with coins on Feast!
    if ((actionData.name.includes('Пир') || actionData.name.includes('пир')) && actor.favor >= 4) {
      return;
    }

    // Cannot restore reputation above max (3 ❤️)
    if ((actionData.name.includes('Восстановить') || actionData.name.includes('репутаци')) && actor.reputation >= 3) {
      return;
    }

    const stakedCardIndex = actionData.stakedCardIndex !== undefined 
      ? actionData.stakedCardIndex 
      : (actionData.roleClaim && actor.hand.indexOf(actionData.roleClaim) !== -1 
          ? actor.hand.indexOf(actionData.roleClaim) 
          : 0);

    const action: Action = { 
      ...actionData, 
      id: Math.random().toString(36).substring(7),
      stakedCardIndex
    };
    
    // Deduct cost immediately
    if (action.costGold > 0) {
      set(state => ({
        players: state.players.map(p => p.id === actor.id ? { ...p, gold: p.gold - action.costGold } : p)
      }));
      triggerResourceFloat(set, actor.id, `-${action.costGold} 💰`, false);
    }

    const roleName = action.roleClaim ? `«${action.roleClaim}»` : action.name;
    const target = action.targetId ? players.find(p => p.id === action.targetId) : null;
    const targetInfo = target ? ` на ${declineAcc(target.name)}` : '';
    const stakeNotice = action.roleClaim ? ' (карта на кону)' : '';
    
    const speechText = action.type === 'normal' 
      ? `«${action.name}»` 
      : `«Заявляю: ${action.roleClaim}!${target ? ` Цель: ${target.name}` : ''}»`;

    set(state => ({
      hasCardDeparted: false,
      activeSpeechReactions: { [actor.id]: speechText },
      history: [`${actor.name} заявляет: ${roleName}${targetInfo}${stakeNotice}`, ...state.history].slice(0, 50)
    }));

    // 1. Normal actions execute with a 1.6-second visual delay
    if (action.type === 'normal') {
      set({ pendingAction: action, turnPhase: 'IDLE' });
      delayTimeout = window.setTimeout(() => {
        get()._executeNormalAction(action);
      }, 1600);
      return;
    }

    // 2. Targeted Attack Actions (Вор / Шантажист / Рыцарь) trigger victim TARGET_REACTION_WINDOW
    const isTargetedAttack = (action.roleClaim === 'Вор' || action.roleClaim === 'Шантажист' || action.roleClaim === 'Рыцарь') && !!action.targetId;
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
            // Target timeout defaults to accepting the attack
            get().targetAcceptAttack(action.targetId!);
          }
        } else {
          set({ timerSeconds: cur - 1 });
        }
      }, 1000);
      return;
    }

    // 3. Non-targeted Role Actions trigger standard court DOUBT_WINDOW
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

    // Direct doubt by target
    get().doubtAction(targetId);
  },

  targetDeclareDuel: (targetId: string, stakedCardIndex = 0) => {
    clearAllTimers();
    const { pendingAction, turnPhase, players } = get();
    if (turnPhase !== 'TARGET_REACTION_WINDOW' || !pendingAction || pendingAction.targetId !== targetId) return;

    const actor = players.find(p => p.id === pendingAction.actorId);
    const target = players.find(p => p.id === targetId);
    if (!actor || !target || target.reputation <= 0) return;

    const blockingRole = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';

    set(state => ({
      turnPhase: 'DUEL_ATTACKER_WINDOW',
      pendingDuelDefenderCardIndex: stakedCardIndex,
      pendingDuelDefenderRoleClaim: blockingRole,
      timerSeconds: 14,
      timerMaxSeconds: 14,
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [target.id]: `«К барьеру! Блокирую ${blockingRole === 'Казначей' ? 'Казначеем' : 'Рыцарем'}!»`
      },
      history: [`🤺 ${target.name} заявляет «${blockingRole}» и бросает вызов ${actor.name} на дуэль!`, ...state.history].slice(0, 50)
    }));

    gameTimerInterval = window.setInterval(() => {
      const cur = get().timerSeconds;
      if (cur <= 1) {
        clearAllTimers();
        if (get().turnPhase === 'DUEL_ATTACKER_WINDOW') {
          // Attacker timed out -> defaults to retreat
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

    // Trigger dual flight: Attacker to discard, Defender back to hand!
    triggerDuelCardFlight(set, 'to_discard', actor.id, 'to_hand', defender.id);

    // Attacker retreats:
    // Attacker's card is placed in discard pile + new card drawn
    const actorHand = actor.hand;
    const actorStakedIdx = pendingAction.stakedCardIndex ?? (actorHand.indexOf(pendingAction.roleClaim!) !== -1 ? actorHand.indexOf(pendingAction.roleClaim!) : 0);
    const returnedCard = actorHand[actorStakedIdx] || actorHand[0];
    
    const newDiscard = [...get().discardPile, returnedCard];
    const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } = drawCardsFromDeck(1, get().deck, newDiscard);
    const newlyDrawnCard = drawn[0] || 'Наследник';

    const newPlayers = [...players];
    const actorIdx = newPlayers.findIndex(p => p.id === actor.id);
    const newActorHand = [...actorHand];
    newActorHand[actorStakedIdx] = newlyDrawnCard;
    newPlayers[actorIdx] = { ...actor, hand: newActorHand };

    const drawNotice = actor.id === 'p1' ? ` Ваша карта ушла в сброс, выдана новая: «${newlyDrawnCard}».` : '';
    const reshuffleNotice = wasReshuffled ? ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.` : '';

    set(state => ({
      players: newPlayers,
      deck: newDeck,
      discardPile: newDiscardPile,
      turnPhase: 'IDLE',
      pendingAction: null,
      pendingDuelDefenderCardIndex: null,
      pendingDuelDefenderRoleClaim: null,
      timerSeconds: 0,
      activeSpeechReactions: { ...state.activeSpeechReactions, [actor.id]: '«Отступаю перед дуэлью...»' },
      history: [`🏳️ ${actor.name} отступает перед вызовом на дуэль! Атака отменена, никто не теряет ❤️.${drawNotice}${reshuffleNotice}`, ...state.history].slice(0, 50)
    }));

    delayTimeout = window.setTimeout(() => {
      get().endTurn();
    }, 1800);
  },

  attackerAcceptDuel: (attackerId: string) => {
    clearAllTimers();
    const { pendingAction, pendingDuelDefenderCardIndex, pendingDuelDefenderRoleClaim, turnPhase, players } = get();
    if (turnPhase !== 'DUEL_ATTACKER_WINDOW' || !pendingAction || pendingAction.actorId !== attackerId || !pendingDuelDefenderRoleClaim) return;

    const actor = players.find(p => p.id === attackerId);
    const defender = players.find(p => p.id === pendingAction.targetId);
    if (!actor || !defender) return;

    const actorHand = actor.hand;
    const actorStakedIdx = pendingAction.stakedCardIndex ?? (actorHand.indexOf(pendingAction.roleClaim!) !== -1 ? actorHand.indexOf(pendingAction.roleClaim!) : 0);
    const actorRevealedRole = actorHand[actorStakedIdx] || actorHand[0] || 'Наследник';
    const actorWasTruth = actorRevealedRole === pendingAction.roleClaim;

    const defenderHand = defender.hand;
    const defenderStakedIdx = pendingDuelDefenderCardIndex ?? (defenderHand.indexOf(pendingDuelDefenderRoleClaim) !== -1 ? defenderHand.indexOf(pendingDuelDefenderRoleClaim) : 0);
    const defenderRevealedRole = defenderHand[defenderStakedIdx] || defenderHand[0] || 'Наследник';
    const defenderWasTruth = defenderRevealedRole === pendingDuelDefenderRoleClaim;

    const newPlayers = [...players];
    const actorIdx = newPlayers.findIndex(p => p.id === actor.id);
    const defenderIdx = newPlayers.findIndex(p => p.id === defender.id);

    let resultType: DuelResultType = 'clash_blocked';
    let message = '';
    const damagedIds: string[] = [];

    if (actorWasTruth && defenderWasTruth) {
      // 1. Both Truth: Attack Blocked, 0 damage
      resultType = 'clash_blocked';
      message = `⚔️ ЧЕСТНАЯ ДУЭЛЬ! ${actor.name} («${pendingAction.roleClaim}») встретил честный щит ${defender.name} («${pendingDuelDefenderRoleClaim}»)! Атака заблокирована, никто не теряет ❤️.`;
    } else if (actorWasTruth && !defenderWasTruth) {
      // 2. Attacker Truth, Defender Bluff: Defender -1 HP, Attack succeeds!
      resultType = 'attacker_breakthrough';
      newPlayers[defenderIdx] = { ...defender, reputation: Math.max(0, defender.reputation - 1) };
      damagedIds.push(defender.id);
      message = `💥 ПРОБИТИЕ ЗАЩИТЫ! ${actor.name} действительно «${pendingAction.roleClaim}», а ${defender.name} блефовал картой «${defenderRevealedRole}»! ${defender.name} теряет 1 ❤️, атака проходит!`;
    } else if (!actorWasTruth && defenderWasTruth) {
      // 3. Attacker Bluff, Defender Truth: Attacker -1 HP, Attack cancelled!
      resultType = 'defender_counter';
      newPlayers[actorIdx] = { ...actor, reputation: Math.max(0, actor.reputation - 1) };
      damagedIds.push(actor.id);
      message = `🛡️ КОНТРАТАКА! ${defender.name} выставил настоящего «${pendingDuelDefenderRoleClaim}», а ${actor.name} блефовал картой «${actorRevealedRole}»! ${actor.name} теряет 1 ❤️, атака отменена!`;
    } else {
      // 4. Both Bluff: Mutual Bluff! BOTH -1 HP, Attack cancelled!
      resultType = 'mutual_bluff';
      newPlayers[actorIdx] = { ...actor, reputation: Math.max(0, actor.reputation - 1) };
      newPlayers[defenderIdx] = { ...defender, reputation: Math.max(0, defender.reputation - 1) };
      damagedIds.push(actor.id, defender.id);
      message = `🤡 ВЗАИМНЫЙ ПОЗОР! Оба игрока блефовали! (${actor.name} поставил «${actorRevealedRole}», а ${defender.name} поставил «${defenderRevealedRole}»). Оба теряют по 1 ❤️, атака отменена!`;
    }

    // Both cards were revealed to the table and go into DISCARD PILE!
    const newDiscard = [...get().discardPile, actorRevealedRole, defenderRevealedRole];
    const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } = drawCardsFromDeck(2, get().deck, newDiscard);
    const newActorDrawn = drawn[0] || 'Наследник';
    const newDefenderDrawn = drawn[1] || 'Наследник';

    const updatedActorHand = [...newPlayers[actorIdx].hand];
    updatedActorHand[actorStakedIdx] = newActorDrawn;
    newPlayers[actorIdx] = { ...newPlayers[actorIdx], hand: updatedActorHand };

    const updatedDefenderHand = [...newPlayers[defenderIdx].hand];
    updatedDefenderHand[defenderStakedIdx] = newDefenderDrawn;
    newPlayers[defenderIdx] = { ...newPlayers[defenderIdx], hand: updatedDefenderHand };

    botMemory.recordRevealedCard(actor.id, actorRevealedRole);
    botMemory.recordRevealedCard(defender.id, defenderRevealedRole);

    const duelOutcome: DuelOutcome = {
      attackerId: actor.id,
      defenderId: defender.id,
      attackerClaim: pendingAction.roleClaim!,
      defenderClaim: pendingDuelDefenderRoleClaim,
      attackerRevealedRole: actorRevealedRole,
      defenderRevealedRole,
      attackerWasTruth: actorWasTruth,
      defenderWasTruth,
      resultType,
      message
    };

    const reshuffleNotice = wasReshuffled ? ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.` : '';
    const isHumanDamaged = damagedIds.includes('p1');

    set(state => ({
      players: newPlayers,
      deck: newDeck,
      discardPile: newDiscardPile,
      duelOutcome,
      turnPhase: 'DUEL_OUTCOME',
      damagedPlayerIds: damagedIds,
      screenDamageFlash: isHumanDamaged,
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [actor.id]: actorWasTruth ? '«Принимаю дуэль! Чистая сталь!»' : '«Принимаю! Посмотрим, кто дрогнет!»',
        [defender.id]: defenderWasTruth ? '«Мой щит непоколебим!»' : '«Я рискнул и ответил вызовом!»'
      },
      history: [message + reshuffleNotice, ...state.history].slice(0, 50)
    }));

    // Auto-advance non-blocking after 3.8 seconds so players can see the visual duel resolution directly on the table
    delayTimeout = window.setTimeout(() => {
      set({ damagedPlayerIds: [], screenDamageFlash: false });
      get().closeDuelOutcome();
    }, 3800);
  },

  closeDuelOutcome: () => {
    const { duelOutcome, pendingAction } = get();
    if (!duelOutcome || !pendingAction) {
      set({ duelOutcome: null });
      get().endTurn();
      return;
    }

    // Both cards in duel were revealed -> BOTH cards fly to DISCARD!
    triggerDuelCardFlight(set, 'to_discard', duelOutcome.attackerId, 'to_discard', duelOutcome.defenderId);
    const breakthrough = duelOutcome.resultType === 'attacker_breakthrough';
    set({ duelOutcome: null });

    if (breakthrough) {
      // Attack was breakthrough -> execute effect (steal gold or crown)
      get()._resolveRoleActionEffect(pendingAction);
    } else {
      delayTimeout = window.setTimeout(() => {
        get().endTurn();
      }, 1200);
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
    if (!actor || !doubter || doubter.reputation <= 0) return;

    const claimedRole = pendingAction.roleClaim;
    const actorHand = actor.hand;
    let stakedIndex = pendingAction.stakedCardIndex;
    if (stakedIndex === undefined || stakedIndex < 0 || stakedIndex >= actorHand.length) {
      stakedIndex = actorHand.indexOf(claimedRole);
      if (stakedIndex === -1) stakedIndex = 0;
    }

    const revealedRole = actorHand[stakedIndex] || actorHand[0] || 'Наследник';
    const wasTruth = revealedRole === claimedRole;

    const newPlayers = [...players];
    const actorIdx = newPlayers.findIndex(p => p.id === actor.id);
    const doubterIdx = newPlayers.findIndex(p => p.id === doubter.id);

    let jesterBonus = false;
    const damagedId = wasTruth ? doubter.id : actor.id;

    if (wasTruth) {
      // Truth! Doubter loses 1 HP
      newPlayers[doubterIdx] = { 
        ...doubter, 
        reputation: Math.max(0, doubter.reputation - 1) 
      };

      if (claimedRole === 'Шут') {
        newPlayers[actorIdx] = { ...actor, favor: actor.favor + 1 };
        jesterBonus = true;
        triggerResourceFloat(set, actor.id, '+1 👑', true);
      }
    } else {
      // Lie! Actor loses 1 HP
      newPlayers[actorIdx] = { 
        ...actor, 
        reputation: Math.max(0, actor.reputation - 1) 
      };
    }

    // IN BOTH CASES: The staked card was revealed to all and goes into the DISCARD PILE!
    const returnedCard = revealedRole;
    const newDiscard = [...get().discardPile, returnedCard];
    const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } = drawCardsFromDeck(1, get().deck, newDiscard);
    const newlyDrawnCard = drawn[0] || 'Наследник';

    const newHand = [...newPlayers[actorIdx].hand];
    newHand[stakedIndex] = newlyDrawnCard;
    newPlayers[actorIdx] = { ...newPlayers[actorIdx], hand: newHand };

    botMemory.recordRevealedCard(actor.id, revealedRole);

    const drawNotice = actor.id === 'p1' 
      ? ` Ваша карта «${revealedRole}» отправлена в сброс, и вам выдана новая карта: «${newlyDrawnCard}».`
      : '';

    const reshuffleNotice = wasReshuffled 
      ? ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и сформировал новую колоду.` 
      : '';

    const actorAcc = declineAcc(actor.name);
    const doubterDoubted = verbDoubted(doubter.name);
    const doubterCaught = verbCaught(doubter.name);
    const actorLoses = verbLoses(actor.name);
    const doubterLoses = verbLoses(doubter.name);

    const message = wasTruth
      ? `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «${claimedRole}»! ${doubterLoses} 1 ❤️, но действие карты остановлено проверкой!${drawNotice}${jesterBonus ? ' Шут получает +1 👑!' : ''}${reshuffleNotice}`
      : `${doubter.name} ${doubterCaught} ${actorAcc} на лжи! На кону была карта «${revealedRole}» вместо «${claimedRole}». ${actorLoses} 1 ❤️, а действие отменяется.${drawNotice}${reshuffleNotice}`;

    const outcome: RevealOutcome = {
      accuserId: doubter.id,
      accusedId: actor.id,
      claimedRole,
      wasTruth,
      revealedRole,
      jesterBonus,
      message
    };

    const isHumanDamaged = damagedId === 'p1';

    set(state => ({
      players: newPlayers,
      deck: newDeck,
      discardPile: newDiscardPile,
      revealOutcome: outcome,
      turnPhase: 'REVEAL_OUTCOME',
      damagedPlayerIds: [damagedId],
      screenDamageFlash: isHumanDamaged,
      activeSpeechReactions: {
        ...state.activeSpeechReactions,
        [doubter.id]: '«Не верю! Проверяю!»',
        [actor.id]: wasTruth ? '«Вот моя карта! Честная правда!»' : '«Увы... раскрыли блеф!»'
      },
      history: [outcome.message, ...state.history].slice(0, 50)
    }));

    // Auto-advance non-blocking after 3.6 seconds so players can see the visual reveal on the table
    delayTimeout = window.setTimeout(() => {
      set({ damagedPlayerIds: [], screenDamageFlash: false });
      get().closeRevealOutcome();
    }, 3600);
  },

  passDoubt: (playerId) => {
    clearAllTimers();
    const { turnPhase, pendingAction, players, coronationCandidateId, discardPile } = get();
    if (turnPhase !== 'DOUBT_WINDOW' || !pendingAction || !pendingAction.roleClaim) return;

    const actor = players.find(p => p.id === pendingAction.actorId);
    if (!actor) return;

    // Check if any observing bot wants to doubt using intelligent evaluator
    const bots = players.filter(p => p.isBot && p.id !== pendingAction.actorId && p.id !== playerId && p.reputation > 0);
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
    const { revealOutcome } = get();
    if (!revealOutcome) return;

    triggerSingleCardFlight(set, 'to_discard', revealOutcome.accusedId, revealOutcome.revealedRole);
    set({ revealOutcome: null });

    // Rule 7: Any challenge stops the card action even if it was the truth!
    delayTimeout = window.setTimeout(() => {
      get()._checkCoronationAndEndTurn(revealOutcome.accusedId);
    }, 1200);
  },

  _proceedAfterDoubtPassed: (action: Action) => {
    clearAllTimers();
    triggerSingleCardFlight(set, 'to_discard', action.actorId, action.roleClaim);

    // Rule 1: Staked card goes to discard pile and player draws a new card (except Spy which handles choice)
    if (action.roleClaim !== 'Шпион') {
      const { players, deck, discardPile } = get();
      const actorIdx = players.findIndex(p => p.id === action.actorId);
      const actor = players[actorIdx];
      if (actor) {
        const actorHand = actor.hand;
        const stakedIdx = action.stakedCardIndex ?? (actorHand.indexOf(action.roleClaim!) !== -1 ? actorHand.indexOf(action.roleClaim!) : 0);
        const playedCard = actorHand[stakedIdx] || actorHand[0];

        const newDiscard = [...discardPile, playedCard];
        const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } = drawCardsFromDeck(1, deck, newDiscard);
        const newCard = drawn[0] || 'Наследник';

        const newHand = [...actorHand];
        newHand[stakedIdx] = newCard;
        const newPlayers = [...players];
        newPlayers[actorIdx] = { ...actor, hand: newHand };

        const drawNotice = actor.id === 'p1' ? ` (карта «${playedCard}» ушла в сброс, получена «${newCard}»)` : '';
        const reshuffleNotice = wasReshuffled ? ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.` : '';

        set(state => ({
          players: newPlayers,
          deck: newDeck,
          discardPile: newDiscardPile,
          history: [`🂠 ${actor.name} сыграл «${action.roleClaim}»${drawNotice}.${reshuffleNotice}`, ...state.history].slice(0, 50)
        }));
      }
    }

    get()._resolveRoleActionEffect(action);
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
      if (actor.favor < 4) {
        actor = { ...actor, favor: actor.favor + 1 };
        newPlayers[actorIdx] = actor;
        triggerResourceFloat(set, actor.id, '+1 👑', true);
      }
    } else if (action.name.includes('Восстановить') || action.name.includes('репутаци')) {
      if (actor.reputation < 3) {
        actor = { ...actor, reputation: Math.min(3, actor.reputation + 1) };
        newPlayers[actorIdx] = actor;
        triggerResourceFloat(set, actor.id, '+1 ❤️', true);
        set(state => ({
          players: newPlayers,
          history: [`❤️ ${actor.name} восстановил 1 ❤️ репутации за 5 💰.`, ...state.history].slice(0, 50)
        }));
      }
    } else if (action.name.includes('Слух') || action.name.includes('слух')) {
      if (action.targetId) {
        const targetIdx = newPlayers.findIndex(p => p.id === action.targetId);
        if (targetIdx !== -1 && newPlayers[targetIdx].favor > 0) {
          newPlayers[targetIdx] = { ...newPlayers[targetIdx], favor: newPlayers[targetIdx].favor - 1 };
          triggerResourceFloat(set, action.targetId, '-1 👑', false);
        }
      }
    } else if (action.name.includes('Сменить') || action.name.includes('сменить')) {
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
        history: [`🔄 ${actor.name} сбросил карту и взял новую через обычное действие${drawNotice}.${reshuffleNotice}`, ...state.history].slice(0, 50)
      }));
    }

    set({ players: newPlayers });
    
    delayTimeout = window.setTimeout(() => {
      get()._checkCoronationAndEndTurn(actor.id);
    }, 1800);
  },

  _resolveRoleActionEffect: (action: Action) => {
    let newPlayers = [...get().players];
    const actorIdx = newPlayers.findIndex(p => p.id === action.actorId);
    let actor = newPlayers[actorIdx];
    const role = action.roleClaim;

    if (role === 'Наследник') {
      actor = { ...actor, favor: actor.favor + 1 };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, actor.id, '+1 👑', true);
      set({ players: newPlayers });
      delayTimeout = window.setTimeout(() => {
        get()._checkCoronationAndEndTurn(actor.id);
      }, 1800);
    } else if (role === 'Казначей') {
      actor = { ...actor, gold: actor.gold + 3 };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, actor.id, '+3 💰', true);
      set({ players: newPlayers });
      delayTimeout = window.setTimeout(() => {
        get()._checkCoronationAndEndTurn(actor.id);
      }, 1800);
    } else if (role === 'Рыцарь' || role === 'Шут') {
      actor = { ...actor, gold: actor.gold + 2 };
      newPlayers[actorIdx] = actor;
      triggerResourceFloat(set, actor.id, '+2 💰', true);
      set({ players: newPlayers });
      delayTimeout = window.setTimeout(() => {
        get()._checkCoronationAndEndTurn(actor.id);
      }, 1800);
    } else if (role === 'Вор' && action.targetId) {
      const targetIdx = newPlayers.findIndex(p => p.id === action.targetId);
      if (targetIdx !== -1) {
        const stolen = Math.min(2, newPlayers[targetIdx].gold);
        newPlayers[targetIdx] = { ...newPlayers[targetIdx], gold: newPlayers[targetIdx].gold - stolen };
        actor = { ...actor, gold: actor.gold + stolen };
        newPlayers[actorIdx] = actor;
        triggerResourceFloat(set, action.targetId, `-${stolen} 💰`, false);
        triggerResourceFloat(set, actor.id, `+${stolen} 💰`, true);
      }
      set({ players: newPlayers });
      delayTimeout = window.setTimeout(() => {
        get()._checkCoronationAndEndTurn(actor.id);
      }, 1800);
    } else if (role === 'Шантажист' && action.targetId) {
      const targetIdx = newPlayers.findIndex(p => p.id === action.targetId);
      if (targetIdx !== -1 && newPlayers[targetIdx].favor > 0) {
        newPlayers[targetIdx] = { ...newPlayers[targetIdx], favor: newPlayers[targetIdx].favor - 1 };
        actor = { ...actor, favor: actor.favor + 1 };
        newPlayers[actorIdx] = actor;
        triggerResourceFloat(set, action.targetId, '-1 👑', false);
        triggerResourceFloat(set, actor.id, '+1 👑', true);
      }
      set({ players: newPlayers });
      delayTimeout = window.setTimeout(() => {
        get()._checkCoronationAndEndTurn(actor.id);
      }, 1800);
    } else if (role === 'Шпион' && action.targetId) {
      const target = newPlayers.find(p => p.id === action.targetId);
      const targetCards: Role[] = target ? [...target.hand] : ['Наследник', 'Казначей'];

      if (!actor.isBot) {
        // Show spy modal to human with BOTH cards!
        set({
          spyPeekData: {
            actorId: actor.id,
            targetId: action.targetId,
            targetCards
          },
          turnPhase: 'SPY_PEEK'
        });
      } else {
        // Bot records both seen cards in memory
        if (target) {
          botMemory.recordSpyPeek(actor.id, target.id, 0, targetCards[0]);
          if (targetCards.length > 1) {
            botMemory.recordSpyPeek(actor.id, target.id, 1, targetCards[1]);
          }
        }
        const chosenTakeIndex = evaluateBotSpyTake(actor, targetCards);
        get().completeSpyAction(chosenTakeIndex);
      }
    } else if (role === 'Интриган' && action.targetId) {
      const targetIdx = newPlayers.findIndex(p => p.id === action.targetId);
      if (targetIdx !== -1) {
        const target = newPlayers[targetIdx];
        const returnedCards = [...target.hand];
        
        const newDiscard = [...get().discardPile, ...returnedCards];
        const { drawn, deck: newDeck, discardPile: newDiscardPile, wasReshuffled, reshuffledCount } = drawCardsFromDeck(2, get().deck, newDiscard);
        const c1 = drawn[0] || 'Наследник';
        const c2 = drawn[1] || 'Наследник';
        
        newPlayers[targetIdx] = { ...target, hand: [c1, c2] };
        botMemory.invalidatePlayerHand(target.id);
        
        const targetNotice = target.id === 'p1' ? ` Ваши новые карты: «${c1}» и «${c2}».` : '';
        const reshuffleNotice = wasReshuffled ? ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.` : '';

        set(state => ({
          players: newPlayers,
          deck: newDeck,
          discardPile: newDiscardPile,
          history: [`🎭 ${actor.name} через «Интригана» сбросил и заменил обе карты у ${declineGen(target.name)}!${targetNotice}${reshuffleNotice}`, ...state.history].slice(0, 50)
        }));
      }
      delayTimeout = window.setTimeout(() => {
        get()._checkCoronationAndEndTurn(actor.id);
      }, 1800);
    } else {
      delayTimeout = window.setTimeout(() => {
        get()._checkCoronationAndEndTurn(actor.id);
      }, 1800);
    }
  },

  completeSpyAction: (takeCardIndex: number | null) => {
    const { spyPeekData, pendingAction, players, deck, discardPile } = get();
    const actorId = spyPeekData?.actorId || pendingAction?.actorId;
    const targetId = spyPeekData?.targetId || pendingAction?.targetId;

    if (!actorId || !targetId) {
      set({ spyPeekData: null });
      get().endTurn();
      return;
    }

    const newPlayers = [...players];
    const actorIdx = newPlayers.findIndex(p => p.id === actorId);
    const targetIdx = newPlayers.findIndex(p => p.id === targetId);
    const actor = newPlayers[actorIdx];
    const target = newPlayers[targetIdx];

    if (!actor || !target) {
      set({ spyPeekData: null });
      get().endTurn();
      return;
    }

    const actorStakedIdx = pendingAction?.stakedCardIndex ?? 0;
    const actorPlayedCard = actor.hand[actorStakedIdx] || actor.hand[0];
    let newDeck = deck;
    let newDiscardPile = [...discardPile, actorPlayedCard];
    let reshuffleNotice = '';

    if (takeCardIndex !== null && target.hand[takeCardIndex]) {
      // 1. Spy takes target's card!
      const stolenRole = target.hand[takeCardIndex];

      // Target draws 1 replacement card from deck
      const { drawn, deck: dAfterTarget, discardPile: discAfterTarget, wasReshuffled, reshuffledCount } = drawCardsFromDeck(1, newDeck, newDiscardPile);
      newDeck = dAfterTarget;
      newDiscardPile = discAfterTarget;
      const targetNewCard = drawn[0] || 'Наследник';
      if (wasReshuffled) {
        reshuffleNotice = ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.`;
      }

      // Update target's hand
      const newTargetHand = [...target.hand];
      newTargetHand[takeCardIndex] = targetNewCard;
      newPlayers[targetIdx] = { ...target, hand: newTargetHand };

      // Update spy's hand with stolen card
      const newActorHand = [...actor.hand];
      newActorHand[actorStakedIdx] = stolenRole;
      newPlayers[actorIdx] = { ...actor, hand: newActorHand };

      botMemory.invalidatePlayerHand(target.id);
      botMemory.invalidatePlayerHand(actor.id);

      const targetNotice = target.id === 'p1' ? ` У вас забрали «${stolenRole}», вам выдана новая карта: «${targetNewCard}».` : '';
      const actorNotice = actor.id === 'p1' ? ` Вы забрали «${stolenRole}» у ${target.name}.` : '';

      set(state => ({
        players: newPlayers,
        deck: newDeck,
        discardPile: newDiscardPile,
        history: [`👁️ ${actor.name} через Шпиона посмотрел карты ${declineGen(target.name)} и забрал себе «${stolenRole}»!${actorNotice}${targetNotice}${reshuffleNotice}`, ...state.history].slice(0, 50)
      }));
    } else {
      // 2. Spy does NOT take target's card; Spy draws 1 new card from deck
      const { drawn, deck: dAfterSpy, discardPile: discAfterSpy, wasReshuffled, reshuffledCount } = drawCardsFromDeck(1, newDeck, newDiscardPile);
      newDeck = dAfterSpy;
      newDiscardPile = discAfterSpy;
      const actorNewCard = drawn[0] || 'Наследник';
      if (wasReshuffled) {
        reshuffleNotice = ` 🂠 Колода истощилась! Сброс (${reshuffledCount} карт) перемешан и стал новой колодой.`;
      }

      const newActorHand = [...actor.hand];
      newActorHand[actorStakedIdx] = actorNewCard;
      newPlayers[actorIdx] = { ...actor, hand: newActorHand };

      botMemory.invalidatePlayerHand(actor.id);

      const actorNotice = actor.id === 'p1' ? ` (вы получили новую карту: «${actorNewCard}»)` : '';

      set(state => ({
        players: newPlayers,
        deck: newDeck,
        discardPile: newDiscardPile,
        history: [`👁️ ${actor.name} через Шпиона посмотрел карты ${declineGen(target.name)} и взял новую карту из колоды${actorNotice}.${reshuffleNotice}`, ...state.history].slice(0, 50)
      }));
    }

    set({ spyPeekData: null });
    delayTimeout = window.setTimeout(() => {
      get()._checkCoronationAndEndTurn(actor.id);
    }, 1800);
  },

  _checkCoronationAndEndTurn: (actorId: string) => {
    const { players, coronationCandidateId } = get();
    const actor = players.find(p => p.id === actorId);

    if (actor && actor.favor >= 5 && coronationCandidateId !== actor.id) {
      set(state => ({ 
        coronationCandidateId: actor.id,
        history: [`👑 ${actor.name} НАЗНАЧЕН ФАВОРИТОМ КОРОЛЯ (5 👑)! У всех остался один круг, чтобы остановить его!`, ...state.history].slice(0, 50)
      }));
    }

    get().endTurn();
  },

  endTurn: () => {
    clearAllTimers();
    const { players, activePlayerId, coronationCandidateId } = get();
    
    // Check if 0 survivors left (Simultaneous mutual bluff elimination in a 1v1 duel) -> DRAW!
    const alivePlayers = players.filter(p => p.reputation > 0);
    if (alivePlayers.length === 0) {
      set(state => ({ 
        winnerId: 'draw', 
        turnPhase: 'GAME_OVER',
        history: ['👑 НИЧЬЯ! Последние претенденты одновременно пали в позоре. Престол пуст, в королевстве смута!', ...state.history].slice(0, 50)
      }));
      return;
    }

    // Check if only 1 survivor left (elimination win)
    if (alivePlayers.length === 1) {
      set(state => ({ 
        winnerId: alivePlayers[0].id, 
        turnPhase: 'GAME_OVER',
        history: [`👑 ${alivePlayers[0].name} — единственный не опозоренный придворный! ПОБЕДА!`, ...state.history].slice(0, 50)
      }));
      return;
    }

    // Check Coronation win: if active player is the candidate and still has 5+ favor at the start of their turn
    const currentIndex = players.findIndex(p => p.id === activePlayerId);
    let nextIndex = (currentIndex + 1) % players.length;
    while (players[nextIndex].reputation <= 0) {
      nextIndex = (nextIndex + 1) % players.length;
    }

    const nextPlayer = players[nextIndex];
    if (coronationCandidateId === nextPlayer.id) {
      if (nextPlayer.favor >= 5) {
        set(state => ({ 
          winnerId: nextPlayer.id, 
          turnPhase: 'GAME_OVER',
          history: [`👑 КОРОНАЦИЯ! ${nextPlayer.name} сохранил 5 корон и становится новым Королем!`, ...state.history].slice(0, 50)
        }));
        return;
      } else {
        // Lost favor during the round
        set(state => ({ 
          coronationCandidateId: null,
          history: [`${nextPlayer.name} потерял благосклонность короля (меньше 5 👑)! Коронация отменена.`, ...state.history].slice(0, 50)
        }));
      }
    }

    set({ 
      activePlayerId: nextPlayer.id, 
      turnPhase: 'IDLE', 
      pendingAction: null, 
      pendingDuelDefenderCardIndex: null, 
      pendingDuelDefenderRoleClaim: null, 
      duelOutcome: null, 
      activeSpeechReactions: {}, 
      damagedPlayerIds: [], 
      timerSeconds: 0, 
      revealOutcome: null, 
      spyPeekData: null, 
      hasCardDeparted: false 
    });
  }
}));
