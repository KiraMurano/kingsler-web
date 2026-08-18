import { useGameStore } from './GameStore';
import type { Role, Player, BotArchetype } from './types';

// ============================================================================
// 1. BOT ARCHETYPES / PERSONALITIES
// ============================================================================

export const BOT_ARCHETYPES: Record<string, BotArchetype> = {
  // b1: Маша — Азартная
  b1: {
    type: 'gambler',
    title: 'Азартная',
    badge: '🎲',
    description: 'Любит рисковать, часто блефует и проверяет других.',
    bluffRate: 0.55,
    doubtAggression: 1.35,
    blockBluffRate: 0.50,
    greed: 0.5,
    targetAggression: 0.7
  },
  // b2: Саша — Осторожный стратег
  b2: {
    type: 'cautious',
    title: 'Стратег',
    badge: '🛡️',
    description: 'Осторожный консерватор, играет надежно и избегает лишнего риска.',
    bluffRate: 0.18,
    doubtAggression: 0.75,
    blockBluffRate: 0.20,
    greed: 0.6,
    targetAggression: 0.5
  },
  // b3: Дима — Расчётливый тактик
  b3: {
    type: 'pragmatic',
    title: 'Тактик',
    badge: '⚖️',
    description: 'Взвешивает математические шансы, хладнокровен и точен.',
    bluffRate: 0.35,
    doubtAggression: 1.0,
    blockBluffRate: 0.38,
    greed: 0.5,
    targetAggression: 0.65
  },
  // b4: Юля — Дерзкий провокатор
  b4: {
    type: 'provocateur',
    title: 'Провокатор',
    badge: '🎭',
    description: 'Любит ловушки, дерзкие ходы и внезапные атаки.',
    bluffRate: 0.48,
    doubtAggression: 1.25,
    blockBluffRate: 0.45,
    greed: 0.7,
    targetAggression: 0.8
  },
  // b5: Антон — Хитрый оппортунист
  b5: {
    type: 'opportunist',
    title: 'Оппортунист',
    badge: '🗡️',
    description: 'Следит за лидерами, бьет по уязвимым местам и адаптируется.',
    bluffRate: 0.32,
    doubtAggression: 1.1,
    blockBluffRate: 0.35,
    greed: 0.55,
    targetAggression: 0.9
  }
};

export function getBotArchetype(botId: string): BotArchetype {
  return BOT_ARCHETYPES[botId] || {
    type: 'pragmatic',
    title: 'Придворный',
    badge: '👑',
    description: 'Обычный придворный.',
    bluffRate: 0.35,
    doubtAggression: 1.0,
    blockBluffRate: 0.35,
    greed: 0.5,
    targetAggression: 0.6
  };
}

// ============================================================================
// 2. BOT MEMORY & CARD TRACKING
// ============================================================================

export interface KnownCardRecord {
  playerId: string;
  cardIndex: number;
  role: Role;
  knownByBotIds: string[];
}

class BotMemoryEngine {
  private knownCards: KnownCardRecord[] = [];
  // Tracks consecutive role claims by player (to detect engine farming)
  private consecutiveRoleClaims: Record<string, { role: Role; count: number }> = {};

  public recordSpyPeek(botId: string, targetId: string, cardIndex: number, seenRole: Role) {
    this.knownCards = this.knownCards.filter(
      k => !(k.playerId === targetId && k.cardIndex === cardIndex)
    );
    this.knownCards.push({
      playerId: targetId,
      cardIndex,
      role: seenRole,
      knownByBotIds: [botId]
    });
  }

  public recordRoleClaim(playerId: string, role: Role) {
    const current = this.consecutiveRoleClaims[playerId];
    if (current && current.role === role) {
      this.consecutiveRoleClaims[playerId] = { role, count: current.count + 1 };
    } else {
      this.consecutiveRoleClaims[playerId] = { role, count: 1 };
    }
  }

  public getConsecutiveRoleClaims(playerId: string, role: Role): number {
    const current = this.consecutiveRoleClaims[playerId];
    if (current && current.role === role) {
      return current.count;
    }
    return 0;
  }

  public recordRevealedCard(targetId: string, role: Role) {
    // When a card was publicly revealed or reshuffled, remove it from specific tracking
    this.knownCards = this.knownCards.filter(k => !(k.playerId === targetId && k.role === role));
    // Reset consecutive count since that card was just reshuffled!
    if (this.consecutiveRoleClaims[targetId]?.role === role) {
      this.consecutiveRoleClaims[targetId] = { role, count: 0 };
    }
  }

  public invalidatePlayerHand(playerId: string) {
    this.knownCards = this.knownCards.filter(k => k.playerId !== playerId);
    delete this.consecutiveRoleClaims[playerId];
  }

  public getKnownCardsForBot(botId: string, targetId: string): Role[] {
    return this.knownCards
      .filter(k => k.playerId === targetId && k.knownByBotIds.includes(botId))
      .map(k => k.role);
  }

  public knowsPlayerHasRole(botId: string, targetId: string, role: Role): boolean {
    return this.getKnownCardsForBot(botId, targetId).includes(role);
  }

  public clear() {
    this.knownCards = [];
    this.consecutiveRoleClaims = {};
  }
}

export const botMemory = new BotMemoryEngine();

// ============================================================================
// 3. MULTI-FACTOR TARGET SELECTION
// ============================================================================

