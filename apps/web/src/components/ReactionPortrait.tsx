/**
 * Портрет игрока, который отвечает в окне сомнения.
 *
 * Раньше ответ показывался подписью рядом с именем. Подпись читается медленно и
 * тонет в чипе; лицо — быстрее всего. Поэтому состояние живёт прямо на
 * портрете: пока игрок думает — по краю ползёт дуга, ответил — кольцо
 * загорается цветом ответа, и на пару секунд из-за края выпрыгивает палец.
 *
 * Жест живёт ровно столько же, сколько ответ: он висит в углу портрета, лица
 * не закрывает и мешать не может, а читается быстрее любого кольца. Уходят они
 * вместе — когда действие закончилось.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { SeatReaction } from '../lib/seatReaction';
import { Portrait } from './Portrait';

/** Сколько кольцо гаснет, когда действие закончилось. */
const RING_FADE_S = 0.5;

/** Пружина с перелётом: жест должен выпрыгнуть, а не проявиться. */
const POP = { type: 'spring', stiffness: 520, damping: 13, mass: 0.6 } as const;

export const ReactionPortrait: React.FC<{
  src: string;
  name: string;
  className?: string;
  reaction: SeatReaction | null;
  /**
   * Игрок сидит справа от зрителя.
   *
   * Рука на картинке входит в кадр снизу слева, то есть жест направлен вправо —
   * к столу для тех, кто сидит слева и сверху. Правому его нужно отзеркалить,
   * иначе он показывает от стола наружу.
   */
  mirrored?: boolean;
}> = ({ src, name, className = '', reaction, mirrored }) => {
  const reduce = !!useReducedMotion();
  const answered = reaction === 'believed' || reaction === 'doubted';

  return (
    <span className={`rx ${reaction ? `rx--${reaction}` : ''}`}>
      <Portrait src={src} name={name} className={className}>
        {/* Заливка обрезается вместе с лицом, поэтому живёт внутри портрета, а
            кольцо и палец — снаружи: их обрезать нельзя. */}
        <AnimatePresence>
          {answered && (
            <motion.span
              className="rx__tint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.12 : RING_FADE_S, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>
      </Portrait>

      {/* Кольцо гаснет через `AnimatePresence`, а не пропадает вместе с
          ответом: снятое в один кадр, оно читается как сбой, а не как конец
          эпизода. `key` по ответу даёт кроссфейд, когда «верю» сменяется
          проверкой. */}
      <AnimatePresence>
        {reaction && (
          <motion.span
            key={reaction}
            className={`rx__ring rx__ring--${reaction}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : RING_FADE_S, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {answered && (
          <motion.span
            className="rx__thumb"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.2, rotate: -22 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.55 }}
            transition={reduce ? { duration: 0.12 } : POP}
          >
            <img
              className={[
                'rx__thumb-img',
                reaction === 'doubted' ? 'rx__thumb-img--down' : '',
                mirrored ? 'rx__thumb-img--mirror' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              src="/assets/ui/thumbsup-500.webp"
              alt=""
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};
