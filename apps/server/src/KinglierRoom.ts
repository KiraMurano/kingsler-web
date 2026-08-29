import { randomInt } from 'node:crypto';
import { Room, JWT } from 'colyseus';
import type { Client, AuthContext } from 'colyseus';
import { GameWorkerClient, type SeatInput } from './GameWorkerClient.ts';
import { redactStateForPlayer } from '@kinglier/engine/net/redaction';
import type { GameStateData } from '@kinglier/engine/net/gameStateData';
import { findUserById } from './db.ts';
import { setActiveSeat, clearActiveSeat } from './activeSeats.ts';
import { DEFAULT_RULES, normalizeRules } from '@kinglier/engine/rules';
import type { GameRules } from '@kinglier/engine/rules';

const ACTIVE_PLAYER_ONLY_ACTIONS = new Set([
  'performAction', 'skipNormalActionPhase', 'endTurnManually',
  'playPlotAction', 'openConspiracyDialog', 'endTurn'
]);

const SELF_ONLY_ACTIONS = new Set([
  'markReady',
  'doubtAction', 'passDoubt', 'passVeto', 'targetAcceptAttack', 'targetDoubtAttack',
  'targetDeclareDuel',
  'activateConspiracy', 'playInstant'
]);

const UNRESTRICTED_ACTIONS = new Set([
  'closeDuelOutcome', 'closeInformantPeek', 'closeRevealOutcome',
  'closeConspiracyDialog'
]);

interface ActionMessage {
  method: string;
  args: unknown[];
}

const RECONNECTION_GRACE_SECONDS = Number(process.env.KINGLIER_RECONNECT_GRACE_SECONDS ?? 60);
const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
// Sent when a second connection for the same account takes over a seat
// (e.g. the player opened the room in a new tab/device). Kept out of the
// 1000-4999 "consented leave" range so the client's drop-watcher treats it
// as a terminal state, not something to retry.
const CLOSE_CODE_ANOTHER_DEVICE = 4002;

function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)]).join('');
}

type Phase = 'WAITING' | 'PLAYING' | 'GAME_OVER';

interface Seat {
  playerId: string;
  userId: string;
  sessionId: string;
  nickname: string;
  avatar: string;
  title: string;
  connected: boolean;
  botControlled: boolean;
}

interface AuthPayload {
  userId: string;
  nickname: string;
  avatar: string;
  title: string;
}

interface LobbyMessage {
  seats: {
    playerId: string;
    nickname: string;
    avatar: string;
    title: string;
    connected: boolean;
  }[];
  /**
   * Соединение хоста — выводится из его МЕСТА на каждую рассылку, а не
   * хранится. Место переживает переподключение, соединение — нет.
   */
  hostSessionId: string | null;
  phase: Phase;
  /** Правила партии, выставленные хостом. Видны всем — играть по ним всем. */
  rules: GameRules;
}

export class KinglierRoom extends Room {
  maxClients = 4;

  private seats: Seat[] = [];
  /**
   * Хост — это МЕСТО, а не соединение.
   *
   * Хранился `sessionId`, и он ломался на любом переподключении: `onJoin`
   * выдавал вернувшемуся игроку новый `sessionId`, переписывал его в место, а
   * `hostSessionId` продолжал указывать на мёртвое соединение. Хост переставал
   * быть хостом — ни настроек, ни кнопки старта, — и хостом не становился
   * никто. Комната умирала молча, потому что бейдж «Хост» в списке мест
   * считался иначе (по первому месту) и продолжал показывать правду.
   */
  private hostPlayerId: string | null = null;
  private rules: GameRules = DEFAULT_RULES;
  private phase: Phase = 'WAITING';
  protected worker: GameWorkerClient | null = null;
  protected latestState: GameStateData | null = null;

  onCreate() {
    this.roomId = generateRoomCode();
  }

  messages = {
    start: (client: Client) => this.handleStart(client),
    action: (client: Client, payload: ActionMessage) => this.handleAction(client, payload),
    // The joining client's own onMessage handler isn't registered yet when its
    // join handshake completes, so it explicitly asks for a fresh snapshot
    // instead of relying on the broadcast sent below (which only reaches
    // clients that were already in the room).
    lobby: (client: Client) => client.send('lobby', this.lobbySnapshot()),
    rules: (client: Client, payload: unknown) => this.handleRules(client, payload)
  };

  async onAuth(_client: Client, _options: unknown, context: AuthContext): Promise<AuthPayload> {
    if (!context.token) throw new Error('unauthorized');

    const payload = await JWT.verify<{ userId: string }>(context.token);
    const user = payload?.userId ? findUserById(payload.userId) : undefined;
    if (!user) throw new Error('unauthorized');

    return {
      userId: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      title: user.title
    };
  }