/**
 * Evaluates the best target for "Вор" (Thief - steals up to 2 gold)
 * Considers gold wealth, defender HP (fear of fake-block), known Treasurer, leader threat.
 */
export function selectBestThiefTarget(bot: Player, opponents: Player[]): Player | null {
  const aliveOpponents = opponents.filter(p => p.reputation > 0);
  if (aliveOpponents.length === 0) return null;

  const archetype = getBotArchetype(bot.id);
  let bestTarget: Player | null = null;
  let highestScore = -Infinity;

  for (const opp of aliveOpponents) {
    // Base score by available gold
    let score = opp.gold * 3.5;
    if (opp.gold === 0) score -= 8.0;
    if (opp.gold === 1) score -= 2.0;

    // Defense & HP evaluation:
    // Low HP (1 HP) targets are afraid to bluff-block with Treasurer
    if (opp.reputation === 1) {
      score += 2.5;
    } else if (opp.reputation === 3) {
      score -= 0.5; // Might boldly fake-block
    }

    // Memory check: does bot know this opponent holds Treasurer?
    if (botMemory.knowsPlayerHasRole(bot.id, opp.id, 'Казначей')) {
      score -= 12.0; // Avoid known blocker!
    }

    // Leader disruption: steal gold from someone close to victory so they can't buy Feast/Rumor
    if (opp.favor >= 4 && opp.gold >= 2) {
      score += 3.0 * archetype.targetAggression;
    }

    // Slight noise to avoid robotic predictability
    score += (Math.random() - 0.5) * 0.8;

    if (score > highestScore) {
      highestScore = score;
      bestTarget = opp;
    }
  }

  return bestTarget || aliveOpponents[0];
}

/**
 * Evaluates the best target for "Шантажист" (Blackmailer - steals 1 crown for 2 gold)
 * Considers crowns (favor), existential leader threat, defender HP, known Knight.
 */
export function selectBestBlackmailerTarget(bot: Player, opponents: Player[]): Player | null {
  const validOpponents = opponents.filter(p => p.reputation > 0 && p.favor > 0);
  if (validOpponents.length === 0) return null;

  const archetype = getBotArchetype(bot.id);
  let bestTarget: Player | null = null;
  let highestScore = -Infinity;

  for (const opp of validOpponents) {
    // Base score strongly tied to crowns
    let score = opp.favor * 4.0;

    // Extreme priority if opponent is nearing victory
    if (opp.favor >= 6) {
      score += 15.0;
    } else if (opp.favor >= 5) {
      score += 8.0;
    } else if (opp.favor >= 4) {
      score += 4.0;
    }

    // Defense & HP evaluation:
    // Low HP targets are afraid to fake-block with Knight
    if (opp.reputation === 1) {
      score += 3.0;
    } else if (opp.reputation === 3) {
      score -= 1.0;
    }

    // Memory check: does bot know this opponent holds Knight?
    if (botMemory.knowsPlayerHasRole(bot.id, opp.id, 'Рыцарь')) {
      score -= 14.0; // Avoid known Knight blocker!
    }

    // Archetype preference
    score += archetype.targetAggression * 2.0;
    score += (Math.random() - 0.5) * 0.8;

    if (score > highestScore) {
      highestScore = score;
      bestTarget = opp;
    }
  }

  return bestTarget || validOpponents[0];
}

/**
 * Evaluates target for "Шпион" (Spy)
 * Prioritizes leaders, wealthy players, or unknown hands.
 */
export function selectBestSpyTarget(bot: Player, opponents: Player[]): Player | null {
  const aliveOpponents = opponents.filter(p => p.reputation > 0);
  if (aliveOpponents.length === 0) return null;

  let bestTarget: Player | null = null;
  let highestScore = -Infinity;

  for (const opp of aliveOpponents) {
    let score = 2.0;
    const knownCount = botMemory.getKnownCardsForBot(bot.id, opp.id).length;
    
    // Prioritize players whose cards we don't know
    if (knownCount === 0) score += 4.0;
    if (knownCount === 1) score += 1.5;

    // Leader priority
    if (opp.favor >= 5) score += 6.0;
    else if (opp.favor >= 3) score += 3.0;

    // Wealthy priority
    if (opp.gold >= 4) score += 2.0;

    score += (Math.random() - 0.5) * 0.5;

    if (score > highestScore) {
      highestScore = score;
      bestTarget = opp;
    }
  }

  return bestTarget || aliveOpponents[0];
}

/**
 * Evaluates target for "Интриган" (Intriguer - forces target to reshuffle and redraw BOTH cards)
 * Prioritizes leaders (to destroy their held Heir/Knight), players known to hold Heir/Treasurer, or highest favor.
 */
export function selectBestIntriguerTarget(bot: Player, opponents: Player[]): Player | null {
  const aliveOpponents = opponents.filter(p => p.reputation > 0);
  if (aliveOpponents.length === 0) return null;

  let bestTarget: Player | null = null;
  let highestScore = -Infinity;

  for (const opp of aliveOpponents) {
    let score = 2.0;

    // Leader disruption: extreme priority if close to victory (5+ crowns)
    if (opp.favor >= 6) score += 12.0;
    else if (opp.favor >= 4) score += 6.0;
    else if (opp.favor >= 2) score += 2.0;

    // Known cards check: if known to hold Heir or Knight, shuffle them away!
    if (botMemory.knowsPlayerHasRole(bot.id, opp.id, 'Наследник')) score += 8.0;
    if (botMemory.knowsPlayerHasRole(bot.id, opp.id, 'Рыцарь')) score += 4.0;
    if (botMemory.knowsPlayerHasRole(bot.id, opp.id, 'Казначей')) score += 3.0;

    score += (Math.random() - 0.5) * 0.8;

    if (score > highestScore) {
      highestScore = score;
      bestTarget = opp;
    }
  }

  return bestTarget || aliveOpponents[0];
}

