import type { Role, PlotType, InstantType, GameCard } from './cards';
import type { CardId, CardInstance } from './cardInstance';
import type { GameRules } from './rules';
export type { Role, PlotType, InstantType, GameCard } from './cards';
export type { Coronation } from './resolvers/coronation';
import type { Coronation } from './resolvers/coronation';
export type { CardId, CardInstance } from './cardInstance';
export type { GameRules } from './rules';

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

/**
 * Что интрига сделала. См. `GameState.plotPulses`.
 *
 * `spent` — сработала и уходит (приём состоялся, Заговор разрядился, грамота
 * приняла удар). `charge` — что-то получила: Заговор набрал заряд, Сеть
 * принесла монету — в том числе последнюю, после которой карта просто
 * улетает в сброс. `disrupt` — сорвана чужим ударом: кража, шантаж, обыск,
 * блеф при страже. Замена своей интригой на новую — не событие, пульса нет.
 */
export type PlotPulseKind = 'spent' | 'charge' | 'disrupt';

export interface PlotPulse {
  cardId: CardId;
  kind: PlotPulseKind;
}

export interface ActivePlotData {
  id: string;
  /** The card instance resting in the slot — the same one that left the hand. */
  cardId: CardId;
  type: PlotType;
  targetPlayerId?: string;
  /**
   * Накопитель интриги, если он у неё есть: заряды «Тайного заговора» (0–4) или
   * принесённые монеты «Сети информаторов» (0–3). Поле одно на обе, потому что
   * и на столе это одно и то же — цифра на карте, которая растёт и однажды
   * доводит интригу до конца.
   */
  charges?: number;
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
  | 'TARGET_REACTION_WINDOW' // Жертва отвечает один раз: Верю / Не верю / Дуэль
  | 'DUEL_CLASH'             // Ставки сходятся: дуэль разыгрывается сама, ответа ни от кого не ждут
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

/**
 * Стадия открытия партии. Порядок здесь — это порядок на экране.
 *
 *  - `READY`    двор собирается: каждый живой игрок отмечается «Готов».
 *  - `TOSS`     жребий: монетка летит и называет того, кто ходит первым.
 *  - `DEAL`     стол уже виден, карты раздаются по одной по кругу.
 *  - `FANFARE`  «Битва за престол начинается» — точка перед первым ходом.
 *
 * Раньше стадий не было вовсе: стол открывался сразу, с уже розданными
 * картами, а жребий вместе с готовностью висел поверх него. Готовность при
 * этом спрашивали ПОСЛЕ броска — то есть игрок подтверждал участие в партии,
 * жребий которой уже состоялся.
 */
export type OpeningStage = 'READY' | 'TOSS' | 'DEAL' | 'FANFARE';

/**
 * Открытие партии: от сбора двора до первого хода.
 *
 * Живёт в состоянии, а не на клиенте, чтобы онлайн-стол видел одну и ту же
 * последовательность — один бросок, одни галочки, одну раздачу. Состояние
 * целиком уезжает игрокам, отдельного сетевого сообщения для этого не нужно.
 *
 * Пока поле не `null`, стол ходов не принимает.
 */
export interface OpeningData {
  stage: OpeningStage;
  /**
   * Опознание этого открытия. Растёт на каждую новую партию — по нему и
   * только по нему узнаётся новое открытие: `readyIds` меняется на каждой
   * галочке, а стадия проходит одни и те же значения в каждой партии.
   *
   * Счётчик, а не время старта: две партии, начатые в одну миллисекунду,
   * получили бы одинаковую метку, и движок ботов не заметил бы вторую. В
   * тестах это ровно тот случай, а не гипотетический.
   */
  id: number;
  /** Кто ходит первым. Показывается только со стадии `TOSS`. */
  winnerId: string;
  /** Кто нажал «Готов». Боты отмечаются сами — см. `botEngine`. */
  readyIds: string[];
  /**
   * Стадия доиграна, идёт пауза перед следующей — до этого момента.
   *
   * Одно поле на все переходы, потому что понятие одно: каждая стадия что-то
   * сообщает, и сообщению нужно время дойти. `null` означает, что стадия ещё
   * идёт: двор не собран, карты не розданы, объявление на экране.
   */
  holdUntil: number | null;
  /**
   * Абсолютный timestamp приземления монетки; `null` до броска.
   *
   * Абсолютный, а не длительность, чтобы подключившийся в середине досмотрел
   * остаток полёта, а не крутил круг заново.
   */
  landsAt: number | null;
}

export interface ConspiracyPromptData {
  playerId: string;
  charges: number;
  isImmediateReaction: boolean;
}

export type TurnSubPhase = 'NORMAL_ACTION_PHASE' | 'CARD_PLAY_PHASE';

export interface GameState {
  /**
   * Правила этой партии: пороги, цены, состав колоды.
   *
   * Живут в состоянии, а не в отдельном канале, чтобы онлайн-клиенты получали
   * их тем же путём, что и всё остальное: `GameStateData` выводится из
   * `GameState` структурно, а `redactStateForPlayer` разливает через `...rest`.
   */
  rules: GameRules;
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
  /**
   * Идущие круги коронации. Их может быть несколько: порога способны достичь
   * двое и больше, и у каждого свой зачинатель, а значит и свой срок.
   */
  coronations: Coronation[];
  /** Не `null`, пока идёт открытие партии: стол ходов не принимает. */
  opening: OpeningData | null;
  
