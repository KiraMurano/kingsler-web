/**
 * Единственное место с фазовыми кнопками — прямо над рукой.
 *
 * Всё, что решается не картой, решается здесь; всё остальное — меню на карте.
 * Набор кнопок берётся из `TableView`, поэтому он всегда согласован с тем, что
 * рассказывает правая колонка.
 *
 * Глухая кнопка остаётся на месте и называет причину одним словом. Прятать её
 * нельзя: исчезнувший вариант неопытный игрок читает как поломку.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../motion/tokens.ts';
import { Button } from './ui/Button';
import { VetoTimerBar } from './VetoTimerBar';
import type { BarActionKind, TableView } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;
const SLIDE = 8;

export const HandBar: React.FC<{
  view: TableView;
  onAct: (kind: BarActionKind) => void;
}> = ({ view, onAct }) => {
  const reduce = !!useReducedMotion();
  const fade = reduce ? 0.12 : dur.panel;
  const travel = reduce ? 0 : SLIDE;

  const content =
    view.phase === 'veto' && view.deadlineAt !== null ? (
      <VetoTimerBar deadlineAt={view.deadlineAt} />
    ) : view.bar.length > 0 ? (
      <div className="handbar__row">
        {view.bar.map(b => (
          <Button
            key={b.kind}
            tone={b.tone}
            size="lg"
            disabled={b.disabled}
            sub={b.disabled ? b.reason : undefined}
            onClick={() => onAct(b.kind)}
          >
            {b.label}
          </Button>
        ))}
      </div>
    ) : null;

  return (
    <div className="handbar">
      {/* `wait`, а не `popLayout`: наложенные друг на друга наборы кнопок
          читаются как грязь — см. комментарий в `PhasePanel`. */}
      <AnimatePresence mode="wait" initial={false}>
        {content && (
          <motion.div
            key={view.phase}
            className="handbar__view"
            initial={{ opacity: 0, y: travel }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: travel }}
            transition={{ duration: fade, ease: EASE }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