/**
 * Evaluates target for "📜 Распустить слух" (Rumor - normal action, 6 gold for -1 crown on target)
 */
export function selectBestRumorTarget(opponents: Player[]): Player | null {
  const withCrowns = opponents.filter(p => p.reputation > 0 && p.favor > 0);
  if (withCrowns.length === 0) return null;

  // Strict priority on the highest crown holder
  return [...withCrowns].sort((a, b) => b.favor - a.favor)[0];
}

// ============================================================================
// 4. DYNAMIC RISK & DOUBT EVALUATION ENGINE
// ============================================================================

export interface DoubtDecision {
  shouldDoubt: boolean;
  score: number;
  reason: string;
}

/**
 * Calculates whether a bot should doubt a claimed role action or block claim.
 * Incorporates:
 * - Exact card counting (hand + discard pile + known cards via Spy: max 3 per deck)
 * - Strict third-party action filtering (bots ignore actions targeted at other players unless 2+ copies known or game-winning threat)
 * - 1 HP Survival Mode (strict caution: no speculative checks, only 100% proof or existential win-prevention)
 * - Existential threat ("Бросок на амбразуру" when someone attempts a game-winning 7th crown or coronation win)
 * - Win threat & tempo progression (leader with 5 crowns claiming Heir or Treasurer)
 * - Consecutive role claims / spam detection
 */
