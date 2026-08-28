import { parentPort } from 'node:worker_threads';
import { useGameStore } from '@kinglier/engine/GameStore';
import { startBotEngine } from '@kinglier/engine/Bot';
import { toGameStateData } from '@kinglier/engine/net/gameStateData';

if (!parentPort) {
  throw new Error('gameWorker.ts must only be run as a worker_threads Worker');
}
const port = parentPort;

// Every method a connected client is allowed to trigger. Internal helpers
// (the underscore-prefixed methods, addSealsToPlayer) are never reachable
// here even if a malicious message claims that method name.
const ALLOWED_METHODS = new Set([
  'markReady',
  'performAction', 'skipNormalActionPhase', 'endTurnManually', 'playPlotAction',
  'playInstant', 'doubtAction', 'passDoubt',
  'targetAcceptAttack', 'targetDoubtAttack', 'targetDeclareDuel',
  'attackerRetreatDuel', 'attackerAcceptDuel', 'closeDuelOutcome',
  'closeInformantPeek', 'closeRevealOutcome', 'openConspiracyDialog',
  'closeConspiracyDialog', 'activateConspiracy', 'endTurn'
]);

interface WorkerMessage {
  type: 'startGame' | 'call' | 'setBotSeat';
  seats?: { id: string; name: string; avatar?: string; title?: string }[];
  method?: string;
  args?: unknown[];
  playerId?: string;
}

useGameStore.subscribe(state => {
  port.postMessage({ type: 'state', data: toGameStateData(state) });
});

startBotEngine();

port.on('message', (msg: WorkerMessage) => {
  switch (msg.type) {
    case 'startGame':
      useGameStore.getState().startGame(msg.seats);
      break;
    case 'call': {
      if (!msg.method || !ALLOWED_METHODS.has(msg.method)) return;
      // Пока держится экран жребия, стол закрыт для всех — кроме «Готов»,
      // которым его и снимают. Это единственная воронка, через которую в
      // движок попадают действия игроков, поэтому заслонка стоит одна на все
      // методы, а не по одной в каждом.
      if (useGameStore.getState().openingToss && msg.method !== 'markReady') return;
      const state = useGameStore.getState() as unknown as Record<string, (...args: unknown[]) => void>;
      state[msg.method](...(msg.args ?? []));
      break;
    }
    case 'setBotSeat':
      if (!msg.playerId) return;
      useGameStore.setState(state => ({
        players: state.players.map(p => (p.id === msg.playerId ? { ...p, isBot: true } : p))
      }));
      // Ушедший не может нажать «Готов», а его место теперь ведёт бот —
      // значит, оно отмечается само, как и остальные ботовские.
      useGameStore.getState().markReady(msg.playerId);
      useGameStore.getState()._settleOpeningToss();
      break;
    default:
      break;
  }
});
