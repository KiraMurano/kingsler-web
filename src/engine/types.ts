export type Role = 
  | 'Наследник' 
  | 'Казначей' 
  | 'Вор' 
  | 'Шпион' 
  | 'Шантажист' 
  | 'Рыцарь' 
  | 'Шут' 
  | 'Интриган';

export type BotPersonalityType = 'gambler' | 'cautious' | 'pragmatic' | 'provocateur' | 'opportunist';

export interface BotArchetype {
  type: BotPersonalityType;
  title: string;          // e.g. "Азартная", "Стратег", "Тактик"
  badge: string;          // e.g. "🎲", "🛡️", "⚖️", "🎭", "🗡️"
  description: string;
  bluffRate: number;      // Base willingness to bluff (0.15 - 0.60)
  doubtAggression: number;// Base multiplier on suspicion (0.7 - 1.4)
  blockBluffRate: number; // Willingness to fake a block (0.20 - 0.65)
  greed: number;          // Preference for gold/stealing vs crowns (0.0 - 1.0)
  targetAggression: number;// Preference for attacking leaders vs weakest (0.0 - 1.0)
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  seatNumber: number;
  isBot: boolean;
  archetype?: BotArchetype;
  gold: number;
  favor: number;
  reputation: number; // 0 to 3
  hand: Role[];
}

export type ActionType = 'normal' | 'role';

export interface Action {
  id: string;
  type: ActionType;
  name: string;
  actorId: string;
  targetId?: string;
  targetCardIndex?: number; // For Spy
  roleClaim?: Role;
  stakedCardIndex?: number; // Face-down staked card from hand (0 or 1)
  costGold: number;
  description: string;
}

export type TurnPhase = 
  | 'IDLE'                   // Active player choosing action
  | 'TARGET_REACTION_WINDOW' // Targeted victim choosing: Accept / Doubt / Duel
  | 'DUEL_ATTACKER_WINDOW'   // Attacker choosing: Retreat / Accept Duel
  | 'DOUBT_WINDOW'          // Non-targeted role or court check after accept
  | 'REVEAL_OUTCOME'        // Showing card reveal / challenge result modal
  | 'DUEL_OUTCOME'          // Showing simultaneous 2-card duel clash result modal
  | 'SPY_PEEK'              // Spy is looking at target's card
  | 'GAME_OVER';

export interface RevealOutcome {
  accuserId: string;
  accusedId: string;
  claimedRole: Role;
  wasTruth: boolean;
  revealedRole: Role;
  jesterBonus?: boolean;
  message: string;
}

export type DuelResultType = 
  | 'clash_blocked'        // Both truth: attack blocked, 0 damage
  | 'attacker_breakthrough'// Attacker truth, Defender bluff: defender -1 ❤️, attack succeeds
  | 'defender_counter'    // Attacker bluff, Defender truth: attacker -1 ❤️, attack cancelled
  | 'mutual_bluff';       // Both bluff: both -1 ❤️, attack cancelled

export interface DuelOutcome {
  attackerId: string;
  defenderId: string;
  attackerClaim: Role;
  defenderClaim: Role;
  attackerRevealedRole: Role;
  defenderRevealedRole: Role;
  attackerWasTruth: boolean;
  defenderWasTruth: boolean;
  resultType: DuelResultType;
  message: string;
}

export interface SpyPeekData {
  actorId: string;
  targetId: string;
  cardIndex: number;
  seenRole: Role;
}

export interface FloatingResourceEvent {
  id: string;
  playerId: string;
  text: string;
  isGain: boolean;
}

export interface CardFlightEvent {
  id: string;
  isDuel?: boolean;
  flightType?: 'to_discard' | 'to_hand';
  actorId?: string;
  role?: Role;
  attackerFlight?: 'to_discard' | 'to_hand';
  attackerId?: string;
  defenderFlight?: 'to_discard' | 'to_hand';
  defenderId?: string;
}

export interface GameState {
  players: Player[];
  deck: Role[];
  discardPile: Role[];
  activePlayerId: string;
  turnPhase: TurnPhase;
  coronationCandidateId: string | null;
  pendingAction: Action | null;
  
  // Duel state
  pendingDuelDefenderCardIndex: number | null;
  pendingDuelDefenderRoleClaim: Role | null;
  duelOutcome: DuelOutcome | null;
  
  timerSeconds: number;
  timerMaxSeconds: number;
  
  revealOutcome: RevealOutcome | null;
  spyPeekData: SpyPeekData | null;
  
  // Animation & Visual Feedback States
  damagedPlayerIds: string[];
  screenDamageFlash: boolean;
  activeSpeechReactions: Record<string, string>;
  floatingResourceEvents: FloatingResourceEvent[];
  cardFlightEvent: CardFlightEvent | null;
  hasCardDeparted: boolean;
  
  winnerId: string | null;
  history: string[];

  // Action methods
  startGame: () => void;
  performAction: (action: Omit<Action, 'id'>) => void;
  doubtAction: (doubterId: string) => void;
  passDoubt: (playerId: string) => void;
  
  // Duel methods for targeted attacks
  targetAcceptAttack: (targetId: string) => void;
  targetDoubtAttack: (targetId: string) => void;
  targetDeclareDuel: (targetId: string, stakedCardIndex?: number) => void;
  attackerRetreatDuel: (attackerId: string) => void;
  attackerAcceptDuel: (attackerId: string) => void;
  closeDuelOutcome: () => void;

  // Spy & outcome actions
  completeSpyAction: (swapMyCard: boolean, myCardIndexToSwap?: number) => void;
  closeRevealOutcome: () => void;
  
  endTurn: () => void;
  restartGame: () => void;

  // Internal helper methods
  _executeNormalAction: (action: Action) => void;
  _proceedAfterDoubtPassed: (action: Action) => void;
  _resolveRoleActionEffect: (action: Action) => void;
  _checkCoronationAndEndTurn: (actorId: string) => void;
}
