import { useGameStore } from './GameStore';
import type { Role, PlotType, GameCard, Player, BotArchetype } from './types';
import { isRole, isPlot } from './cards';

// ============================================================================
// 1. BOT ARCHETYPES / PERSONALITIES
// ============================================================================

export const BOT_ARCHETYPES: Record<string, BotArchetype> = {
  b1: {
    type: 'gambler',
    title: 'Азартная',
    badge: '🎲',
    description: 'Любит рисковать, часто блефует, бросает Ва-банк и проверяет других.',
    bluffRate: 0.55,
    doubtAggression: 1.35,
    blockBluffRate: 0.50,
    greed: 0.5,
    targetAggression: 0.7
  },
  b2: {
    type: 'cautious',
    title: 'Стратег',
    badge: '🛡️',
    description: 'Осторожный консерватор, приберегает жетоны и Вето, играет надежно.',
    bluffRate: 0.18,
    doubtAggression: 0.75,
    blockBluffRate: 0.20,
    greed: 0.6,
    targetAggression: 0.5
  },
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
  b4: {
    type: 'provocateur',
    title: 'Провокатор',
    badge: '🎭',
    description: 'Любит ловушки Шутом, плетет Интриги и провоцирует соперников.',
    bluffRate: 0.48,
    doubtAggression: 1.25,
    blockBluffRate: 0.45,
    greed: 0.7,
    targetAggression: 0.8
  },
  b5: {
    type: 'opportunist',
    title: 'Оппортунист',
    badge: '🗡️',
    description: 'Следит за лидерами, вешает Досье и бьет по уязвимым местам.',
    bluffRate: 0.32,
    doubtAggression: 1.1,
    blockBluffRate: 0.35,
    greed: 0.55,
    targetAggression: 0.9
  }
};

