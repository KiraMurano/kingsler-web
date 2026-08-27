import type { Role, PlotType, InstantType, GameCard } from './cards';
import type { CardId, CardInstance } from './cardInstance';
export type { Role, PlotType, InstantType, GameCard } from './cards';
export type { CardId, CardInstance } from './cardInstance';

export type BotPersonalityType = 'gambler' | 'cautious' | 'pragmatic' | 'provocateur' | 'opportunist';

export interface BotArchetype {
  type: BotPersonalityType;
  title: string;          // e.g. "Азартная", "Стратег", "Тактик"
  description: string;
  bluffRate: number;      // Base willingness to bluff (0.15 - 0.60)
  doubtAggression: number;// Base multiplier on suspicion (0.7 - 1.4)
  blockBluffRate: number; // Willingness to fake a block (0.20 - 0.65)
  greed: number;          // Preference for gold/stealing vs crowns (0.0 - 1.0)
  targetAggression: number;// Preference for attacking leaders vs weakest (0.0 - 1.0)
}

export interface ActivePlotData {
  id: string;
  /** The card instance resting in the slot — the same one that left the hand. */
  cardId: CardId;
  type: PlotType;
  targetPlayerId?: string;
  charges?: number; // Тайный заговор: 0–4
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  title?: string;
  seatNumber: number;
  isBot: boolean;
  archetype?: BotArchetype;
  gold: number;
  favor: number;       // Crowns 👑 (0 to 6, 6 = win condition)
  seals: number;       // Royal Seals ⚜️ (0 or 1, 2 seals = 1 crown)
  actionTokens: number;// Action tokens (0 to 2, refilled to 2 at turn start)
  hand: CardInstance[];
  activePlot: ActivePlotData | null;
}

export type ActionType = 'normal' | 'role' | 'plot' | 'instant';

export interface Action {
  id: string;
  type: ActionType;
  name: string;
  actorId: string;
  targetId?: string;
  targetCardIndex?: number;
  roleClaim?: Role;
  plotType?: PlotType;
  instantType?: InstantType;
  /** The card instance this action put on the table — staked role card, laid
   *  plot or played instant. Identity survives hand → table → discard. */
  stakedCardId?: CardId;
  /** For exchanging 1 or 2 cards in a normal action. */
  stakedCardIds?: CardId[];
  costGold: number;
  costTokens: number;
  withVaBanque?: boolean;   // Played together with Va-banque instant modifier (x2 on challenge)
  isMorningTrigger?: boolean;
  conspiracyEffect?: 'gold' | 'crown';
  cannotBeVetoed?: boolean;
  description: string;
}

export type TurnPhase = 
  | 'IDLE'                   // Active player choosing action (Role / Normal / Plot)
  | 'TARGET_REACTION_WINDOW' // Targeted victim choosing: Accept / Doubt / Duel
  | 'DUEL_ATTACKER_WINDOW'   // Attacker choosing: Retreat / Accept Duel
  | 'DOUBT_WINDOW'          // Non-targeted role or court check after accept
  | 'VETO_WINDOW'           // Court instant window before effect application
  | 'REVEAL_OUTCOME'        // Showing card reveal / challenge result modal
  | 'DUEL_OUTCOME'          // Showing simultaneous 2-card duel clash result modal
  | 'INFORMANT_PEEK'        // Informant Network owner peeking at opponent's new card
  | 'GAME_OVER';

export interface RevealOutcome {
  accuserId: string;
  accusedId: string;
  claimedRole: Role;
  wasTruth: boolean;
  revealedRole: GameCard;
  sealsWinnerId?: string;
  actionExecuted?: boolean;
  jesterBonus?: boolean;
  vaBanqueBonus?: boolean;
  dossierBonusPlayerId?: string;
  message: string;
}

export type DuelResultType = 
  | 'clash_blocked'        // Both truth: attack blocked, both get +1 ⚜️
  | 'attacker_breakthrough'// Attacker truth, Defender bluff: attack succeeds, attacker +1 ⚜️ (0 ⚜️ under Va-banque)
  | 'defender_counter'    // Attacker bluff, Defender truth: attack cancelled, defender +1 ⚜️ (+2 ⚜️ under Va-banque)
  | 'mutual_bluff';       // Both bluff: attack cancelled, nobody gains or loses anything

export interface DuelOutcome {
  attackerId: string;
  defenderId: string;
  attackerClaim: Role;
  defenderClaim: Role;
  attackerRevealedRole: GameCard;
  defenderRevealedRole: GameCard;
  attackerWasTruth: boolean;
  defenderWasTruth: boolean;
  resultType: DuelResultType;
  sealsWinnerId?: string;
  bothLostCoin?: boolean;
  message: string;
}

export interface InformantPeekData {
  observerId: string;
  targetId: string;
  newCard: GameCard;
}

