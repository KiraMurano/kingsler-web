/**
 * Правая колонка: что происходит и что делать. Ни одной кнопки.
 *
 * Она сознательно скупа. Всё, что нарисовано за столом — чьи жетоны, какой у
 * карты арт, кто уже ответил, — колонка не повторяет: это было бы вторым,
 * худшим экземпляром того же самого. Она отвечает на единственный вопрос, на
 * который стол не отвечает: «что сейчас и что мне делать».
 *
 * Заголовок меняется через `AnimatePresence` по фазе, а фраза — кроссфейдом
 * внутри постоянного узла: внутри одной фазы она может уточниться (сменился
 * заявитель, пришла новая заявка), и ради этого пересоздавать вид незачем.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../motion/tokens.ts';
import { CrossfadeText } from './ui/CrossfadeText';
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
      /* Рамка переживает любую смену вида, поэтому её высоту можно
         интерполировать, а не переключать скачком. */
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
          <div className="phase__guidance">
            <CrossfadeText>{view.guidance}</CrossfadeText>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.aside>
  );
};
