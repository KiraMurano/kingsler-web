/**
 * Смена строки кроссфейдом внутри постоянного узла.
 *
 * Замена приёму `<span key={text}>` с CSS `fade-in`: тот перемонтировал узел,
 * этот держит его на месте и перекрашивает содержимое. Обёртка накладывает
 * строки друг на друга через grid-область, поэтому уходящая и приходящая не
 * толкают соседей, пока идут навстречу.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../../motion/tokens.ts';

const EASE = [0.4, 0, 0.2, 1] as const;

export const CrossfadeText: React.FC<{ children: string; className?: string }> = ({
  children,
  className
}) => {
  const reduce = !!useReducedMotion();
  return (
    <span className={['xfade', className].filter(Boolean).join(' ')}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={children}
          className="xfade__line"
          initial={{ opacity: 0, y: reduce ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -4 }}
          transition={{ duration: reduce ? 0.12 : dur.fade, ease: EASE }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};
