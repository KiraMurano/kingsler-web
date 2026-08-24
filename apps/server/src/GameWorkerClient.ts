import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameStateData } from '@kinglier/engine/net/gameStateData';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SeatInput {
  id: string;
  name: string;
  avatar?: string;
}

interface WorkerOutMessage {
  type: 'state';
  data: GameStateData;
}

export class GameWorkerClient {
  private worker: Worker;
  private stateListeners = new Set<(data: GameStateData) => void>();

  constructor() {
    this.worker = new Worker(path.join(__dirname, 'gameWorker.ts'), {
      execArgv: ['--import', 'tsx/esm']
    });
    this.worker.on('message', (msg: WorkerOutMessage) => {
      if (msg.type === 'state') {
        for (const listener of this.stateListeners) listener(msg.data);
      }
    });
  }

  onState(listener: (data: GameStateData) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  startGame(seats: SeatInput[]): void {
    this.worker.postMessage({ type: 'startGame', seats });
  }

  call(method: string, args: unknown[]): void {
    this.worker.postMessage({ type: 'call', method, args });
  }

  setSeatBotControlled(playerId: string): void {
    this.worker.postMessage({ type: 'setBotSeat', playerId });
  }

  terminate(): void {
    void this.worker.terminate();
  }
}