  onJoin(client: Client) {
    const auth = client.auth as AuthPayload;
    const existing = this.seats.find(s => s.userId === auth.userId);

    if (existing) {
      if (existing.botControlled) {
        // Thrown (not `client.leave()`) so the join attempt itself is
        // rejected — the client's `joinById(...)` promise rejects instead
        // of resolving and then immediately being kicked.
        throw new Error('seat already handed to a bot for this match');
      }
      if (existing.connected) {
        this.clients.getById(existing.sessionId)?.leave(CLOSE_CODE_ANOTHER_DEVICE, 'Вы вошли с другого устройства.');
      }
      existing.sessionId = client.sessionId;
      existing.connected = true;
      client.userData = { playerId: existing.playerId };
      setActiveSeat(auth.userId, { roomId: this.roomId, playerId: existing.playerId });
      this.broadcastLobby();
      if (this.latestState) this.sendState(client, existing.playerId);
      return;
    }

    if (this.phase !== 'WAITING') {
      throw new Error('game already in progress');
    }

    const playerId = `p${this.seats.length + 1}`;
    if (!this.hostPlayerId) this.hostPlayerId = playerId;
    this.seats.push({
      playerId,
      userId: auth.userId,
      sessionId: client.sessionId,
      nickname: auth.nickname,
      avatar: auth.avatar,
      title: auth.title,
      connected: true,
      botControlled: false
    });
    client.userData = { playerId };
    setActiveSeat(auth.userId, { roomId: this.roomId, playerId });
    this.broadcast('lobby', this.lobbySnapshot(), { except: client });
  }

  async onDrop(client: Client): Promise<void> {
    const seat = this.seats.find(s => s.sessionId === client.sessionId);
    if (!seat) return;

    seat.connected = false;
    this.broadcastLobby();

    // Colyseus finalizes an unconsented disconnect as a full `onLeave` right
    // after `onDrop` returns, unless `allowReconnection` is called to hold
    // it open. The reconnect-token this normally hands out is unused here
    // (the client SDK's own auto-reconnect is disabled) — this call only
    // buys the grace window; the actual comeback is `onJoin`'s userId match
    // above, which can happen from any device/session.
    try {
      await this.allowReconnection(client, RECONNECTION_GRACE_SECONDS);
    } catch {
      // grace period expired without a matching reconnect
    }

    if (seat.connected) return; // already reconnected via onJoin above

    if (this.phase === 'PLAYING') {
      seat.botControlled = true;
      clearActiveSeat(seat.userId);
      this.worker?.setSeatBotControlled(seat.playerId);
    }
    this.broadcastLobby();
  }

  onLeave(client: Client): void {
    const seat = this.seats.find(s => s.sessionId === client.sessionId);
    if (!seat) return;

    clearActiveSeat(seat.userId);

    if (this.phase === 'PLAYING') {
      seat.connected = false;
      seat.botControlled = true;
      this.worker?.setSeatBotControlled(seat.playerId);
    } else {
      this.seats = this.seats.filter(s => s !== seat);
      if (this.hostPlayerId === seat.playerId) {
        this.hostPlayerId = this.seats[0]?.playerId ?? null;
      }
    }
    this.broadcastLobby();
  }

  onDispose(): void {
    this.worker?.terminate();
    for (const seat of this.seats) {
      clearActiveSeat(seat.userId);
    }
  }

  /** Место хоста. Пусто, если за столом ещё никого нет. */
  private hostSeat(): Seat | undefined {
    return this.seats.find(seat => seat.playerId === this.hostPlayerId);
  }

  /** Ведёт ли это соединение место хоста. */
  private isHost(client: Client): boolean {
    const host = this.hostSeat();
    return !!host && host.sessionId === client.sessionId;
  }

  protected lobbySnapshot(): LobbyMessage {
    return {
      seats: this.seats.map(seat => ({
        playerId: seat.playerId,
        nickname: seat.nickname,
        avatar: seat.avatar,
        title: seat.title,
        connected: seat.connected
      })),
      hostSessionId: this.hostSeat()?.sessionId ?? null,
      phase: this.phase,
      rules: this.rules
    };
  }

  /**
   * Правила меняет только хост и только до старта.
   *
   * Нормализация здесь не дублирует клиентскую, а заменяет её: клиент шлёт что
   * угодно, и единственное место, где это становится валидными правилами, —
   * сервер. Клиентская проверка нужна лишь для того, чтобы объяснить игроку,
   * что не так, до нажатия «Начать».
   */
  protected handleRules(client: Client, payload: unknown): void {
    if (this.phase !== 'WAITING' || !this.isHost(client)) return;
    this.rules = normalizeRules(payload);
    this.broadcastLobby();
  }

  protected broadcastLobby(): void {
    this.broadcast('lobby', this.lobbySnapshot());
  }

  protected handleStart(client: Client): void {
    if (this.phase !== 'WAITING' || !this.isHost(client) || this.seats.length === 0) {
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

    const seatInputs: SeatInput[] = this.seats.map(seat => ({
      id: seat.playerId,
      name: seat.nickname,
      avatar: seat.avatar,
      title: seat.title
    }));
    this.worker.startGame(seatInputs, this.rules);
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

    // `performAction`'s single argument carries its own `actorId` field
    // (unlike the SELF_ONLY_ACTIONS above, which pass the id as a bare
    // `args[0]`). The active-player check above only proves *this seat* may
    // act right now — it never touches that embedded field, so a buggy or
    // malicious client could still claim to act as someone else. Stamp the
    // server-known seat id over whatever the client sent.
    if (method === 'performAction' && args[0] && typeof args[0] === 'object') {
      (args[0] as { actorId?: string }).actorId = seat.playerId;
    }

    this.worker.call(method, args);
  }
}
