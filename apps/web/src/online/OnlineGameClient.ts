import { Client, type Room } from '@colyseus/sdk';

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
  room: Room | null = null;

  async createRoom(nickname: string): Promise<Room> {
    this.room = await this.client.create('kinglier', { nickname });
    this.persistReconnectionToken();
    return this.room;
  }

  async joinRoom(roomId: string, nickname: string): Promise<Room> {
    this.room = await this.client.joinById(roomId, { nickname });
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

  private persistReconnectionToken(): void {
    if (!this.room) return;
    localStorage.setItem(`kinglier:reconnect:${this.room.roomId}`, this.room.reconnectionToken);
  }
}