export function evaluateBotDoubt(
  bot: Player,
  actor: Player,
  claimedRole: Role,
  isBlockClaim = false,
  coronationCandidateId: string | null = null,
  targetId?: string,
  discardPile: Role[] = [],
  allPlayers: Player[] = []
): DoubtDecision {
  const archetype = getBotArchetype(bot.id);

  // 1. EXACT CARD ACCOUNTING (In 24-card deck, exactly 3 copies of each role exist)
  const countInHand = bot.hand.filter(r => r === claimedRole).length;
  const countInDiscard = discardPile.filter(r => r === claimedRole).length;
  
  // Count copies seen in other players' hands (excluding actor) via Spy
  let countKnownInOthers = 0;
  if (allPlayers.length > 0) {
    for (const p of allPlayers) {
      if (p.id !== bot.id && p.id !== actor.id && p.reputation > 0) {
        const knownRoles = botMemory.getKnownCardsForBot(bot.id, p.id);
        countKnownInOthers += knownRoles.filter(r => r === claimedRole).length;
      }
    }
  }

  const totalKnownExcluded = countInHand + countInDiscard + countKnownInOthers;

  // --------------------------------------------------------------------------
  // SCENARIO 1: 100% MATHEMATICAL PROOF (All 3 copies are accounted for elsewhere)
  // --------------------------------------------------------------------------
  if (totalKnownExcluded >= 3) {
    return {
      shouldDoubt: true,
      score: 1.0,
      reason: `Абсолютное разоблачение (все 3 копии «${claimedRole}» на виду: ${countInHand} в руке, ${countInDiscard} в сбросе)!`
    };
  }

  // --------------------------------------------------------------------------
  // SCENARIO 2: "БРОСОК НА АМБРАЗУРУ" — EXISTENTIAL GAME-WINNING THREAT
  // --------------------------------------------------------------------------
  // If actor reaching 7 crowns or completing coronation means instant loss for everyone:
  const isWinningAction =
    (claimedRole === 'Наследник' && actor.favor >= 6) ||
    (claimedRole === 'Шантажист' && actor.favor >= 6) ||
    (actor.id === coronationCandidateId);

  if (isWinningAction && !isBlockClaim) {
    // Inaction = 100% defeat for all other players.
    // Even at 1 HP, bot MUST jump to stop the win!
    const winStopScore = totalKnownExcluded >= 1 ? 0.96 : 0.88;
    return {
      shouldDoubt: Math.random() < winStopScore,
      score: winStopScore,
      reason: 'Бросок на амбразуру (остановка 100% победы лидера)!'
    };
  }

  // --------------------------------------------------------------------------
  // SCENARIO 3: THIRD-PARTY ACTIONS (Action is directed at another player)
  // --------------------------------------------------------------------------
  // E.g. Player A plays Intriguer/Spy on Player B, or Thief/Blackmailer on Player B
  const isThirdPartyAction = Boolean(targetId && targetId !== bot.id);
  if (isThirdPartyAction) {
    // A third-party player has NO reason to risk their life (❤️) for someone else's action,
    // UNLESS the bot holds 2 copies in hand (only 1 left in deck) AND has sufficient HP to gamble.
    if (totalKnownExcluded < 2) {
      return {
        shouldDoubt: false,
        score: 0.0,
        reason: `Чужой конфликт (цель: ${targetId}): нет смысла вмешиваться.`
      };
    }

    // With totalKnownExcluded === 2 (only 1 copy left in entire unknown game):
    if (bot.reputation === 1) {
      // At 1 HP, NEVER intervene in third-party actions!
      return {
        shouldDoubt: false,
        score: 0.0,
        reason: 'Чужой конфликт: режим выживания на 1 ❤️.'
      };
    }

    // At 2 HP or 3 HP with 2 copies known:
    let thirdPartyInterferenceChance = 0.0;
    if (bot.reputation === 3) {
      thirdPartyInterferenceChance = 0.35 * archetype.doubtAggression;
    } else if (bot.reputation === 2) {
      thirdPartyInterferenceChance = 0.12 * archetype.doubtAggression;
    }

    const shouldDoubt = Math.random() < thirdPartyInterferenceChance;
    return {
      shouldDoubt,
      score: thirdPartyInterferenceChance,
      reason: `Вмешательство со 2 копиями «${claimedRole}»: ${Math.round(thirdPartyInterferenceChance * 100)}%`
    };
  }

  // --------------------------------------------------------------------------
  // SCENARIO 4: 1 HP SURVIVAL MODE (Strict Caution)
  // --------------------------------------------------------------------------
  // "Бот с 1 хп вообще должен очень сейвово играть и проверять только в критическом случае"
  if (bot.reputation === 1) {
    // A bot with 1 HP dies instantly on a failed check.
    // Allowed only for:
    // 1) Guaranteed bluff (handled in Scenario 1: totalKnownExcluded >= 3)
    // 2) Existential win (handled in Scenario 2: isWinningAction)
    // 3) Extreme stakes: Leader with 5 crowns claiming Heir/Treasurer AND bot has 2 copies known (totalKnownExcluded === 2)
    if (totalKnownExcluded === 2 && actor.favor >= 5 && (claimedRole === 'Наследник' || claimedRole === 'Казначей')) {
      const desperateCheckScore = 0.35 * archetype.doubtAggression;
      const shouldDoubt = Math.random() < desperateCheckScore;
      return {
        shouldDoubt,
        score: desperateCheckScore,
        reason: `Критический риск на 1 ❤️ против опасного лидера (2 копии на руках/в сбросе).`
      };
    }

    // In all other regular situations at 1 HP: NEVER check!
    return {
      shouldDoubt: false,
      score: 0.0,
      reason: 'Режим выживания (1 ❤️): проверка не оправдана.'
    };
  }

  // --------------------------------------------------------------------------
  // SCENARIO 5: STANDARD ROLE EVALUATION (Bot has 2+ HP)
  // --------------------------------------------------------------------------
  // Base statistical suspicion based on known copies:
  let baseSuspicion = 0.03; // 0 known: 3 copies free in the wild -> minimal base suspicion
  if (totalKnownExcluded === 1) baseSuspicion = 0.12; // 1 known: 2 copies in the wild
  if (totalKnownExcluded === 2) baseSuspicion = 0.65; // 2 known: only 1 copy in the wild!

  let score = baseSuspicion * archetype.doubtAggression;

  // HP Scaling (2 HP vs 3 HP)
  if (bot.reputation === 3) {
    score *= 1.10; // HP cushion
  } else if (bot.reputation === 2) {
    score *= 0.80; // Measured caution
  }

  // Self-preservation when bot itself is leading (5-6 crowns)
  if (bot.favor >= 5 && totalKnownExcluded < 2) {
    score *= 0.60;
  }

  // Tactical leader disruption bonuses (for bots with 2+ HP)
  let tacticalBonus = 0;
  const consecutiveUsage = botMemory.getConsecutiveRoleClaims(actor.id, claimedRole);

  // 1. Leader at 5 crowns claiming Heir (+1 crown -> 6 crowns, 1 step from win!)
  if (actor.favor >= 5 && claimedRole === 'Наследник') {
    tacticalBonus += 0.35;
  }

  // 2. Leader at 5 crowns claiming Treasurer (+3 gold -> feast/rumor threat)
  if (actor.favor >= 5 && claimedRole === 'Казначей') {
    tacticalBonus += 0.30;
  }

  // 3. Leader at 4+ crowns claiming Blackmailer or Thief
  if (actor.favor >= 4 && (claimedRole === 'Шантажист' || claimedRole === 'Вор')) {
    tacticalBonus += 0.20;
  }

  // 4. Opponent with high gold (4+ gold) using economic roles
  if (actor.gold >= 4 && (claimedRole === 'Вор' || claimedRole === 'Казначей')) {
    tacticalBonus += 0.15;
  }

  // 5. Repetitive spam of the same role
  if (consecutiveUsage >= 2) {
    tacticalBonus += 0.20;
    if (totalKnownExcluded >= 1) tacticalBonus += 0.15; // Spamming while copies exist elsewhere!
  }
  if (consecutiveUsage >= 3) {
    tacticalBonus += 0.20;
  }

  // Archetype multiplier on tactical bonus
  let archetypeMod = 1.0;
  if (archetype.type === 'pragmatic') archetypeMod = 1.25;
  if (archetype.type === 'opportunist') archetypeMod = 1.30;
  if (archetype.type === 'provocateur') archetypeMod = 1.15;
  if (archetype.type === 'gambler') archetypeMod = 1.10;
  if (archetype.type === 'cautious') archetypeMod = actor.favor >= 5 ? 0.90 : 0.35;

  score += tacticalBonus * archetypeMod;

  // Cap score between 0.01 and 0.95
  score = Math.min(0.95, Math.max(0.01, score));

  const shouldDoubt = Math.random() < score;
  return {
    shouldDoubt,
    score,
    reason: `Оценка сомнения: ${Math.round(score * 100)}% (ХП: ${bot.reputation}, Копии: ${totalKnownExcluded}, Спам: ${consecutiveUsage})`
  };
}

