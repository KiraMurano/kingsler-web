/**
 * Подсказка над элементом.
 *
 * Живёт на обёртке, а не на самой кнопке: браузер не шлёт событий указателя
 * глухим `<button disabled>`, а объяснить, почему кнопка глуха, нужно как раз
 * тогда, когда она глуха.
 *
 * На тач-экранах нет наведения, поэтому подсказка открывается по долгому
 * нажатию на живой кнопке и по обычному тапу на глухой — тап по глухой кнопке
 * всё равно ничего не делает, так пусть хотя бы объясняет.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../../motion/tokens.ts';

const EASE = [0.4, 0, 0.2, 1] as const;

/** Пауза перед показом на мыши: без неё подсказки вспыхивают при проносе. */
const HOVER_DELAY_MS = 380;

/** Сколько держать палец, чтобы подсказка открылась на живой кнопке. */
const LONG_PRESS_MS = 420;

/** Сколько подсказка висит после тача, прежде чем уйти сама. */
const TOUCH_HOLD_MS = 2600;

export const Tooltip: React.FC<{
  text?: string;
  /** Глухой элемент открывает подсказку обычным тапом, а не удержанием. */
  tapToOpen?: boolean;
  children: React.ReactNode;
}> = ({ text, tapToOpen, children }) => {
  const [open, setOpen] = useState(false);
  const reduce = !!useReducedMotion();
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  if (!text) return <>{children}</>;

  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimers();
    later(() => setOpen(true), HOVER_DELAY_MS);
  };

  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimers();
    setOpen(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    clearTimers();
    const показать = () => {
      setOpen(true);
      later(() => setOpen(false), TOUCH_HOLD_MS);
    };
    if (tapToOpen) показать();
    else later(показать, LONG_PRESS_MS);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || tapToOpen) return;
    /* Палец убрали раньше, чем сработало удержание, — значит это был обычный
       тап по живой кнопке, и подсказку показывать не надо. */
    if (!open) clearTimers();
  };

  return (
    <span
      className="tt"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={clearTimers}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            className="tt__bubble"
            role="tooltip"
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : 2 }}
            transition={{ duration: reduce ? 0.1 : dur.fade, ease: EASE }}
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};
