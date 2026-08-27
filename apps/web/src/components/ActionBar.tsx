/**
 * Фазовые кнопки — низ правой колонки.
 *
 * Стоят под блоком, который рассказывает, что происходит, и прижаты к низу
 * колонки: рассказ сверху может стать длиннее или короче, а кнопки обязаны
 * оставаться там, где рука их уже нашла.
 *
 * Набор берётся из `TableView`, поэтому он всегда согласован с тем, что
 * написано выше. Глухая кнопка остаётся на месте, а причину рассказывает
 * тултипом: подпись внутри кнопки меняла её высоту и заставляла ряд плясать.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../motion/tokens.ts';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { TokenCost } from './ui/TokenCost';
import { VetoTimerBar } from './VetoTimerBar';
import type { BarActionKind, TableView } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;
const SLIDE = 8;

export const ActionBar: React.FC<{
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
      <div className="actionbar__col">
        {view.bar.map(b => (
          <Tooltip key={b.kind} text={b.disabled ? b.reason : b.hint} tapToOpen={b.disabled}>
            <Button
              tone={b.tone}
              size="lg"
              block
              disabled={b.disabled}
              onClick={() => onAct(b.kind)}
            >
              {b.label}
              {b.spendsToken && <TokenCost blocked={b.disabled} />}
            </Button>
          </Tooltip>
        ))}
      </div>
    ) : null;

  return (
    <div className="actionbar">
      {/* `wait`, а не `popLayout`: наложенные друг на друга наборы кнопок
          читаются как грязь — см. комментарий в `PhasePanel`. */}
      <AnimatePresence mode="wait" initial={false}>
        {content && (
          <motion.div
            key={view.phase}
            className="actionbar__view"
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