// ============================================================================
// 5. BOT TIMERS & LIFECYCLE MANAGEMENT
// ============================================================================

let isBotEngineInitialized = false;
let botTurnTimeout: number | null = null;
let botDoubtTimeout: number | null = null;
let botBlockTimeout: number | null = null;

function clearBotTimers() {
  if (botTurnTimeout !== null) {
    clearTimeout(botTurnTimeout);
    botTurnTimeout = null;
  }
  if (botDoubtTimeout !== null) {
    clearTimeout(botDoubtTimeout);
    botDoubtTimeout = null;
  }
  if (botBlockTimeout !== null) {
    clearTimeout(botBlockTimeout);
    botBlockTimeout = null;
  }
}

export function startBotEngine() {
  if (isBotEngineInitialized) return;
  isBotEngineInitialized = true;

  useGameStore.subscribe((state, prevState) => {
    // ------------------------------------------------------------------------
    // 1. BOT TURN TO CHOOSE ACTION
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'IDLE' && (state.activePlayerId !== prevState.activePlayerId || state.turnPhase !== prevState.turnPhase)) {
      clearBotTimers();
      const activePlayer = state.players.find(p => p.id === state.activePlayerId);
      if (activePlayer && activePlayer.isBot && activePlayer.reputation > 0) {
        // Human-like deliberate thinking delay (2.0 - 2.8s)
        botTurnTimeout = window.setTimeout(() => {
          const cur = useGameStore.getState();
          if (cur.activePlayerId === activePlayer.id && cur.turnPhase === 'IDLE') {
            makeBotMove(activePlayer.id);
          }
        }, 2100 + Math.random() * 700);
      }
    }

    // ------------------------------------------------------------------------
    // 2. DOUBT WINDOW: Bots evaluating whether to challenge
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'DOUBT_WINDOW' && state.turnPhase !== prevState.turnPhase) {
      if (botDoubtTimeout !== null) clearTimeout(botDoubtTimeout);
      
      const { pendingAction, coronationCandidateId, discardPile, players } = state;
      if (!pendingAction || !pendingAction.roleClaim) return;

      const actor = players.find(p => p.id === pendingAction.actorId);
      if (!actor) return;

      // Track that this actor claimed this role (to detect continuous spamming)
      botMemory.recordRoleClaim(actor.id, pendingAction.roleClaim);

      // Observing living bots (not the actor)
      const observingBots = players.filter(
        p => p.isBot && p.id !== pendingAction.actorId && p.reputation > 0
      );

      // Evaluate each bot's doubt decision
      for (const bot of observingBots) {
        const decision = evaluateBotDoubt(
          bot,
          actor,
          pendingAction.roleClaim,
          false,
          coronationCandidateId,
          pendingAction.targetId,
          discardPile,
          players
        );

        if (decision.shouldDoubt) {
          // Give the human player 4.5 to 6.5 seconds to react first!
          const delay = 4800 + Math.random() * 2000;
          botDoubtTimeout = window.setTimeout(() => {
            const curState = useGameStore.getState();
            if (curState.turnPhase === 'DOUBT_WINDOW' && curState.pendingAction?.id === pendingAction.id) {
              curState.doubtAction(bot.id);
            }
          }, delay);
          break; // First bot to schedule doubt takes priority
        }
      }
    }

    // ------------------------------------------------------------------------
    // 3. TARGET REACTION WINDOW: Target bot chooses Accept / Direct Doubt / Duel
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'TARGET_REACTION_WINDOW' && state.turnPhase !== prevState.turnPhase) {
      if (botBlockTimeout !== null) clearTimeout(botBlockTimeout);
      
      const { pendingAction, discardPile, players } = state;
      if (!pendingAction || !pendingAction.targetId) return;

      const target = players.find(p => p.id === pendingAction.targetId);
      const attacker = players.find(p => p.id === pendingAction.actorId);
      if (target && target.isBot && target.reputation > 0 && attacker) {
        const blockingRole: Role = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
        const hasCard = target.hand.includes(blockingRole);
        const archetype = getBotArchetype(target.id);
        const cardIndex = hasCard ? target.hand.indexOf(blockingRole) : 0;

        // Evaluate whether to Direct Doubt (checking attacker's card)
        const doubtEval = evaluateBotDoubt(
          target, 
          attacker, 
          pendingAction.roleClaim!, 
          false, 
          null, 
          pendingAction.targetId, 
          discardPile, 
          players
        );

        let chosenAction: 'accept' | 'doubt' | 'duel' = 'accept';

        if (hasCard) {
          // Bot holds the real defense card -> 95% DECLARE DUEL!
          // Only direct doubt if mathematically 100% proven bluff
          if (doubtEval.shouldDoubt && doubtEval.score >= 0.98) {
            chosenAction = 'doubt';
          } else {
            chosenAction = 'duel';
          }
        } else {
          // Bot does not hold counter-card
          if (doubtEval.shouldDoubt && doubtEval.score >= 0.98) {
            // 100% proven lie -> free direct doubt
            chosenAction = 'doubt';
          } else {
            // Fake duel calculation based on role, HP, crowns, and archetype
            let fakeDuelChance = 0.0;

            if (pendingAction.roleClaim === 'Вор') {
              // Thief steals 2 gold
              if (target.reputation === 1) {
                // At 1 HP: losing 2 gold is minor, dying on fake duel is fatal -> 97% accept!
                fakeDuelChance = 0.03;
              } else if (target.reputation === 2) {
                fakeDuelChance = 0.20 * archetype.blockBluffRate;
              } else {
                fakeDuelChance = 0.45 * archetype.blockBluffRate;
              }
            } else if (pendingAction.roleClaim === 'Шантажист') {
              // Blackmailer steals 1 crown
              if (attacker.favor >= 6) {
                // Attacker reaching 7 crowns = instant win -> bot MUST contest!
                fakeDuelChance = target.reputation === 1 ? 0.75 : 0.90;
              } else if (target.favor >= 5) {
                // Protecting bot's own victory lead
                if (target.reputation === 1) fakeDuelChance = 0.30;
                else if (target.reputation === 2) fakeDuelChance = 0.65;
                else fakeDuelChance = 0.80;
              } else {
                // Standard Blackmailer defense
                if (target.reputation === 1) fakeDuelChance = 0.10;
                else if (target.reputation === 2) fakeDuelChance = 0.35 * archetype.blockBluffRate;
                else fakeDuelChance = 0.55 * archetype.blockBluffRate;
              }
            }

            if (Math.random() < fakeDuelChance) {
              chosenAction = 'duel';
            } else {
              chosenAction = 'accept';
            }
          }
        }

        botBlockTimeout = window.setTimeout(() => {
          const curState = useGameStore.getState();
          if (curState.turnPhase === 'TARGET_REACTION_WINDOW') {
            if (chosenAction === 'duel') {
              curState.targetDeclareDuel(target.id, cardIndex);
            } else if (chosenAction === 'doubt') {
              curState.targetDoubtAttack(target.id);
            } else {
              curState.targetAcceptAttack(target.id);
            }
          }
        }, 2200 + Math.random() * 800);
      }
    }

    // ------------------------------------------------------------------------
    // 4. DUEL ATTACKER WINDOW: Attacker bot decides whether to Retreat or Accept Duel
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'DUEL_ATTACKER_WINDOW' && state.turnPhase !== prevState.turnPhase) {
      const { pendingAction } = state;
      if (!pendingAction) return;

      const attacker = state.players.find(p => p.id === pendingAction.actorId);
      const defender = state.players.find(p => p.id === pendingAction.targetId);
      if (attacker && attacker.isBot && attacker.reputation > 0 && defender) {
        const archetype = getBotArchetype(attacker.id);
        const wasTruth = attacker.hand.includes(pendingAction.roleClaim!);

        let willAccept = false;
        if (wasTruth) {
          // If attacker really has the card, 100% ACCEPT DUEL!
          willAccept = true;
        } else {
          // Attacker bluffed
          if (attacker.reputation === 1) {
            // At 1 HP, NEVER risk death on a bluff duel -> 100% RETREAT!
            willAccept = false;
          } else if (defender.reputation === 1 && attacker.reputation >= 2) {
            // Defender at 1 HP: mutual bluff kills defender -> calculated risk for aggressive archetypes
            const riskChance = (archetype.type === 'gambler' || archetype.type === 'opportunist') ? 0.40 : 0.15;
            willAccept = Math.random() < riskChance;
          } else {
            // General bluff accept at 2+ HP
            const baseAccept = attacker.reputation === 3 ? 0.15 : 0.05;
            willAccept = Math.random() < (baseAccept * archetype.bluffRate);
          }
        }

        window.setTimeout(() => {
          const curState = useGameStore.getState();
          if (curState.turnPhase === 'DUEL_ATTACKER_WINDOW') {
            if (willAccept) {
              curState.attackerAcceptDuel(attacker.id);
            } else {
              curState.attackerRetreatDuel(attacker.id);
            }
          }
        }, 2000 + Math.random() * 800);
      }
    }
  });
}

