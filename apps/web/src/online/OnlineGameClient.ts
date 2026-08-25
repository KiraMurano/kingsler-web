import { Client, type Room } from '@colyseus/sdk';
import { bindOnlineStore } from './bindOnlineStore';
import { sanitizeRoomCode } from './roomCode';

const SERVER_URL = import.meta.env.VITE_SERVER_WS_URL
  ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

export interface LobbySeat {
  playerId: string;
  nickname: string;
  connected: boolean;
}

export interface LobbyMessage {
  seats: LobbySeat[];
  hostSessionId: string | null;
  phase: 'WAITING' | 'PLAYING' | 'GAME_OVER';
}

export class OnlineGameClient {
  private client = new Client(SERVER_URL);
  private unbindStore: (() => void) | null = null;
  room: Room | null = null;

  async createRoom(nickname: string): Promise<Room> {
    this.room = await this.client.create('kinglier', { nickname });
    this.persistReconnectionToken();
    return this.room;
  }

  async joinRoom(roomId: string, nickname: string): Promise<Room> {
    this.room = await this.client.joinById(sanitizeRoomCode(roomId), { nickname });
    this.persistReconnectionToken();
    return this.room;
  }

  async tryReconnect(roomId: string): Promise<Room | null> {
    const token = localStorage.getItem(`kinglier:reconnect:${roomId}`);
    if (!token) return null;
    try {
      this.room = await this.client.reconnect(token);
      this.persistReconnectionToken();
      return this.room;
    } catch {
      localStorage.removeItem(`kinglier:reconnect:${roomId}`);
      return null;
    }
  }

  startGame(): void {
    this.room?.send('start');
  }

  bindStore(): void {
    if (!this.room) return;
    this.unbindStore?.();
    this.unbindStore = bindOnlineStore(this.room);
  }

  leave(): void {
    this.unbindStore?.();
    this.unbindStore = null;
    const room = this.room;
    this.room = null;
    if (!room) return;
    localStorage.removeItem(`kinglier:reconnect:${room.roomId}`);
    room.leave();
  }

  private persistReconnectionToken(): void {
    if (!this.room) return;
    localStorage.setItem(`kinglier:reconnect:${this.room.roomId}`, this.room.reconnectionToken);
  }
}

export const onlineClient = new OnlineGameClient();