export interface FloatingResourceEvent {
  id: string;
  playerId: string;
  text: string;
  isGain: boolean;
}

export interface ConspiracyPromptData {
  playerId: string;
  charges: number;
  isImmediateReaction: boolean;
}

export type TurnSubPhase = 'NORMAL_ACTION_PHASE' | 'CARD_PLAY_PHASE';

export interface GameState {
  players: Player[];
  activePlayerId: string;
  /** Only set in online mode: which seat this browser's connection is. Undefined offline. */
  viewerId?: string;
  deck: CardInstance[];
  discardPile: CardInstance[];
  turnPhase: TurnPhase;
  turnSubPhase: TurnSubPhase;
  timerSeconds: number;
  timerMaxSeconds: number;
  isTimerPaused: boolean;
  coronationCandidateId: string | null;
  /** Player whose turn it was when the circle started; win is checked at their next turn start. */
  coronationOriginId: string | null;
  
  // Pending Action state
  pendingAction: Action | null;
  pendingDoubtDoubterId: string | null;
  /** Ids of non-actor players who already clicked "Верю" in the current DOUBT_WINDOW — resolving requires every one of them, not just the first. */
  pendingDoubtPassedIds: string[];
  hasUsedNormalActionThisTurn: boolean;
  hasPlayedRoleThisTurn: boolean;
  hasPlayedPlotThisTurn: boolean;
  isVaBanqueActive: boolean;
  isVetoed: boolean;
  isPendingActionAfterTruthChallenge?: boolean;
  /** Ids of non-actor players who already clicked "Продолжить" in the current VETO_WINDOW — resolving requires every one of them, not just the first. */
  pendingVetoPassedIds: string[];
  /** Абсолютный timestamp закрытия окна вето. `null` вне окна. */
  vetoDeadlineAt: number | null;
  
  // Outcome Modals
  revealOutcome: RevealOutcome | null;
  duelOutcome: DuelOutcome | null;
  informantPeekData: InformantPeekData | null;
  conspiracyPrompt: ConspiracyPromptData | null;

  // Duel Specific Pending Cards
  pendingDuelDefenderCardId: CardId | null;
  pendingDuelDefenderRoleClaim: Role | null;
  
  // Animation & Visual Feedback States
  activeSpeechReactions: Record<string, string>;
  floatingResourceEvents: FloatingResourceEvent[];
  /** Instant laid on the table on top of the current action (veto / redirect). */
  overlayInstant: { card: InstantType; actorId: string } | null;
  
  winnerId: string | null;
  history: string[];

  // Action methods
  startGame: (seats?: { id: string; name: string; avatar?: string; title?: string }[]) => void;
  performAction: (action: Omit<Action, 'id'>) => void;
  skipNormalActionPhase: () => void;
  endTurnManually: () => void;
  playPlotAction: (plotType: PlotType, cardId: CardId, targetPlayerId?: string) => void;
  playInstant: (playerId: string, instantType: InstantType, cardId: CardId, targetPlayerId?: string) => void;
  doubtAction: (doubterId: string) => void;
  passDoubt: (playerId: string) => void;
  passVetoWindow: (playerId: string) => void;
  proceedAfterVetoWindow: () => void;
  
  // Duel methods for targeted attacks
  targetAcceptAttack: (targetId: string) => void;
  targetDoubtAttack: (targetId: string) => void;
  targetDeclareDuel: (targetId: string, cardId: CardId) => void;
  attackerRetreatDuel: (attackerId: string) => void;
  attackerAcceptDuel: (attackerId: string) => void;
  closeDuelOutcome: () => void;

  closeInformantPeek: () => void;
  closeRevealOutcome: () => void;
  openConspiracyDialog: (isImmediateReaction?: boolean) => void;
  closeConspiracyDialog: () => void;
  activateConspiracy: (playerId: string, targetPlayerId: string, effect: 'gold' | 'crown', isFreeReaction?: boolean) => void;
  
  endTurn: () => void;
  restartGame: () => void;

  // Internal helper methods
  addSealsToPlayer: (playerId: string, count: number) => void;
  _executeNormalAction: (action: Action) => void;
  _proceedAfterDoubtPassed: (action: Action) => void;
  _triggerVetoWindowOrResolveEffect: (action: Action, isAfterTruthChallenge?: boolean) => void;
  _executeRevealOutcome: (doubterId: string) => void;
  _resolveRoleActionEffect: (action: Action, isAfterTruthChallenge?: boolean) => void;
  _resolvePendingActionEffect: (action: Action, isAfterTruthChallenge?: boolean) => void;
  _checkEndgameAndAdvanceTurn: () => void;
  _disruptPlayerPlotsOnLoss: (playerId: string, reason: string) => void;
  _drawCardForPlayerWithInformantCheck: (playerIndex: number) => CardInstance;
}