export function getBotArchetype(botOrId: Player | string): BotArchetype {
  if (typeof botOrId !== 'string' && botOrId.archetype) {
    return botOrId.archetype;
  }
  const id = typeof botOrId === 'string' ? botOrId : botOrId.id;
  return BOT_ARCHETYPES[id] || {
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
  role: GameCard;
  knownByBotIds: string[];
}

class BotMemoryEngine {
  private knownCards: KnownCardRecord[] = [];
  private consecutiveRoleClaims: Record<string, { role: Role; count: number }> = {};

  public recordSpyPeek(botId: string, targetId: string, cardIndex: number, seenRole: GameCard) {
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

  public recordCardInSlot(targetId: string, cardIndex: number, role: GameCard, observerId: string) {
    this.knownCards = this.knownCards.filter(
      k => !(k.playerId === targetId && k.cardIndex === cardIndex)
    );
    this.knownCards.push({
      playerId: targetId,
      cardIndex,
      role,
      knownByBotIds: [observerId]
    });
  }

  public recordInformantPeek(observerId: string, targetId: string, seenRole: GameCard) {
    this.knownCards.push({
      playerId: targetId,
      cardIndex: 0,
      role: seenRole,
      knownByBotIds: [observerId]
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

  public recordRevealedCard(targetId: string, role: GameCard) {
    this.knownCards = this.knownCards.filter(k => !(k.playerId === targetId && k.role === role));
    if (isRole(role) && this.consecutiveRoleClaims[targetId]?.role === role) {
      this.consecutiveRoleClaims[targetId] = { role, count: 0 };
    }
  }

  public invalidatePlayerHand(playerId: string) {
    this.knownCards = this.knownCards.filter(k => k.playerId !== playerId);
    delete this.consecutiveRoleClaims[playerId];
  }

  public getKnownCardsForBot(botId: string, targetId: string): GameCard[] {
    return this.knownCards
      .filter(k => k.playerId === targetId && k.knownByBotIds.includes(botId))
      .map(k => k.role);
  }

  public clear() {
    this.knownCards = [];
    this.consecutiveRoleClaims = {};
  }
}

export const botMemory = new BotMemoryEngine();

// ============================================================================
// 3. TARGET SELECTION HELPERS
// ============================================================================

export function selectBestThiefTarget(bot: Player, opponents: Player[]): Player | null {
  const archetype = getBotArchetype(bot.id);
  const valid = opponents.filter(p => p.gold > 0);
  if (valid.length === 0) return null;

  valid.sort((a, b) => {
    const scoreA = (a.gold * 1.5) + (a.favor * 2.0 * archetype.targetAggression);
    const scoreB = (b.gold * 1.5) + (b.favor * 2.0 * archetype.targetAggression);
    return scoreB - scoreA;
  });

  return valid[0];
}

export function selectBestBlackmailerTarget(_bot: Player, opponents: Player[]): Player | null {
  const valid = opponents.filter(p => p.favor > 0);
  if (valid.length === 0) return null;

  valid.sort((a, b) => b.favor - a.favor);
  return valid[0];
}

export function selectBestSpyTarget(_bot: Player, opponents: Player[]): Player | null {
  const valid = [...opponents];
  valid.sort((a, b) => (b.favor * 2 + b.gold) - (a.favor * 2 + a.gold));
  return valid[0] || null;
}

export function selectBestRumorTarget(opponents: Player[]): Player | null {
  const valid = opponents.filter(p => p.favor > 0);
  if (valid.length === 0) return null;

  valid.sort((a, b) => b.favor - a.favor);
  return valid[0];
}

// ============================================================================
// 4. SMART DOUBT EVALUATION ENGINE
// ============================================================================

export interface DoubtDecision {
  shouldDoubt: boolean;
  score: number;
  reason: string;
}

export function evaluateBotDoubt(
  bot: Player,
  actor: Player,
  claimedRole: Role,
  _isTargetedDirectDoubt: boolean,
  coronationCandidateId: string | null,
  targetId: string | undefined,
  discardPile: GameCard[],
  _allPlayers: Player[]
): DoubtDecision {
  // If bot has 0 action tokens, cannot doubt!
  if (bot.actionTokens < 1) {
    return { shouldDoubt: false, score: 0, reason: 'Нет жетонов действия' };
  }

  const archetype = getBotArchetype(bot.id);

  // 1. Calculate how many copies of claimedRole are known to not be in actor's hand
  const copiesInDiscard = discardPile.filter(c => c === claimedRole).length;
  const copiesInBotHand = bot.hand.filter(c => c === claimedRole).length;
  const totalKnownExcluded = copiesInDiscard + copiesInBotHand;

  // 3 copies exist per role in standard 37-card deck
  if (totalKnownExcluded >= 3) {
    return {
      shouldDoubt: true,
      score: 1.0,
      reason: `Математически невозможно: все 3 копии «${claimedRole}» на виду!`
    };
  }

  let baseBluffProb = 0.35;
  if (totalKnownExcluded === 2) baseBluffProb = 0.85;
  else if (totalKnownExcluded === 1) baseBluffProb = 0.55;

  let score = baseBluffProb * archetype.doubtAggression;

  // Track spamming
  const consecutiveUsage = botMemory.getConsecutiveRoleClaims(actor.id, claimedRole);
  if (consecutiveUsage >= 2) {
    score += 0.25 * (consecutiveUsage - 1);
  }

  // Tactical situational adjustments
  let tacticalBonus = 0;
  if (claimedRole === 'Наследник' && actor.favor >= 4) {
    tacticalBonus += 0.45;
  }
  if (coronationCandidateId === actor.id) {
    tacticalBonus += 0.50;
  }
  if (claimedRole === 'Шантажист' && targetId === bot.id && bot.favor >= 3) {
    tacticalBonus += 0.30;
  }
  if (bot.activePlot && bot.activePlot.type === 'Чёрная книга') {
    tacticalBonus += 0.20;
  }

  let archetypeMod = 1.0;
  if (archetype.type === 'gambler') archetypeMod = 1.25;
  if (archetype.type === 'cautious') archetypeMod = 0.80;

  score += tacticalBonus * archetypeMod;
  score += (Math.random() - 0.5) * 0.08;

  const threshold = 0.42;
  const shouldDoubt = score >= threshold;

  return {
    shouldDoubt,
    score: Math.min(1.0, Math.max(0.0, score)),
    reason: `Оценка сомнения: ${Math.round(score * 100)}%`
  };
}

// ============================================================================
// 5. BOT ENGINE REACTIVE LISTENERS
// ============================================================================

let botActionTimeout: number | null = null;
let botDoubtTimeout: number | null = null;
let botBlockTimeout: number | null = null;
let botDuelTimeout: number | null = null;

export function startBotEngine() {
  useGameStore.subscribe((state, prevState) => {
    // ------------------------------------------------------------------------
    // 1. IDLE TURN: Active Bot chooses action
    // ------------------------------------------------------------------------
    if (
      state.turnPhase === 'IDLE' && 
      !state.pendingAction && 
      !state.revealOutcome && 
      !state.duelOutcome && 
      !state.spyPeekData && 
      !state.informantPeekData
    ) {
      const activePlayer = state.players.find(p => p.id === state.activePlayerId);
      if (activePlayer && activePlayer.isBot) {
        // If active player changed OR no timeout is pending, schedule fresh move
        if (botActionTimeout === null || state.activePlayerId !== prevState?.activePlayerId) {
          if (botActionTimeout !== null) {
            clearTimeout(botActionTimeout);
            botActionTimeout = null;
          }
          botActionTimeout = window.setTimeout(() => {
            botActionTimeout = null;
            const curState = useGameStore.getState();
            if (curState.turnPhase === 'IDLE' && !curState.pendingAction) {
              makeBotMove(curState.activePlayerId);
            }
          }, 800 + Math.random() * 400);
        }
      } else {
        if (botActionTimeout !== null) {
          clearTimeout(botActionTimeout);
          botActionTimeout = null;
        }
      }
    } else {
      if (botActionTimeout !== null) {
        clearTimeout(botActionTimeout);
        botActionTimeout = null;
      }
    }

    // ------------------------------------------------------------------------
    // 2. DOUBT WINDOW: Observing bots evaluate whether to challenge
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'DOUBT_WINDOW' && state.turnPhase !== prevState?.turnPhase) {
      if (botDoubtTimeout !== null) {
        clearTimeout(botDoubtTimeout);
        botDoubtTimeout = null;
      }

      const { pendingAction, players, discardPile, coronationCandidateId } = state;
      if (!pendingAction || !pendingAction.roleClaim) return;

      const actor = players.find(p => p.id === pendingAction.actorId);
      if (!actor) return;

      const observingBots = players.filter(
        p => p.isBot && p.id !== pendingAction.actorId && p.actionTokens >= 1
      );

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
          const delay = 1600 + Math.random() * 1600;
          botDoubtTimeout = window.setTimeout(() => {
            botDoubtTimeout = null;
            const curState = useGameStore.getState();
            if (curState.turnPhase === 'DOUBT_WINDOW') {
              curState.doubtAction(bot.id);
            }
          }, delay);
          break;
        }
      }
    }

    // ------------------------------------------------------------------------
    // 3. TARGET REACTION WINDOW: Target bot chooses Accept / Direct Doubt / Duel / Redirection
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'TARGET_REACTION_WINDOW' && state.turnPhase !== prevState.turnPhase) {
      if (botBlockTimeout !== null) {
        clearTimeout(botBlockTimeout);
        botBlockTimeout = null;
      }
      
      const { pendingAction, discardPile, players } = state;
      if (!pendingAction || !pendingAction.targetId) return;

      const target = players.find(p => p.id === pendingAction.targetId);
      const attacker = players.find(p => p.id === pendingAction.actorId);
      if (target && target.isBot && attacker) {
        const redirectIdx = target.hand.indexOf('Перенаправление');
        if (redirectIdx !== -1 && Math.random() < 0.70) {
          const otherOpponents = players.filter(p => p.id !== attacker.id && p.id !== target.id);
          if (otherOpponents.length > 0) {
            const newTarget = otherOpponents[0];
            botBlockTimeout = window.setTimeout(() => {
              botBlockTimeout = null;
              const curState = useGameStore.getState();
              if (curState.turnPhase === 'TARGET_REACTION_WINDOW') {
                curState.playInstant(target.id, 'Перенаправление', redirectIdx, newTarget.id);
              }
            }, 1200);
            return;
          }
        }

        const blockingRole: Role = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
        const hasCard = target.hand.includes(blockingRole);
        const archetype = getBotArchetype(target.id);
        const cardIndex = hasCard ? target.hand.indexOf(blockingRole) : 0;

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
          if (doubtEval.shouldDoubt && doubtEval.score >= 0.98 && target.actionTokens >= 1) {
            chosenAction = 'doubt';
          } else {
            chosenAction = 'duel';
          }
        } else {
          if (doubtEval.shouldDoubt && doubtEval.score >= 0.98 && target.actionTokens >= 1) {
            chosenAction = 'doubt';
          } else {
            let fakeDuelChance = 0.25 * archetype.blockBluffRate;
            if (pendingAction.roleClaim === 'Шантажист' && target.favor >= 4) {
              fakeDuelChance = 0.65;
            }

            if (Math.random() < fakeDuelChance) {
              chosenAction = 'duel';
            } else {
              chosenAction = 'accept';
            }
          }
        }

        botBlockTimeout = window.setTimeout(() => {
          botBlockTimeout = null;
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
        }, 1800 + Math.random() * 800);
      }
    }

    // ------------------------------------------------------------------------
    // 4. DUEL ATTACKER WINDOW: Attacker bot decides whether to Retreat or Accept Duel
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'DUEL_ATTACKER_WINDOW' && state.turnPhase !== prevState.turnPhase) {
      if (botDuelTimeout !== null) {
        clearTimeout(botDuelTimeout);
        botDuelTimeout = null;
      }

      const { pendingAction } = state;
      if (!pendingAction) return;

      const attacker = state.players.find(p => p.id === pendingAction.actorId);
      const defender = state.players.find(p => p.id === pendingAction.targetId);
      if (attacker && attacker.isBot && defender) {
        const archetype = getBotArchetype(attacker.id);
        const wasTruth = attacker.hand.includes(pendingAction.roleClaim!);

        let willAccept = false;
        if (wasTruth) {
          willAccept = true;
        } else {
          const baseAccept = (archetype.type === 'gambler' || archetype.type === 'provocateur') ? 0.35 : 0.10;
          willAccept = Math.random() < baseAccept;
        }

        botDuelTimeout = window.setTimeout(() => {
          botDuelTimeout = null;
          const curState = useGameStore.getState();
          if (curState.turnPhase === 'DUEL_ATTACKER_WINDOW') {
            if (willAccept) {
              curState.attackerAcceptDuel(attacker.id);
            } else {
              curState.attackerRetreatDuel(attacker.id);
            }
          }
        }, 1600 + Math.random() * 800);
      }
    }

    // ------------------------------------------------------------------------
    // 5. VETO_WINDOW: Bots decide whether to drop Veto (Право вето)
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'VETO_WINDOW' && state.turnPhase !== prevState.turnPhase) {
      const { pendingAction, players, isVetoed } = state;
      if (pendingAction && !isVetoed) {
        const vetoBots = players.filter(p => p.isBot && p.id !== pendingAction.actorId && p.hand.includes('Право вето') && p.actionTokens >= 1);
        for (const bot of vetoBots) {
          let shouldVeto = false;
          // If targeted attack against this bot
          if (pendingAction.targetId === bot.id) {
            shouldVeto = true;
          }
          // If heir taking 6th crown
          const actor = players.find(p => p.id === pendingAction.actorId);
          if (pendingAction.roleClaim === 'Наследник' && actor && actor.favor >= 5) {
            shouldVeto = true;
          }

          if (shouldVeto || Math.random() < 0.35) {
            const vetoIdx = bot.hand.indexOf('Право вето');
            window.setTimeout(() => {
              const cur = useGameStore.getState();
              if (cur.turnPhase === 'VETO_WINDOW' && !cur.isVetoed) {
                cur.playInstant(bot.id, 'Право вето', vetoIdx);
              }
            }, 1200 + Math.random() * 600);
            break;
          }
        }
      }
    }
  });
}

