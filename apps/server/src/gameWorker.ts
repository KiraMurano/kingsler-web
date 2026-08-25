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
  'performAction', 'skipNormalActionPhase', 'endTurnManually', 'playPlotAction',
  'playInstant', 'doubtAction', 'passDoubt', 'passVetoWindow', 'proceedAfterVetoWindow',
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
      const state = useGameStore.getState() as unknown as Record<string, (...args: unknown[]) => void>;
      state[msg.method](...(msg.args ?? []));
      break;
    }
    case 'setBotSeat':
      if (!msg.playerId) return;
      useGameStore.setState(state => ({
        players: state.players.map(p => (p.id === msg.playerId ? { ...p, isBot: true } : p))
      }));
      break;
    default:
      break;
  }
});