  // Pending Action state
  pendingAction: Action | null;
  pendingDoubtDoubterId: string | null;
  /** Ids of non-actor players who already clicked "Верю" in the current DOUBT_WINDOW — resolving requires every one of them, not just the first. */
  pendingDoubtPassedIds: string[];
  /**
   * Заявка, которую опрашивали. Опрос принадлежит ей, а не столу вообще.
   *
   * Без этого ответы доживали до следующего действия: `pendingDoubtPassedIds`
   * гасится при ОТКРЫТИИ окна сомнения, а действие, которое окна не открывает
   * (обычное, интрига, инстант), заставало прошлый список нетронутым — и стол
   * показывал решения прошлого хода как свежие.
   */
  pendingDoubtActionId: string | null;
  /**
   * Кто уже нажал «Пропустить» в текущем круге окна вето.
   *
   * Окно держится ответами, а не часами: оно закрывается, когда ответил
   * каждый, кого спрашивали (см. `vetoPollAnswered`). Сыгранное вето начинает
   * круг заново и гасит список — вопрос после него другой.
   */
  pendingVetoPassedIds: string[];
  /** Действие, по которому идёт опрос вето. Как `pendingDoubtActionId`. */
  pendingVetoActionId: string | null;
  /**
   * Кем была цель атаки ДО того, как её перевели «Перенаправлением».
   *
   * Живёт ровно на время окна вето поверх перевода. Вето отменяет сам перевод,
   * а не нападение, — значит нужно помнить, куда нападение возвращать.
   * `null` — перевода на столе нет, окно вето (если оно открыто) про что-то
   * другое.
   */
  pendingRedirectFromId: string | null;
  hasUsedNormalActionThisTurn: boolean;
  hasPlayedRoleThisTurn: boolean;
  /**
   * Выкладывал ли игрок Интригу в этом ходу.
   *
   * НЕ лимит: вторую Интригу за ход играть можно, она просто заменит первую.
   * Флаг остался как наблюдение — по нему боты решают, что интригой они в этом
   * ходу уже распорядились (`bot/botTurnPlanner.ts`), и по нему же считается,
   * не исчерпал ли бот ход целиком (`resolvers/turnResolver.ts`).
   */
  hasPlayedPlotThisTurn: boolean;
  isVaBanqueActive: boolean;
  /**
   * Отменён ли эффект текущего действия. Производное от `vetoChain`
   * (нечётная цепочка = отменён); пишется только вместе с ним.
   */
  isVetoed: boolean;
  /** Сколько «Прав вето» сыграно подряд поверх текущего действия. */
  vetoChain: number;
  isPendingActionAfterTruthChallenge?: boolean;
  
