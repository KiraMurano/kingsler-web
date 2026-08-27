import type { GameState } from '../types';

type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function triggerResourceFloat(
  set: StateSetter,
  playerId: string,
  text: string,
  isGain: boolean
): void {
  const id = Math.random().toString(36).substring(7);
  set(state => ({
    floatingResourceEvents: [...state.floatingResourceEvents, { id, playerId, text, isGain }]
  }));

  globalThis.setTimeout(() => {
    set(state => ({
      floatingResourceEvents: state.floatingResourceEvents.filter(e => e.id !== id)
    }));
  }, 2400);
}
