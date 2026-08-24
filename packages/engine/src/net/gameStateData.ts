import type { GameState } from '../types.ts';

/**
 * The data-only shape of GameState: every action method (performAction,
 * doubtAction, the internal `_foo` helpers, etc.) is excluded. Deriving this
 * structurally from GameState means it can never drift out of sync — any new
 * data field automatically appears here, any new method is automatically
 * excluded.
 */
export type GameStateData = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof GameState as GameState[K] extends (...args: any[]) => any ? never : K]: GameState[K];
};

export function toGameStateData(state: GameState): GameStateData {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value !== 'function') {
      data[key] = value;
    }
  }
  return data as GameStateData;
}
