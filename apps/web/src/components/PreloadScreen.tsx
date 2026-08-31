/**
 * Экран прогрева: пока арты двора едут в кэш.
 *
 * Показывается не всегда и намеренно — правила показа живут в
 * `useAssetPreload`: на прогретом кэше всё готово за десятки миллисекунд, и
 * экран, мелькнувший на два кадра, читается как сбой. Здесь только то, как он
 * выглядит.
 *
 * Полоса заполняется трансформой, а не шириной: ширина пересчитывает раскладку
 * на каждый прогруженный файл — а их семь десятков, — и полоса дёргается.
 * `scaleX` живёт на композиторе и не трогает ничего вокруг.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Brand } from './Brand';

const EASE = [0.16, 1, 0.3, 1] as const;

export const PreloadScreen: React.FC<{ visible: boolean; ratio: number }> = ({
  visible,
  ratio
}) => {
  const reduce = !!useReducedMotion();
  const percent = Math.round(ratio * 100);

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          className="preload"
          role="status"
          aria-live="polite"
          aria-label={`Двор готовится: ${percent}%`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          /* Уходит дольше, чем приходит: приход — это начало ожидания, уход —
             его конец, и обрывать его резко значит подменять стол рывком. */
          exit={{ opacity: 0, transition: { duration: reduce ? 0.15 : 0.5, ease: EASE } }}
          transition={{ duration: reduce ? 0.15 : 0.25, ease: EASE }}
        >
          <div className="preload__inner">
            <Brand />
            <span className="preload__sub">Двор готовится к приёму</span>

            <span className="preload__bar">
              <motion.span
                className="preload__fill"
                initial={false}
                animate={{ scaleX: Math.max(0.02, ratio) }}
                transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
              />
            </span>

            <span className="preload__count">{percent}%</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
