import { useGameStore } from '../GameStore';
import { makeBotMove } from './botTurnPlanner';
import {
  handleDoubtPhase,
  handleTargetReactionPhase,
  handleDuelAttackerPhase,
  handleVetoPhase,
  type BotScheduler
} from './botReactions';

class BotTimerRegistry {
  private timers: Map<string, number> = new Map();

  public schedule(timerKey: string, callback: () => void, delayMs: number): void {
    this.clear(timerKey);
    const timeoutId = window.setTimeout(() => {
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

  public clearAll(): void {
    for (const timeoutId of this.timers.values()) {
      clearTimeout(timeoutId);
    }
    this.timers.clear();
  }
}

const botTimers = new BotTimerRegistry();
const scheduler: BotScheduler = (key, cb, delay) => botTimers.schedule(key, cb, delay);

let isEngineStarted = false;
let isExecutingBotMove = false;
let unsubscribeStore: (() => void) | null = null;

function checkAndScheduleBotMove(): void {
  if (isExecutingBotMove) return;

  const state = useGameStore.getState();
  if (
    state.turnPhase === 'IDLE' &&
    !state.pendingAction &&
    !state.revealOutcome &&
    !state.duelOutcome &&
    !state.spyPeekData &&
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
            !curState.pendingAction &&
            !curState.revealOutcome &&
            !curState.duelOutcome &&
            !curState.spyPeekData &&
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
        }, 800 + Math.random() * 400);
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
    // 1. ХОД В СТАТУСЕ IDLE: Активный бот выбирает действие
    // ------------------------------------------------------------------------
    checkAndScheduleBotMove();

    // ------------------------------------------------------------------------
    // 2. ОКНО СОМНЕНИЯ (DOUBT_WINDOW): Наблюдающие боты оценивают блеф
    // ------------------------------------------------------------------------
    if (state.turnPhase === 'DOUBT_WINDOW' && state.turnPhase !== prevState?.turnPhase) {
      botTimers.clear('doubt');
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
