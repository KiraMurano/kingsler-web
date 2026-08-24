import { Room } from 'colyseus';
import type { Client } from 'colyseus';
import { GameWorkerClient, type SeatInput } from './GameWorkerClient.ts';
import { redactStateForPlayer } from '@kinglier/engine/net/redaction';
import type { GameStateData } from '@kinglier/engine/net/gameStateData';

const ACTIVE_PLAYER_ONLY_ACTIONS = new Set([
  'performAction', 'skipNormalActionPhase', 'endTurnManually',
  'playPlotAction', 'openConspiracyDialog', 'endTurn'
]);

const SELF_ONLY_ACTIONS = new Set([
  'doubtAction', 'passDoubt', 'targetAcceptAttack', 'targetDoubtAttack',
  'targetDeclareDuel', 'attackerRetreatDuel', 'attackerAcceptDuel',
  'activateConspiracy', 'playInstant'
]);

const UNRESTRICTED_ACTIONS = new Set([
  'closeDuelOutcome', 'closeInformantPeek', 'closeRevealOutcome',
  'proceedAfterVetoWindow', 'closeConspiracyDialog'
]);

interface ActionMessage {
  method: string;
  args: unknown[];
}

type Phase = 'WAITING' | 'PLAYING' | 'GAME_OVER';

interface Seat {
  playerId: string;
  sessionId: string;
  nickname: string;
  connected: boolean;
}

interface JoinOptions {
  nickname?: string;
}

interface LobbyMessage {
  seats: { playerId: string; nickname: string; connected: boolean }[];
  hostSessionId: string | null;
  phase: Phase;
}

export class KinglierRoom extends Room {
  maxClients = 4;

  private seats: Seat[] = [];
  private hostSessionId: string | null = null;
  private phase: Phase = 'WAITING';
  protected worker: GameWorkerClient | null = null;
  protected latestState: GameStateData | null = null;

  messages = {
    start: (client: Client) => this.handleStart(client),
    action: (client: Client, payload: ActionMessage) => this.handleAction(client, payload)
  };

  onJoin(client: Client, options: JoinOptions) {
    if (this.phase !== 'WAITING') {
      throw new Error('game already in progress');
    }
    if (!this.hostSessionId) this.hostSessionId = client.sessionId;

    const playerId = `p${this.seats.length + 1}`;
    const nickname = (options.nickname ?? '').trim().slice(0, 24) || playerId;
    this.seats.push({ playerId, sessionId: client.sessionId, nickname, connected: true });
    client.userData = { playerId };
    this.broadcastLobby();
  }

  onLeave(client: Client) {
    this.seats = this.seats.filter(s => s.sessionId !== client.sessionId);
    this.broadcastLobby();
  }

  onDispose() {
    this.worker?.terminate();
  }

  protected broadcastLobby(): void {
    const lobby: LobbyMessage = {
      seats: this.seats.map(s => ({ playerId: s.playerId, nickname: s.nickname, connected: s.connected })),
      hostSessionId: this.hostSessionId,
      phase: this.phase
    };
    this.broadcast('lobby', lobby);
  }

  protected handleStart(client: Client): void {
    if (this.phase !== 'WAITING' || client.sessionId !== this.hostSessionId || this.seats.length === 0) {
      return;
    }

    this.phase = 'PLAYING';
    this.worker = new GameWorkerClient();
    this.worker.onState(data => {
      this.latestState = data;
      for (const seat of this.seats) {
        if (!seat.connected) continue;
        const seatClient = this.clients.getById(seat.sessionId);
        if (seatClient) this.sendState(seatClient, seat.playerId);
      }
    });

    const seatInputs: SeatInput[] = this.seats.map(s => ({ id: s.playerId, name: s.nickname }));
    this.worker.startGame(seatInputs);
    this.broadcastLobby();
  }

  protected sendState(client: Client, playerId: string): void {
    if (!this.latestState) return;
    client.send('state', redactStateForPlayer(this.latestState, playerId));
  }

  protected handleAction(client: Client, payload: ActionMessage): void {
    if (this.phase !== 'PLAYING' || !this.worker || !this.latestState) return;
    const seat = this.seats.find(s => s.sessionId === client.sessionId);
    if (!seat) return;

    const { method, args } = payload;

    if (ACTIVE_PLAYER_ONLY_ACTIONS.has(method)) {
      if (this.latestState.activePlayerId !== seat.playerId) return;
    } else if (SELF_ONLY_ACTIONS.has(method)) {
      if (args[0] !== seat.playerId) return;
    } else if (!UNRESTRICTED_ACTIONS.has(method)) {
      return; // unknown method: reject
    }

    this.worker.call(method, args);
  }
}
