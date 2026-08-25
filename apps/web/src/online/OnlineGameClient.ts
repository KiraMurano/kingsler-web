import type { Room } from '@colyseus/sdk';
import { colyseusClient } from '../auth/AuthClient';
import { bindOnlineStore } from './bindOnlineStore';
import { sanitizeRoomCode } from './roomCode';

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
  private unbindStore: (() => void) | null = null;
  room: Room | null = null;

  async createRoom(): Promise<Room> {
    this.room = await colyseusClient.create('kinglier');
    return this.room;
  }

  async joinRoom(roomId: string): Promise<Room> {
    this.room = await colyseusClient.joinById(sanitizeRoomCode(roomId));
    return this.room;
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
    room?.leave();
  }
}

export const onlineClient = new OnlineGameClient();