  // Outcome Modals
  revealOutcome: RevealOutcome | null;
  duelOutcome: DuelOutcome | null;
  informantPeekData: InformantPeekData | null;
  /**
   * Что случилось с интригами прямо сейчас — и, значит, что стол обязан
   * показать на самих картах.
   *
   * Событий три, и они разной силы. **`spent`** — интрига сработала: приём
   * состоялся, Заговор разрядился, грамота приняла удар. Такая карта уходит
   * со стола ударом. **`disrupt`** — её сняли чужим ударом: кража и шантаж
   * срывают приём, обыск сбрасывает любую, блеф сжигает стражу. Это тоже
   * уход, но другой — карта дёргается, а не празднует.
   *
   * Простой сброс `spent`/`disrupt` не ставит: вытесненная новой интрига
   * улетает совсем молча. Сеть после третьей монеты ставит `charge` (бейдж
   * монеты) и улетает без задержки — обычный сброс, не удар сработки.
   *
   * **`charge`** — интрига что-то получила: Заговор набрал заряд, Сеть
   * принесла монету. Тут удара не надо, нужен кивок.
   *
   * Список, а не одно поле: одна проверка заряжает все Заговоры на столе
   * разом, и показать это надо на каждом. Живёт до ближайшего
   * `_checkEndgameAndAdvanceTurn`, то есть заведомо дольше самой анимации.
   */
  plotPulses: PlotPulse[];
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
  startGame: (
    seats?: { id: string; name: string; avatar?: string; title?: string }[],
    rules?: Partial<GameRules>
  ) => void;
  /** «Готов» на экране сбора двора. Когда отметились все — начинается жребий. */
  markReady: (playerId: string) => void;
  performAction: (action: Omit<Action, 'id'>) => void;
  skipNormalActionPhase: () => void;
  endTurnManually: () => void;
  playPlotAction: (plotType: PlotType, cardId: CardId, targetPlayerId?: string) => void;
  playInstant: (playerId: string, instantType: InstantType, cardId: CardId, targetPlayerId?: string) => void;
  doubtAction: (doubterId: string) => void;
  passDoubt: (playerId: string) => void;
  /** «Пропустить» в окне вето. Окно закрывается, когда ответили все. */
  passVeto: (playerId: string) => void;
  proceedAfterVetoWindow: () => void;
  
  // Duel methods for targeted attacks
  /** «Верю» жертвы: её ответ в опросе двора, а не отдельная фаза перед ним. */
  targetAcceptAttack: (targetId: string) => void;
  targetDoubtAttack: (targetId: string) => void;
  /** «Дуэль»: карта-щит выставлена — дуэль разыгрывается, согласия атакующего не спрашивают. */
  targetDeclareDuel: (targetId: string, cardId: CardId) => void;
  closeDuelOutcome: () => void;

  closeInformantPeek: () => void;
  closeRevealOutcome: () => void;
  openConspiracyDialog: (isImmediateReaction?: boolean) => void;
  closeConspiracyDialog: () => void;
  activateConspiracy: (playerId: string, targetPlayerId: string, effect: 'gold' | 'crown', isFreeReaction?: boolean) => void;
  
  endTurn: () => void;

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
  /**
   * Один шаг открытия партии: сбор двора → жребий → раздача → фанфара → игра.
   *
   * Шаг всегда один и тот же вызов: следующий планируется самим шагом, поэтому
   * последовательность живёт в одном месте, а не размазана по таймерам
   * вызывающих.
   */
  _advanceOpening: () => void;
}
