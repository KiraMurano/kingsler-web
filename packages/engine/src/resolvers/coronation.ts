import type { GameState, Player } from '../types';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

/**
 * Один идущий круг коронации.
 *
 * Кругов может идти несколько разом: порога способны достичь двое и больше, и
 * у каждого свой зачинатель — тот, чей ход шёл в момент набора. Значит и срок
 * у каждого свой, и оборваться они могут независимо. Раньше круг был один на
 * стол, и второй дошедший до порога не получал круга вовсе — то есть удерживал
 * победные короны, а победа к нему не приходила.
 */
export interface Coronation {
  candidateId: string;
  /** Чей ход шёл в момент набора порога: на его следующем ходе круг закроется. */
  originId: string;
}

export const NO_CORONATIONS = { coronations: [] as Coronation[] } as const;

export type CoronationTurnVerdict =
  | { kind: 'win'; winnerId: string; winnerName: string; favor: number }
  | { kind: 'abort' }
  | { kind: 'continue' };

/** Идёт ли круг по этому игроку. */
export function isCoronationCandidate(coronations: Coronation[], playerId: string): boolean {
  return coronations.some(c => c.candidateId === playerId);
}

export function beginCoronationIfNeeded(
  get: StateGetter,
  set: StateSetter,
  candidateId: string,
  originId?: string
): void {
  const state = get();
  /* Второй круг по тому же игроку не заводим: он уже идёт, и новый лишь
     обнулил бы срок — то есть отодвинул победу тем, что игрок опять оказался
     на пороге. */
  if (isCoronationCandidate(state.coronations, candidateId)) return;

  const origin = originId ?? state.activePlayerId;
  const candidate = state.players.find(p => p.id === candidateId);
  const originPlayer = state.players.find(p => p.id === origin);
  const crownsToWin = state.rules.crownsToWin;
  set(s => ({
    coronations: [...s.coronations, { candidateId, originId: origin }],
    history: [
      `👑 КРУГ КОРОНАЦИИ! ${candidate?.name ?? 'Фаворит'} набрал ${crownsToWin} 👑. Круг начался на ходе ${originPlayer?.name ?? 'текущего игрока'} и завершится в начале его следующего хода.`,
      ...s.history
    ].slice(0, 50)
  }));
}

/**
 * Круги, переживающие падение корон у `fallenId`.
 *
 * Опускается ниже порога — его круг снимается, чужие продолжаются как шли:
 * они привязаны к своим претендентам и к чужой неудаче отношения не имеют.
 */
export function survivingCoronations(
  coronations: Coronation[],
  fallenId: string,
  newFavor: number,
  crownsToWin: number
): Coronation[] {
  if (newFavor >= crownsToWin) return coronations;
  return coronations.filter(c => c.candidateId !== fallenId);
}

/**
 * Чем кончается начало хода `nextPlayerId` для идущих кругов.
 *
 * Закрываются те круги, чей зачинатель — этот игрок. Претендент, удержавший
 * порог, побеждает; сорвавшийся круг снимается.
 *
 * Если на одном ходе закрываются сразу несколько удержавших кругов —
 * побеждает сильнейший: больше корон, при равенстве печатей, при равенстве
 * золота. Ничьей тут быть не может: престол один, и решать его судьбу
 * случайным порядком в массиве нельзя.
 */
export function resolveCoronationsAtTurnStart(
  nextPlayerId: string,
  players: Player[],
  coronations: Coronation[],
  crownsToWin: number
): { verdict: CoronationTurnVerdict; rest: Coronation[] } {
  const closing = coronations.filter(c => c.originId === nextPlayerId);
  if (closing.length === 0) return { verdict: { kind: 'continue' }, rest: coronations };

  const rest = coronations.filter(c => c.originId !== nextPlayerId);

  const held = closing
    .map(c => players.find(p => p.id === c.candidateId))
    .filter((p): p is Player => !!p && p.favor >= crownsToWin)
    .sort((a, b) => b.favor - a.favor || b.seals - a.seals || b.gold - a.gold);

  const winner = held[0];
  if (winner) {
    return {
      verdict: { kind: 'win', winnerId: winner.id, winnerName: winner.name, favor: winner.favor },
      rest
    };
  }
  return { verdict: { kind: 'abort' }, rest };
}

/**
 * Сколько ходов осталось до конца круга коронации.
 *
 * Круг заканчивается, когда очередь возвращается к тому, на чьём ходе он
 * начался (`originId`), — так решает `resolveCoronationsAtTurnStart`. Значит и
 * счётчик обязан считать то же самое: шаги по кругу мест от текущего хода до
 * хода зачинателя. Своя арифметика на экране разошлась бы с этой при первом же
 * выбывшем игроке, и счётчик врал бы молча.
 *
 * Ровно в начале круга ход принадлежит зачинателю, и до конца остаётся полный
 * оборот стола, а не ноль: коронация случится на его СЛЕДУЮЩЕМ ходе.
 *
 * `null` — круга нет, считать нечего.
 */
export function coronationTurnsLeft(
  players: Pick<Player, 'id'>[],
  activePlayerId: string | null,
  originId: string | null
): number | null {
  if (!originId || !activePlayerId || players.length === 0) return null;
  const from = players.findIndex(p => p.id === activePlayerId);
  const to = players.findIndex(p => p.id === originId);
  if (from === -1 || to === -1) return null;
  const steps = (to - from + players.length) % players.length;
  return steps === 0 ? players.length : steps;
}

/** Строка списка кругов для экрана. */
export interface CoronationRow {
  candidateId: string;
  name: string;
  turnsLeft: number;
}

/**
 * Идущие круги — списком, самый срочный первым.
 *
 * Порядок здесь, а не на экране: «кто опаснее» — это про правила (чей круг
 * закроется раньше), а не про вёрстку, и считать это дважды незачем.
 */
export function coronationBoard(
  players: Pick<Player, 'id' | 'name'>[],
  coronations: Coronation[],
  activePlayerId: string | null
): CoronationRow[] {
  return coronations
    .map(c => {
      const player = players.find(p => p.id === c.candidateId);
      const turnsLeft = coronationTurnsLeft(players, activePlayerId, c.originId);
      if (!player || turnsLeft === null) return null;
      return { candidateId: c.candidateId, name: player.name, turnsLeft };
    })
    .filter((row): row is CoronationRow => row !== null)
    .sort((a, b) => a.turnsLeft - b.turnsLeft || a.name.localeCompare(b.name, 'ru'));
}
