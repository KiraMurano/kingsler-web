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
 * Оболочка живёт всегда: `wait` по фазе гасил весь блок до пустоты, и высота
 * прыгала в ноль. Текст кроссфейдится на месте, высота едет к новой мере.
 */
import React, { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../motion/tokens.ts';
import { AutoHeight } from './ui/AutoHeight';
import { renderWithIcons } from './ui/Icon';
import type { PhaseKind, TableView } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;

/** Фазы, в которых колонка горит тревожным цветом. */
const ALERT: PhaseKind[] = [
  'doubt',
  'reveal',
  'under-attack',
  'veto',
  'coronation'
];

export const PhasePanel: React.FC<{ view: TableView }> = ({ view }) => {
  const reduce = !!useReducedMotion();
  const fade = reduce ? 0.12 : dur.panel;
  const alert = ALERT.includes(view.phase);
  const titleKey = `${view.title}|${view.titleName ?? ''}`;
  const copyKey = `${view.event}|${view.guidance}`;
  const swap = useMemo(
    () =>
      reduce
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
        : {
            initial: { opacity: 0, filter: 'blur(2px)' },
            animate: { opacity: 1, filter: 'blur(0px)' },
            exit: { opacity: 0, filter: 'blur(2px)' }
          },
    [reduce]
  );

  return (
    <aside className={`phase ${alert ? 'phase--alert' : ''}`}>
      <AutoHeight duration={fade} reduce={reduce} clip="always">
        <div className="phase__view">
          <div className="phase__title">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={titleKey}
                className="phase__title-line"
                initial={swap.initial}
                animate={swap.animate}
                exit={swap.exit}
                transition={{ duration: reduce ? 0.1 : dur.fade, ease: EASE }}
              >
                {view.title}
                {view.titleName && (
                  <>
                    {': '}
                    {/* Ник — как его завёл игрок: капитель заголовка сюда не идёт. */}
                    <span className="phase__title-name">{view.titleName}</span>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Один блок, а не два: сначала что случилось, следом что делать.
              Разделительной линии между ними нет намеренно — это одна мысль. */}
          <div className="phase__guidance">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={copyKey}
                className="phase__copy"
                initial={swap.initial}
                animate={swap.animate}
                exit={swap.exit}
                transition={{ duration: reduce ? 0.1 : dur.fade, ease: EASE }}
              >
                {view.event && (
                  <span className="phase__event">{renderWithIcons(view.event)} </span>
                )}
                {view.guidance}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </AutoHeight>
    </aside>
  );
};
