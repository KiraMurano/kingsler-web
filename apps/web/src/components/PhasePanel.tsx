/**
 * Правая колонка, верхний блок: что происходит. Ни одной кнопки.
 *
 * Заголовок отвечает «где мы», а один абзац под ним — «что случилось и что
 * теперь делать». Именно один: два блока с чертой между ними читались как две
 * разные мысли, хотя это одна.
 *
 * Событие пишется коротко и своими словами, а не строкой летописи: летопись
 * подробна, потому что она для разбора партии, а здесь нужно то, что читается
 * краем глаза, не отрываясь от стола. Подробности — за кнопкой «Летопись».
 *
 * `mode="wait"`, а не `popLayout`: `popLayout` кладёт уходящий вид в
 * `position: absolute` поверх приходящего, и два разных текста печатаются друг
 * на друге всё время кроссфейда.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../motion/tokens.ts';
import { renderWithIcons } from './ui/Icon';
import type { PhaseKind, TableView } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;
const SLIDE = 6;

/** Фазы, в которых колонка горит тревожным цветом. */
const ALERT: PhaseKind[] = [
  'doubt',
  'reveal',
  'under-attack',
  'duel-answer',
  'veto',
  'coronation'
];

export const PhasePanel: React.FC<{ view: TableView }> = ({ view }) => {
  const reduce = !!useReducedMotion();
  const fade = reduce ? 0.12 : dur.panel;
  const travel = reduce ? 0 : SLIDE;
  const alert = ALERT.includes(view.phase);

  return (
    <motion.aside
      className={`phase ${alert ? 'phase--alert' : ''}`}
      layout={reduce ? false : 'size'}
      transition={{ layout: { duration: fade, ease: EASE } }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view.phase}
          className="phase__view"
          initial={{ opacity: 0, y: -travel }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: travel }}
          transition={{ duration: fade, ease: EASE }}
        >
          <div className="phase__title">{view.title}</div>


          {/* Один блок, а не два: сначала что случилось, следом что делать.
              Разделительной линии между ними нет намеренно — это одна мысль. */}
          <div className="phase__guidance">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${view.event}|${view.guidance}`}
                initial={{ opacity: 0, y: reduce ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -4 }}
                transition={{ duration: reduce ? 0.1 : dur.fade, ease: EASE }}
              >
                {view.event && (
                  <span className="phase__event">{renderWithIcons(view.event)} </span>
                )}
                {view.guidance}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.aside>
  );
};
