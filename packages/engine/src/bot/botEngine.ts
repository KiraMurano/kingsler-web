import { useGameStore } from '../GameStore';
import { makeBotMove } from './botTurnPlanner';
import { BOT_MOVE_MS, BOT_MOVE_JITTER_MS, TOSS_BOT_READY_MS } from '../timing';
import {
  handleDoubtPhase,
  handleTargetReactionPhase,
  handleDuelAttackerPhase,
  handleVetoPhase,
  type BotScheduler
} from './botReactions';

// Portable handle type: browser setTimeout returns a number, Node's returns
// a Timeout object. This engine runs in both (browser tab offline,
// worker_thread online), so the handle type must not assume one — using the
// bare global (not `window.setTimeout`) keeps it correct in both runtimes.
type TimeoutHandle = ReturnType<typeof setTimeout>;

class BotTimerRegistry {
  private timers: Map<string, TimeoutHandle> = new Map();

  public schedule(timerKey: string, callback: () => void, delayMs: number): void {
    this.clear(timerKey);
    const timeoutId = setTimeout(() => {
      this.timers.delete(timerKey);
      callback();
    }, delayMs);
    this.timers.set(timerKey, timeoutId);
  }

  public has(timerKey: string): boolean {
    return this.timers.has(timerKey);
  }

  public clear(timerKey: string): void {
    const existing = this.timers.get(timerKey);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.timers.delete(timerKey);
    }
  }

  /**
   * Гасит целое семейство таймеров.
   *
   * В окне сомнения у каждого бота свой ключ (`doubt_<id>`) — они отвечают
   * независимо друг от друга. Значит, и снимать их приходится всем семейством:
   * по одному ключу тут больше ничего не найдёшь.
   */
  public clearPrefix(prefix: string): void {
    for (const key of [...this.timers.keys()]) {
      if (key.startsWith(prefix)) this.clear(key);
    }
  }

  public clearAll(): void {
    for (const timeoutId of this.timers.values()) {
      clearTimeout(timeoutId);
    }
    this.timers.clear();
  }
}

const botTimers = new BotTimerRegistry();
const scheduler: BotScheduler = (key, cb, delay) => botTimers.schedule(key, cb, delay);

/**
 * Боты подтверждают готовность на экране жребия — сами и вразнобой.
 *
 * Отсчёт идёт от приземления монетки, а не от начала партии: до тех пор
 * кружков готовности на экране ещё нет, и бот, отметившийся в полёте, зажёгся
 * бы до того, как игрок увидел ряд.
 *
 * Остаток полёта берётся из `landsAt`, поэтому подключившийся в середине не
 * получает лишнюю паузу.
 */
function scheduleBotReadiness(state: ReturnType<typeof useGameStore.getState>): void {
  const toss = state.openingToss;
  if (!toss) return;
  const untilLanded = Math.max(0, toss.landsAt - Date.now());

  for (const bot of state.players) {
    if (!bot.isBot || toss.readyIds.includes(bot.id)) continue;
    botTimers.schedule(
      `toss_ready_${bot.id}`,
      () => {
        const cur = useGameStore.getState();
        if (cur.openingToss) cur.markReady(bot.id);
      },
      untilLanded + Math.random() * TOSS_BOT_READY_MS
    );
  }
}

let isEngineStarted = false;
let isExecutingBotMove = false;
let unsubscribeStore: (() => void) | null = null;

