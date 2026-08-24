import type { GameState, Player } from '../types';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export const NO_CORONATION = {
  coronationCandidateId: null,
  coronationOriginId: null
} as const;

export type CoronationTurnVerdict =
  | { kind: 'win'; winnerId: string; winnerName: string; favor: number }
  | { kind: 'abort' }
  | { kind: 'continue' };

export function beginCoronationIfNeeded(
  get: StateGetter,
  set: StateSetter,
  candidateId: string,
  originId?: string
): void {
  const state = get();
  if (state.coronationCandidateId) return;
  const origin = originId ?? state.activePlayerId;
  const candidate = state.players.find(p => p.id === candidateId);
  const originPlayer = state.players.find(p => p.id === origin);
  set(s => ({
    coronationCandidateId: candidateId,
    coronationOriginId: origin,
    history: [
      `👑 КРУГ КОРОНАЦИИ! ${candidate?.name ?? 'Фаворит'} набрал 6 👑. Круг начался на ходе ${originPlayer?.name ?? 'текущего игрока'} и завершится в начале его следующего хода.`,
      ...s.history
    ].slice(0, 50)
  }));
}

export function fallenCoronationPatch(
  candidateId: string | null,
  fallenId: string,
  newFavor: number
): typeof NO_CORONATION | Record<string, never> {
  if (candidateId === fallenId && newFavor < 6) return NO_CORONATION;
  return {};
}

export function resolveCoronationAtTurnStart(
  nextPlayerId: string,
  players: Player[],
  candidateId: string | null,
  originId: string | null
): CoronationTurnVerdict {
  if (!originId || !candidateId) return { kind: 'continue' };
  if (nextPlayerId !== originId) return { kind: 'continue' };
  const candidate = players.find(p => p.id === candidateId);
  if (candidate && candidate.favor >= 6) {
    return {
      kind: 'win',
      winnerId: candidate.id,
      winnerName: candidate.name,
      favor: candidate.favor
    };
  }
  return { kind: 'abort' };
}
