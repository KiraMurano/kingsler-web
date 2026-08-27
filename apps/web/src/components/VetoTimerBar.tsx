/**
 * Полоска окна вето — на месте кнопок, в нижней части правой колонки.
 *
 * Заливка и цифра секунд ведутся motion-значениями из `useAnimationFrame`, а
 * не состоянием: за все семь секунд компонент не рендерится ни разу. Цифра
 * отдаётся `motion.span` как MotionValue-ребёнок — motion обновляет
 * textContent напрямую, минуя React.
 *
 * Отсчёт идёт от абсолютного `deadlineAt`, а не от локального «осталось»:
 * в онлайне снимок состояния приходит с задержкой, и относительный отсчёт
 * начинался бы с уже потраченного времени.
 */
import React from 'react';
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'motion/react';
import { VETO_WINDOW_MS } from '@kinglier/engine/timing';

/** Сколько последних миллисекунд окна полоска стоит багровой. */
const WARN_MS = 2000;

export const VetoTimerBar: React.FC<{ deadlineAt: number }> = ({ deadlineAt }) => {
  const progress = useMotionValue(1);

  useAnimationFrame(() => {
    const left = Math.max(0, deadlineAt - Date.now());
    progress.set(left / VETO_WINDOW_MS);
  });

  const seconds = useTransform(progress, p => String(Math.ceil(p * (VETO_WINDOW_MS / 1000))));
  /* Последние две секунды полоска уходит в багровый — предупреждение читается
     цветом раньше, чем цифрой. Порог считается из этих двух секунд, а не задан
     долей: длину окна крутят в `VETO_WINDOW_MS`, и доля уехала бы вместе с ней. */
  /* Потолок на случай, если окно однажды окажется короче самого предупреждения:
     стопы `useTransform` обязаны идти строго по возрастанию. */
  const warn = Math.min(WARN_MS / VETO_WINDOW_MS, 0.9);
  const fill = useTransform(progress, [0, warn - 0.01, warn, 1], [
    'var(--crimson-soft)',
    'var(--crimson-soft)',
    'var(--gold)',
    'var(--gold)'
  ]);

  return (
    <div className="vetobar" role="timer">
      <div className="vetobar__head">
        <span className="vetobar__label">Окно вето</span>
        <motion.span className="vetobar__secs">{seconds}</motion.span>
      </div>
      <div className="vetobar__track">
        <motion.div
          className="vetobar__fill"
          style={{ scaleX: progress, backgroundColor: fill }}
        />
      </div>
    </div>
  );
};