function checkAndScheduleBotMove(): void {
  if (isExecutingBotMove) return;

  const state = useGameStore.getState();
  if (
    state.turnPhase === 'IDLE' &&
    // Бот, выигравший жребий, обязан дождаться конца броска: иначе он
    // успевает сходить, пока игрок ещё смотрит на монетку.
    !state.openingToss &&
    !state.pendingAction &&
    !state.revealOutcome &&
    !state.duelOutcome &&
    !state.informantPeekData &&
    !state.winnerId
  ) {
    const activePlayer = state.players.find(p => p.id === state.activePlayerId);
    if (activePlayer && activePlayer.isBot) {
      if (!botTimers.has('bot_move')) {
        botTimers.schedule('bot_move', () => {
          const curState = useGameStore.getState();
          if (
            curState.turnPhase === 'IDLE' &&
            !curState.openingToss &&
            !curState.pendingAction &&
            !curState.revealOutcome &&
            !curState.duelOutcome &&
            !curState.informantPeekData &&
            !curState.winnerId
          ) {
            const curActive = curState.players.find(p => p.id === curState.activePlayerId);
            if (curActive && curActive.isBot) {
              isExecutingBotMove = true;
              try {
                makeBotMove(curActive.id);
              } finally {
                isExecutingBotMove = false;
                checkAndScheduleBotMove();
              }
            }
          }
        }, BOT_MOVE_MS + Math.random() * BOT_MOVE_JITTER_MS);
      }
    } else {
      botTimers.clear('bot_move');
    }
  } else {
    botTimers.clear('bot_move');
  }
}

/**
 * Запускает реактивный движок искусственного интеллекта ботов.
 */
export function startBotEngine(): void {
  if (isEngineStarted) return;
  isEngineStarted = true;

  unsubscribeStore = useGameStore.subscribe((state, prevState) => {
    // ------------------------------------------------------------------------
    // 0. ЖРЕБИЙ: боты подтверждают готовность вразнобой
    // ------------------------------------------------------------------------
    // Новый бросок узнаётся по `landsAt`: он меняется ровно раз за партию,
    // а `readyIds` внутри одного жребия меняется на каждой галочке.
    if (state.openingToss && state.openingToss.landsAt !== prevState?.openingToss?.landsAt) {
      scheduleBotReadiness(state);
    }

    // ------------------------------------------------------------------------
    // 1. ХОД В СТАТУСЕ IDLE: Активный бот выбирает действие
    // ------------------------------------------------------------------------
    checkAndScheduleBotMove();

    // ------------------------------------------------------------------------
    // 2. ОКНО СОМНЕНИЯ (DOUBT_WINDOW): Наблюдающие боты оценивают блеф
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'DOUBT_WINDOW' && state.turnPhase !== prevState?.turnPhase) {
      botTimers.clearPrefix('doubt');
      handleDoubtPhase(state, scheduler);
    }

    // ------------------------------------------------------------------------
    // 3. ОКНО РЕАКЦИИ ЦЕЛИ (TARGET_REACTION_WINDOW): Выбор защиты/дуэли/сомнения
    // ------------------------------------------------------------------------
    if (
      state.turnPhase === 'TARGET_REACTION_WINDOW' &&
      (state.turnPhase !== prevState?.turnPhase || state.pendingAction?.targetId !== prevState?.pendingAction?.targetId)
    ) {
      botTimers.clear('target_block');
      handleTargetReactionPhase(state, scheduler);
    }

    // ------------------------------------------------------------------------
    // 4. ОКНО АТАКУЮЩЕГО НА ДУЭЛИ (DUEL_ATTACKER_WINDOW): Принять или отступить
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'DUEL_ATTACKER_WINDOW' && state.turnPhase !== prevState?.turnPhase) {
      botTimers.clear('duel_attacker');
      handleDuelAttackerPhase(state, scheduler);
    }

    // ------------------------------------------------------------------------
    // 5. ОКНО ПРАВА ВЕТО (VETO_WINDOW): Оценка отмены действия
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'VETO_WINDOW' && state.turnPhase !== prevState?.turnPhase) {
      botTimers.clear('veto');
      handleVetoPhase(state, scheduler);
    }
  });
}

/**
 * Останавливает движок ботов и сбрасывает все активные таймеры.
 */
export function stopBotEngine(): void {
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }
  botTimers.clearAll();
  isExecutingBotMove = false;
  isEngineStarted = false;
}

/** Снимает все таймеры семейства — см. `BotTimerRegistry.clearPrefix`. */
export function clearBotTimers(prefix: string): void {
  botTimers.clearPrefix(prefix);
}