// ============================================================================
// 6. BOT TURN ACTION LOGIC (Smart Decision Tree)
// ============================================================================

export function makeBotMove(botId: string) {
  const state = useGameStore.getState();
  const bot = state.players.find(p => p.id === botId);
  if (!bot || state.turnPhase !== 'IDLE' || bot.reputation <= 0) return;

  const opponents = state.players.filter(p => p.id !== bot.id && p.reputation > 0);
  if (opponents.length === 0) return;

  const archetype = getBotArchetype(bot.id);
  const leader = [...opponents].sort((a, b) => b.favor - a.favor)[0];

  // --------------------------------------------------------------------------
  // PRIORITY 1: IMMEDIATE WIN / CLOSING MOVE (6 Crowns -> 7th Crown)
  // (Note: The 7th crown CANNOT be bought via Feast, only Наследник or Шантажист!)
  // --------------------------------------------------------------------------
  if (bot.favor >= 6) {
    // 1. If bot holds "Наследник" -> claim Heir!
    if (bot.hand.includes('Наследник')) {
      useGameStore.getState().performAction({
        type: 'role',
        name: 'Наследник',
        roleClaim: 'Наследник',
        actorId: bot.id,
        costGold: 0,
        description: 'Заявляет «Наследник» и берет победную 7-ю 👑 (Коронация)!'
      });
      return;
    }

    // 2. If bot holds "Шантажист" and has 2+ gold -> steal 7th crown!
    if (bot.gold >= 2 && bot.hand.includes('Шантажист')) {
      const target = selectBestBlackmailerTarget(bot, opponents);
      if (target) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Шантажист',
          roleClaim: 'Шантажист',
          actorId: bot.id,
          targetId: target.id,
          costGold: 2,
          description: `Шантажирует ${target.name} и крадет победную 7-ю 👑!`
        });
        return;
      }
    }

    // 3. Smart closing bluff: Heir (or Blackmailer if 2 gold)
    let closingBluffChance = 0.65;
    if (bot.reputation === 1) closingBluffChance = 0.25; // Careful at 1 HP
    if (bot.reputation === 3) closingBluffChance = 0.85;

    if (Math.random() < closingBluffChance) {
      if (bot.gold >= 2 && Math.random() < 0.4) {
        const target = selectBestBlackmailerTarget(bot, opponents);
        if (target) {
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Шантажист',
            roleClaim: 'Шантажист',
            actorId: bot.id,
            targetId: target.id,
            costGold: 2,
            description: `Заявляет «Шантажист» против ${target.name} на 7-ю 👑!`
          });
          return;
        }
      }

      useGameStore.getState().performAction({
        type: 'role',
        name: 'Наследник',
        roleClaim: 'Наследник',
        actorId: bot.id,
        costGold: 0,
        description: 'Заявляет «Наследник» на победную 7-ю 👑!'
      });
      return;
    }
  }

  // --------------------------------------------------------------------------
  // PRIORITY 2: CRITICAL LEADER DISRUPTION
  // --------------------------------------------------------------------------
  // If leader has 6+ crowns or is coronation candidate, stop them!
  if (leader && leader.favor >= 6) {
    // If bot has 6 gold, use Rumor to strip 1 crown!
    if (bot.gold >= 6) {
      const rumorTarget = selectBestRumorTarget(opponents);
      if (rumorTarget) {
        useGameStore.getState().performAction({
          type: 'normal',
          name: '📜 Распустить слух',
          actorId: bot.id,
          targetId: rumorTarget.id,
          costGold: 6,
          description: `Заплатил 6 💰: ${rumorTarget.name} теряет 1 👑.`
        });
        return;
      }
    }

    // If bot has 2+ gold and holds "Шантажист", steal the crown from leader!
    if (bot.gold >= 2 && bot.hand.includes('Шантажист')) {
      const target = selectBestBlackmailerTarget(bot, opponents);
      if (target) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Шантажист',
          roleClaim: 'Шантажист',
          actorId: bot.id,
          targetId: target.id,
          costGold: 2,
          description: `Шантажирует ${target.name}: отнимает 1 👑!`
        });
        return;
      }
    }
  }

  // --------------------------------------------------------------------------
  // PRIORITY 3: FEAST (Normal Action: 3 Gold -> +1 Crown, MAX 6 CROWNS!)
  // --------------------------------------------------------------------------
  // Can only buy up to 6 crowns. Cannot buy the 7th crown!
  const feastChance = bot.favor >= 4 ? 0.65 : 0.40;
  if (bot.favor < 6 && bot.gold >= 3 && Math.random() < feastChance) {
    useGameStore.getState().performAction({
      type: 'normal',
      name: '🍷 Устроить пир',
      actorId: bot.id,
      costGold: 3,
      description: 'Заплатил 3 💰 и получил +1 👑.'
    });
    return;
  }

  // --------------------------------------------------------------------------
  // PRIORITY 4: HIGH GOLD RUMOR ON LEADER
  // --------------------------------------------------------------------------
  if (bot.gold >= 6 && leader && leader.favor >= 3) {
    const rumorTarget = selectBestRumorTarget(opponents);
    if (rumorTarget) {
      useGameStore.getState().performAction({
        type: 'normal',
        name: '📜 Распустить слух',
        actorId: bot.id,
        targetId: rumorTarget.id,
        costGold: 6,
        description: `Заплатил 6 💰: ${rumorTarget.name} теряет 1 👑.`
      });
      return;
    }
  }

  // --------------------------------------------------------------------------
  // PRIORITY 5: PLAY FROM HAND (True Role Actions)
  // --------------------------------------------------------------------------
  // Calculate probability of playing from hand vs bluffing
  let playFromHandRate = 0.80;
  if (bot.reputation === 1) playFromHandRate = 0.96; // 96% truth rate at 1 HP!
  if (bot.reputation === 3) playFromHandRate = 1.0 - archetype.bluffRate * 0.7;

  if (Math.random() < playFromHandRate && bot.hand.length > 0) {
    // Choose the best role from hand
    const handRoles = [...bot.hand];

    // Priority sorting of hand roles based on current needs
    if (handRoles.includes('Наследник')) {
      useGameStore.getState().performAction({
        type: 'role',
        name: 'Наследник',
        roleClaim: 'Наследник',
        actorId: bot.id,
        costGold: 0,
        description: 'Заявляет «Наследник» и берет +1 👑.'
      });
      return;
    }

    if (handRoles.includes('Шантажист') && bot.gold >= 2) {
      const target = selectBestBlackmailerTarget(bot, opponents);
      if (target) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Шантажист',
          roleClaim: 'Шантажист',
          actorId: bot.id,
          targetId: target.id,
          costGold: 2,
          description: `Шантажирует ${target.name}: отнимает 1 👑!`
        });
        return;
      }
    }

    if (handRoles.includes('Казначей')) {
      useGameStore.getState().performAction({
        type: 'role',
        name: 'Казначей',
        roleClaim: 'Казначей',
        actorId: bot.id,
        costGold: 0,
        description: 'Заявляет «Казначей» и берет +3 💰.'
      });
      return;
    }

    if (handRoles.includes('Вор')) {
      const target = selectBestThiefTarget(bot, opponents);
      if (target && target.gold > 0) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Вор',
          roleClaim: 'Вор',
          actorId: bot.id,
          targetId: target.id,
          costGold: 0,
          description: `Заявляет «Вор» и забирает до 2 💰 у ${target.name}.`
        });
        return;
      }
    }

    if (handRoles.includes('Шут')) {
      useGameStore.getState().performAction({
        type: 'role',
        name: 'Шут',
        roleClaim: 'Шут',
        actorId: bot.id,
        costGold: 0,
        description: 'Заявляет «Шут» и получает +2 💰.'
      });
      return;
    }

    if (handRoles.includes('Рыцарь')) {
      useGameStore.getState().performAction({
        type: 'role',
        name: 'Рыцарь',
        roleClaim: 'Рыцарь',
        actorId: bot.id,
        costGold: 0,
        description: 'Заявляет «Рыцарь» и получает +2 💰.'
      });
      return;
    }

    if (handRoles.includes('Шпион')) {
      const target = selectBestSpyTarget(bot, opponents);
      if (target) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Шпион',
          roleClaim: 'Шпион',
          actorId: bot.id,
          targetId: target.id,
          targetCardIndex: Math.floor(Math.random() * 2),
          costGold: 0,
          description: `Шпионит за картами ${target.name}.`
        });
        return;
      }
    }

    if (handRoles.includes('Интриган')) {
      const target = selectBestIntriguerTarget(bot, opponents);
      if (target) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Интриган',
          roleClaim: 'Интриган',
          actorId: bot.id,
          targetId: target.id,
          costGold: 0,
          description: `Заявляет «Интриган» и перемешивает обе карты у ${target.name}!`
        });
        return;
      }
    }
  }

  // --------------------------------------------------------------------------
  // PRIORITY 6: SMART BLUFF OR SAFE INCOME
  // --------------------------------------------------------------------------
  let bluffChance = archetype.bluffRate;
  if (bot.reputation === 1) bluffChance = 0.03; // Extremely safe: barely any bluffing at 1 HP!
  if (bot.favor >= 5 && bot.reputation === 1) bluffChance = 0.01; // Protect lead at 1 HP!

  if (Math.random() < bluffChance) {
    // Choose an intelligent bluff role
    const possibleBluffs: Role[] = [];

    if (bot.favor >= 4) possibleBluffs.push('Наследник');
    if (bot.gold < 3) possibleBluffs.push('Казначей', 'Рыцарь', 'Шут');
    if (bot.gold >= 2 && leader && leader.favor > 0) possibleBluffs.push('Шантажист');
    
    const richest = selectBestThiefTarget(bot, opponents);
    if (richest && richest.gold >= 2) possibleBluffs.push('Вор');

    const chosenBluff = possibleBluffs[Math.floor(Math.random() * possibleBluffs.length)] || 'Казначей';

    if (chosenBluff === 'Вор') {
      const target = selectBestThiefTarget(bot, opponents);
      if (target) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Вор',
          roleClaim: 'Вор',
          actorId: bot.id,
          targetId: target.id,
          costGold: 0,
          description: `Заявляет «Вор» против ${target.name}.`
        });
        return;
      }
    }

    if (chosenBluff === 'Шантажист' && bot.gold >= 2) {
      const target = selectBestBlackmailerTarget(bot, opponents);
      if (target) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Шантажист',
          roleClaim: 'Шантажист',
          actorId: bot.id,
          targetId: target.id,
          costGold: 2,
          description: `Заявляет «Шантажист» против ${target.name}.`
        });
        return;
      }
    }

    // Non-targeted bluff (Наследник, Казначей, Рыцарь, Шут)
    useGameStore.getState().performAction({
      type: 'role',
      name: chosenBluff,
      roleClaim: chosenBluff,
      actorId: bot.id,
      costGold: 0,
      description: `Заявляет «${chosenBluff}».`
    });
    return;
  }

  // Safe fallback: Swap card if holding unhelpful duplicates, otherwise normal income
  if (bot.hand.length >= 2 && bot.hand[0] === bot.hand[1] && Math.random() < 0.5) {
    useGameStore.getState().performAction({
      type: 'normal',
      name: '🔄 Сменить карту',
      actorId: bot.id,
      stakedCardIndex: 1,
      costGold: 0,
      description: 'Замешивает дубликат карты в колоду и берет новую.'
    });
    return;
  }

  useGameStore.getState().performAction({
    type: 'normal',
    name: '🪙 Просить содержание',
    actorId: bot.id,
    costGold: 0,
    description: 'Просит содержание и берет 1 💰.'
  });
}
