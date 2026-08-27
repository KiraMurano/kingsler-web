/**
 * Правая колонка, верхний блок: что происходит. Ни одной кнопки.
 *
 * Три строки и не больше. Название фазы отвечает «где мы», строка летописи —
 * «что только что случилось», подсказка — «что делать». Летопись берётся слово
 * в слово: она уже пишет события подробно и единообразно, а два независимых
 * пересказа одного события рано или поздно разойдутся.
 *
 * Ничего из того, что нарисовано за столом, здесь не повторяется: ни жетоны,
 * ни арт заявленной карты, ни список ответивших.
 *
 * `mode="wait"`, а не `popLayout`: `popLayout` кладёт уходящий вид в
 * `position: absolute` поверх приходящего, и два разных текста печатаются друг
 * на друге всё время кроссфейда.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../motion/tokens.ts';
import { courtly } from '../lib/text';
import { CrossfadeText } from './ui/CrossfadeText';
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
  const произошло = view.latest ? courtly(view.latest) : '';

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

          {произошло && (
            <div className="phase__latest">
              {/* Ключ по тексту: строка меняется чаще фазы, и менять её надо
                  кроссфейдом внутри блока, а не пересозданием всего вида. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={произошло}
                  initial={{ opacity: 0, y: reduce ? 0 : 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduce ? 0 : -4 }}
                  transition={{ duration: reduce ? 0.1 : dur.fade, ease: EASE }}
                >
                  {renderWithIcons(произошло)}
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          <div className="phase__guidance">
            <CrossfadeText>{view.guidance}</CrossfadeText>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.aside>
  );
};