// ============================================================================
// 6. BOT TURN ACTION LOGIC
// ============================================================================

export function makeBotMove(botId: string) {
  if (botActionTimeout !== null) {
    clearTimeout(botActionTimeout);
    botActionTimeout = null;
  }

  let state = useGameStore.getState();
  if (state.turnPhase !== 'IDLE' || state.activePlayerId !== botId || state.pendingAction) return;

  const bot = state.players.find(p => p.id === botId);
  if (!bot || !bot.isBot) return;

  if (bot.actionTokens <= 0) {
    state.endTurn();
    return;
  }

  const opponents = state.players.filter(p => p.id !== bot.id);
  if (opponents.length === 0) return;

  const archetype = getBotArchetype(bot.id);
  const leader = [...opponents].sort((a, b) => b.favor - a.favor)[0];

  // --------------------------------------------------------------------------
  // STEP 1: NORMAL ACTION PHASE (Phase 2)
  // --------------------------------------------------------------------------
  if (state.turnSubPhase === 'NORMAL_ACTION_PHASE' && !state.hasUsedNormalActionThisTurn) {
    // 1. Critical leader rumor
    if (leader && leader.favor >= 5 && bot.gold >= 5) {
      const rumorTarget = selectBestRumorTarget(opponents);
      if (rumorTarget) {
        useGameStore.getState().performAction({
          type: 'normal',
          name: '📜 Распустить слух',
          actorId: bot.id,
          targetId: rumorTarget.id,
          costGold: 5,
          costTokens: 1,
          description: `Заплатил 5 💰: ${rumorTarget.name} теряет 1 👑.`
        });
        return;
      }
    }

    // 2. Feast if high crowns / high gold (up to 5 crowns)
    const feastChance = bot.favor >= 4 ? 0.75 : 0.40;
    if (bot.favor < 5 && bot.gold >= 3 && Math.random() < feastChance) {
      useGameStore.getState().performAction({
        type: 'normal',
        name: '🍷 Устроить пир',
        actorId: bot.id,
        costGold: 3,
        costTokens: 1,
        description: 'Заплатил 3 💰 и получил +1 👑.'
      });
      return;
    }

    // 3. High gold rumor
    if (bot.gold >= 5 && leader && leader.favor >= 3 && Math.random() < 0.60) {
      const rumorTarget = selectBestRumorTarget(opponents);
      if (rumorTarget) {
        useGameStore.getState().performAction({
          type: 'normal',
          name: '📜 Распустить слух',
          actorId: bot.id,
          targetId: rumorTarget.id,
          costGold: 5,
          costTokens: 1,
          description: `Заплатил 5 💰: ${rumorTarget.name} теряет 1 👑.`
        });
        return;
      }
    }

    // 4. Low gold ask stipend
    if (bot.gold < 1 && Math.random() < 0.35) {
      useGameStore.getState().performAction({
        type: 'normal',
        name: '🪙 Просить содержание',
        actorId: bot.id,
        costGold: 0,
        costTokens: 1,
        description: 'Просит содержание и берет 1 💰.'
      });
      return;
    }

    // 5. Swap unneeded card (Free in gold: 0 💰, 1 ⚡)
    if (bot.hand.length > 0 && Math.random() < 0.20) {
      const badIdx = bot.hand.findIndex(c => c === 'Шпион' || c === 'Дворцовый переполох' || c === 'Право вето' || c === 'Перенаправление');
      if (badIdx !== -1) {
        useGameStore.getState().performAction({
          type: 'normal',
          name: '🔄 Сменить карту',
          actorId: bot.id,
          stakedCardIndex: badIdx,
          costGold: 0,
          costTokens: 1,
          description: 'Сбросил карту и бесплатно взял новую из колоды.'
        });
        return;
      }
    }

    // Otherwise, skip Phase 2 and proceed directly to Card Play Phase (Phase 3)
    useGameStore.getState().skipNormalActionPhase();
    state = useGameStore.getState();
  }

  // --------------------------------------------------------------------------
  // STEP 2: CARD PLAY PHASE (Phase 3)
  // --------------------------------------------------------------------------

  // Priority 1: Play Plot (🎴) if not active and not played this turn
  if (!bot.activePlot && !state.hasPlayedPlotThisTurn) {
    const plotIdx = bot.hand.findIndex(isPlot);
    if (plotIdx !== -1) {
      const plotCard = bot.hand[plotIdx] as PlotType;
      
      if (plotCard === 'Королевский приём') {
        if (bot.gold >= 2 || bot.hand.includes('Казначей') || bot.hand.includes('Рыцарь') || Math.random() < 0.7) {
          useGameStore.getState().playPlotAction('Королевский приём', plotIdx);
          return;
        }
      } else if (plotCard === 'Досье') {
        const target = leader && leader.favor >= 2 ? leader : opponents[0];
        useGameStore.getState().playPlotAction('Досье', plotIdx, target.id);
        return;
      } else if (plotCard === 'Чёрная книга') {
        useGameStore.getState().playPlotAction('Чёрная книга', plotIdx);
        return;
      } else if (plotCard === 'Сеть информаторов') {
        useGameStore.getState().playPlotAction('Сеть информаторов', plotIdx);
        return;
      }
    }
  }

  // Priority 2: Play Instant (⚡) (e.g. Spy, Palace upheaval)
  const spyIdx = bot.hand.indexOf('Шпион');
  if (spyIdx !== -1 && Math.random() < 0.7) {
    const target = selectBestSpyTarget(bot, opponents);
    if (target) {
      useGameStore.getState().playInstant(bot.id, 'Шпион', spyIdx, target.id);
      return;
    }
  }

  const upheavalIdx = bot.hand.indexOf('Дворцовый переполох');
  if (upheavalIdx !== -1 && leader && leader.favor >= 3 && Math.random() < 0.65) {
    useGameStore.getState().playInstant(bot.id, 'Дворцовый переполох', upheavalIdx, leader.id);
    return;
  }

  // Priority 3: Play Role if not played this turn
  if (!state.hasPlayedRoleThisTurn && bot.hand.length > 0) {
    const hasVaBanque = bot.hand.includes('Ва-банк') && bot.actionTokens >= 1;
    const withVB = hasVaBanque && ((archetype.type === 'gambler' || archetype.type === 'provocateur') ? Math.random() < 0.65 : Math.random() < 0.25);
    const vbTokens = 1;

    // Immediate win (5 Crowns -> 6th Crown)
    if (bot.favor === 5) {
      if (bot.hand.includes('Наследник')) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Наследник',
          roleClaim: 'Наследник',
          actorId: bot.id,
          stakedCardIndex: bot.hand.indexOf('Наследник'),
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Наследник»${withVB ? ' под Ва-банком' : ''} и берет победную 6-ю 👑 (Круг Коронации)!`
        });
        return;
      }

      if (bot.hand.includes('Шантажист')) {
        const target = selectBestBlackmailerTarget(bot, opponents);
        if (target) {
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Шантажист',
            roleClaim: 'Шантажист',
            actorId: bot.id,
            targetId: target.id,
            stakedCardIndex: bot.hand.indexOf('Шантажист'),
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Шантажирует ${target.name}${withVB ? ' под Ва-банком' : ''} и крадет победную 6-ю 👑!`
          });
          return;
        }
      }

      // Closing bluff
      const closingBluffChance = 0.70;
      if (Math.random() < closingBluffChance) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Наследник',
          roleClaim: 'Наследник',
          actorId: bot.id,
          stakedCardIndex: 0,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Наследник»${withVB ? ' под Ва-банком' : ''} на победную 6-ю 👑!`
        });
        return;
      }
    }

    // Role from hand
    const playFromHandRate = 1.0 - archetype.bluffRate * 0.6;
    if (Math.random() < playFromHandRate) {
      if (bot.hand.includes('Наследник')) {
        const handIdx = bot.hand.indexOf('Наследник');
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Наследник',
          roleClaim: 'Наследник',
          actorId: bot.id,
          stakedCardIndex: handIdx,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Наследник»${withVB ? ' под Ва-банком' : ''} и берет +1 👑.`
        });
        return;
      }

      if (bot.hand.includes('Шантажист')) {
        const target = selectBestBlackmailerTarget(bot, opponents);
        if (target) {
          const handIdx = bot.hand.indexOf('Шантажист');
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Шантажист',
            roleClaim: 'Шантажист',
            actorId: bot.id,
            targetId: target.id,
            stakedCardIndex: handIdx,
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Шантажирует ${target.name}${withVB ? ' под Ва-банком' : ''}: отнимает 1 👑!`
          });
          return;
        }
      }

      if (bot.hand.includes('Казначей')) {
        const handIdx = bot.hand.indexOf('Казначей');
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Казначей',
          roleClaim: 'Казначей',
          actorId: bot.id,
          stakedCardIndex: handIdx,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Казначей»${withVB ? ' под Ва-банком' : ''} и берет +3 💰.`
        });
        return;
      }

      if (bot.hand.includes('Вор')) {
        const target = selectBestThiefTarget(bot, opponents);
        if (target && target.gold > 0) {
          const handIdx = bot.hand.indexOf('Вор');
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Вор',
            roleClaim: 'Вор',
            actorId: bot.id,
            targetId: target.id,
            stakedCardIndex: handIdx,
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Заявляет «Вор»${withVB ? ' под Ва-банком' : ''} и забирает до 2 💰 у ${target.name}.`
          });
          return;
        }
      }

      if (bot.hand.includes('Шут')) {
        const handIdx = bot.hand.indexOf('Шут');
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Шут',
          roleClaim: 'Шут',
          actorId: bot.id,
          stakedCardIndex: handIdx,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Шут»${withVB ? ' под Ва-банком' : ''} и получает +2 💰.`
        });
        return;
      }

      if (bot.hand.includes('Рыцарь')) {
        const handIdx = bot.hand.indexOf('Рыцарь');
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Рыцарь',
          roleClaim: 'Рыцарь',
          actorId: bot.id,
          stakedCardIndex: handIdx,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Рыцарь»${withVB ? ' под Ва-банком' : ''} и получает +2 💰.`
        });
        return;
      }
    }

    // Role Bluff or Guaranteed Action if 2 Tokens Left
    const mustAct = bot.actionTokens >= 2 && !state.hasUsedNormalActionThisTurn && !state.hasPlayedPlotThisTurn;
    if (mustAct || Math.random() < archetype.bluffRate) {
      const possibleBluffs: Role[] = [];
      if (bot.favor >= 3) possibleBluffs.push('Наследник');
      if (bot.gold < 3) possibleBluffs.push('Казначей', 'Рыцарь', 'Шут');
      if (leader && leader.favor > 0) possibleBluffs.push('Шантажист');
      
      const richest = selectBestThiefTarget(bot, opponents);
      if (richest && richest.gold >= 2) possibleBluffs.push('Вор');

      const chosenBluff = possibleBluffs.length > 0 
        ? possibleBluffs[Math.floor(Math.random() * possibleBluffs.length)] 
        : 'Казначей';

      if (chosenBluff === 'Вор') {
        const target = selectBestThiefTarget(bot, opponents);
        if (target && target.gold > 0) {
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Вор',
            roleClaim: 'Вор',
            actorId: bot.id,
            targetId: target.id,
            stakedCardIndex: 0,
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Блефует: заявляет «Вор»${withVB ? ' под Ва-банком' : ''} на ${target.name}.`
          });
          return;
        }
      }

      if (chosenBluff === 'Шантажист') {
        const target = selectBestBlackmailerTarget(bot, opponents);
        if (target && target.favor > 0) {
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Шантажист',
            roleClaim: 'Шантажист',
            actorId: bot.id,
            targetId: target.id,
            stakedCardIndex: 0,
            costGold: 0,
            costTokens: 1,
            description: `Заявляет «Шантажист» против ${target.name}.`
          });
          return;
        }
      }

      const safeClaim = (chosenBluff === 'Вор' || chosenBluff === 'Шантажист') ? 'Казначей' : chosenBluff;

      useGameStore.getState().performAction({
        type: 'role',
        name: safeClaim,
        roleClaim: safeClaim,
        actorId: bot.id,
        stakedCardIndex: 0,
        costGold: 0,
        costTokens: 1,
        description: `Заявляет «${safeClaim}».`
      });
      return;
    }
  }

  // If bot reached here and has remaining tokens, end turn to save token for defense
  useGameStore.getState().endTurnManually();
}

