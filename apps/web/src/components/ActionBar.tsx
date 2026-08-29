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
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../motion/tokens.ts';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { TokenCost } from './ui/TokenCost';
import type { BarActionKind, TableView } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;
const SLIDE = 8;
const PROMPT_DELAY_MS = 7000;

export const ActionBar: React.FC<{
  view: TableView;
  onAct: (kind: BarActionKind) => void;
  promptKey?: string | number | null;
}> = ({ view, onAct, promptKey }) => {
  const reduce = !!useReducedMotion();
  const fade = reduce ? 0.12 : dur.panel;
  const travel = reduce ? 0 : SLIDE;

  const isReactionPhase =
    view.phase === 'doubt' || view.phase === 'veto' || view.phase === 'under-attack';
  const promptActive = view.bar.length > 0 && isReactionPhase;

  /*
   * Подсказка принадлежит ОДНОМУ ожиданию, и это её опознание.
   *
   * Хранится не «показывать ли», а то, для какого ожидания часы уже отсчитали.
   * Флаг пришлось бы гасить эффектом на каждую смену вопроса — то есть кадром
   * позже самой смены, — и подсказка от прошлого вопроса успевала мигнуть над
   * новым. Сравнение по значению гасит её в том же кадре, в котором вопрос
   * сменился, само собой.
   */
  const waitingFor = promptActive ? `${view.phase}~${promptKey ?? ''}` : null;
  const [nagged, setNagged] = useState<string | null>(null);

  useEffect(() => {
    if (waitingFor === null) return;
    const timer = window.setTimeout(() => setNagged(waitingFor), PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [waitingFor]);

  const showPrompt = waitingFor !== null && waitingFor === nagged;

  const content =
    view.bar.length > 0 ? (
      <div className="actionbar__col">
        <AnimatePresence>
          {promptActive && showPrompt && (
            <motion.div
              className="actionbar__prompt"
              initial={{ opacity: 0, y: -6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.94 }}
              transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1] }}
            >
              <span className="actionbar__prompt-block">Двор ждёт ваш выбор, милорд</span>
            </motion.div>
          )}
        </AnimatePresence>
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
              {b.spendsToken && <TokenCost blocked={b.tokenBlocked} />}
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
