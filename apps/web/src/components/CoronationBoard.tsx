/**
 * Идущие круги коронации — столбиком слева от стола.
 *
 * Круг коронации самый напряжённый отрезок партии: претендент набрал короны и
 * обязан удержать их до своего следующего хода. Раньше об этом говорила только
 * строка в летописи, то есть панель, которую надо открыть, — а знать, по кому
 * идёт круг и сколько ему осталось, нужно всем и постоянно.
 *
 * Кругов может идти несколько разом, поэтому это список, а не одна плашка, и
 * поэтому же в каждой строке стоит имя: плашка живёт не рядом с игроком, и
 * без имени непонятно, о ком речь.
 *
 * Порядок — самый срочный сверху, и считает его движок (`coronationBoard`):
 * «кто опаснее» это про правила, чей круг закроется раньше, а не про вёрстку.
 */
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@kinglier/engine/GameStore';
import { coronationBoard } from '@kinglier/engine/resolvers/coronation';
import { UiIcon } from './ui/Icon';

/**
 * «1 ход», «2 хода», «5 ходов» — русский счёт, а не «ход(ов)».
 *
 * Числа тут маленькие, но правило нужно целиком: за столом бывает и
 * одиннадцать мест, а «11 ход» читается как ошибка приложения.
 */
function turnsWord(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return 'ходов';
  switch (n % 10) {
    case 1:
      return 'ход';
    case 2:
    case 3:
    case 4:
      return 'хода';
    default:
      return 'ходов';
  }
}

export const CoronationBoard: React.FC = () => {
  const { players, coronations, activePlayerId, opening } = useGameStore(
    useShallow(s => ({
      players: s.players,
      coronations: s.coronations,
      activePlayerId: s.activePlayerId,
      opening: s.opening
    }))
  );

  /* Пока идёт открытие партии, кругов быть не может, но состояние уже живое —
     а объявление о коронации поверх раздачи выглядело бы поломкой. */
  if (opening) return null;

  const rows = coronationBoard(players, coronations, activePlayerId);
  if (rows.length === 0) return null;

  return (
    <div className="crownboard" role="status" aria-live="polite">
      {rows.map(row => (
        <div key={row.candidateId} className="crowning">
          <UiIcon kind="crown" size="xs" className="crowning__crown" />
          <span className="crowning__text">
            Коронация {row.name} через {row.turnsLeft} {turnsWord(row.turnsLeft)}
          </span>
        </div>
      ))}
    </div>
  );
};
