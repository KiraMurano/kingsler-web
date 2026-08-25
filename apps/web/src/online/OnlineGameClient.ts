import type { Room } from '@colyseus/sdk';
import { colyseusClient } from '../auth/AuthClient';
import { bindOnlineStore } from './bindOnlineStore';
import { sanitizeRoomCode } from './roomCode';

export interface LobbySeat {
  playerId: string;
  nickname: string;
  avatar: string;
  title: string;
  connected: boolean;
}

export interface LobbyMessage {
  seats: LobbySeat[];
  hostSessionId: string | null;
  phase: 'WAITING' | 'PLAYING' | 'GAME_OVER';
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'lost';

// Matches KinglierRoom.ts's CLOSE_CODE_ANOTHER_DEVICE.
const CLOSE_CODE_ANOTHER_DEVICE = 4002;
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 8000, 8000];

export class OnlineGameClient {
  room: Room | null = null;
  private unbindStore: (() => void) | null = null;
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private reconnecting = false;

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: ConnectionStatus): void {
    for (const listener of this.statusListeners) listener(status);
  }

  private watch(room: Room): void {
    // Colyseus's own transport-level auto-reconnect (backed by
    // `room.reconnectionToken`) would race with the userId-based rejoin
    // below if both were active — disabling it here keeps exactly one
    // reconnection path.
    room.reconnection.enabled = false;
    room.onLeave(code => {
      if (this.room !== room) return; // superseded by a newer room already
      if (code === 1000) return; // consented leave (e.g. clicked "Выйти")
      if (code === CLOSE_CODE_ANOTHER_DEVICE) {
        this.setStatus('lost');
        return;
      }
      void this.reconnect(room.roomId);
    });
  }

  private async reconnect(roomId: string): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.setStatus('reconnecting');

    for (const delay of RECONNECT_DELAYS_MS) {
      await new Promise(resolve => setTimeout(resolve, delay));
      try {
        const room = await colyseusClient.joinById(roomId);
        this.room = room;
        this.watch(room);
        this.bindStore();
        this.setStatus('connected');
        this.reconnecting = false;
        return;
      } catch {
        // keep trying with the next delay
      }
    }

    this.reconnecting = false;
    this.setStatus('lost');
  }

  async createRoom(): Promise<Room> {
    this.room = await colyseusClient.create('kinglier');
    this.watch(this.room);
    return this.room;
  }

  async joinRoom(roomId: string): Promise<Room> {
    this.room = await colyseusClient.joinById(sanitizeRoomCode(roomId));
    this.watch(this.room);
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
