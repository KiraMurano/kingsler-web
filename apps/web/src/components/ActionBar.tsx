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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { X } from 'lucide-react';
import { dur } from '../motion/tokens.ts';
import { AutoHeight } from './ui/AutoHeight';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { TokenCost } from './ui/TokenCost';
import type { BarActionKind, TableView } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;
const SLIDE = 8;
/** Первое появление и возврат после закрытия — одна пауза. */
const PROMPT_DELAY_MS = 10000;

/** Жест слева от подписи — те же руки, что на портрете. */
const HAND: Partial<Record<BarActionKind, { src: string; down?: boolean }>> = {
  believe: { src: '/assets/ui/thumbsup-500.webp' },
  'veto-pass': { src: '/assets/ui/thumbsup-500.webp' },
  doubt: { src: '/assets/ui/thumbsup-500.webp', down: true },
  veto: { src: '/assets/ui/stop-500.webp' }
};

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
   * Подсказка принадлежит ОДНОМУ ожиданию.
   *
   * `waitingFor` меняется вместе с вопросом: тогда плашка гаснет и часы
   * заводятся заново. Закрытие не меняет вопроса — только прячет плашку
   * на ту же паузу, после которой она вернётся.
   */
  const waitingFor = promptActive ? `${view.phase}~${promptKey ?? ''}` : null;
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  const arm = (ms: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setVisible(true);
    }, ms);
  };

  useEffect(() => {
    setVisible(false);
    if (waitingFor === null) {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      return;
    }
    arm(PROMPT_DELAY_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [waitingFor]);

  const dismiss = () => {
    setVisible(false);
    arm(PROMPT_DELAY_MS);
  };

  const showPrompt = waitingFor !== null && visible;

  const item = useMemo<Variants>(
    () =>
      reduce
        ? {
            hidden: { opacity: 0 },
            shown: { opacity: 1, transition: { duration: fade, ease: EASE } },
            gone: { opacity: 0, transition: { duration: fade, ease: EASE } }
          }
        : {
            hidden: { opacity: 0, y: travel, scale: 0.97 },
            shown: (i: number) => ({
              opacity: 1,
              y: 0,
              scale: 1,
              transition: { duration: fade, ease: EASE, delay: i * dur.stagger }
            }),
            gone: {
              opacity: 0,
              y: -travel,
              scale: 0.97,
              pointerEvents: 'none',
              transition: { duration: fade * 0.8, ease: EASE }
            }
          },
    [reduce, fade, travel]
  );

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {promptActive && showPrompt && (
            <motion.div
              className="waitprompt"
              initial={{ opacity: 0, y: travel ? 10 : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: travel ? 8 : 0 }}
              transition={{ duration: fade, ease: EASE }}
            >
              <span
                className={
                  reduce ? 'waitprompt__plaque' : 'waitprompt__plaque waitprompt__plaque--live'
                }
              >
                Двор ждёт ваш выбор, милорд
                <button
                  type="button"
                  className="waitprompt__close"
                  onClick={dismiss}
                  aria-label="Скрыть"
                >
                  <X size={16} strokeWidth={2.25} />
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <div className="actionbar">
        {/* По кнопке, не весь набор: `wait` гасил ряд до пустоты, и смена
            фаз читалась как вырезание. `popLayout` снимает уходящую с потока,
            высота колонки едет в `AutoHeight`, а не прыгает. */}
        <AutoHeight duration={fade} reduce={reduce} clip="during">
          <div className="actionbar__col">
            <AnimatePresence initial={false} mode="popLayout">
              {view.bar.map((b, i) => {
                const hand = HAND[b.kind];
                return (
                  <motion.div
                    key={b.kind}
                    className="actionbar__item"
                    custom={i}
                    variants={item}
                    initial="hidden"
                    animate="shown"
                    exit="gone"
                  >
                    <Tooltip text={b.disabled ? b.reason : b.hint} tapToOpen={b.disabled}>
                      <Button
                        className={hand ? 'actionbar__cell' : ''}
                        tone={b.tone}
                        size="lg"
                        block
                        disabled={b.disabled}
                        onClick={() => onAct(b.kind)}
                      >
                        {hand && (
                          <img
                            className={`actionbar__hand${hand.down ? ' actionbar__hand--down' : ''}`}
                            src={hand.src}
                            alt=""
                            draggable={false}
                          />
                        )}
                        <span className="actionbar__label">{b.label}</span>
                        {b.spendsToken && <TokenCost size="lg" />}
                      </Button>
                    </Tooltip>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </AutoHeight>
      </div>
    </>
  );
};
