/**
 * Число, которое меняется без ремаунта.
 *
 * Раньше `.res__n` получал `key={String(value)}`, чтобы CSS-анимация
 * `rise-in` запускалась заново. Ремаунт ради анимации — это ремаунт, и на
 * каждом изменении золота узел исчезал и появлялся. Здесь узел живёт всегда,
 * а меняется значение внутри motion-значения: React не рендерится ни разу за
 * время анимации — `motion.span` пишет в textContent напрямую.
 */
import React, { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { dur } from '../../motion/tokens.ts';

const EASE = [0.4, 0, 0.2, 1] as const;

export const AnimatedNumber: React.FC<{ value: number; className?: string }> = ({
  value,
  className
}) => {
  const reduce = !!useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, latest => String(Math.round(latest)));
  const first = useRef(true);

  useEffect(() => {
    /* Первое появление — не изменение: счётчик, отсчитывающий от нуля при
       раздаче, читался бы как событие, которого не было. */
    if (first.current || reduce) {
      first.current = false;
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: dur.panel, ease: EASE });
    return () => controls.stop();
  }, [value, mv, reduce]);

  return <motion.span className={className}>{text}</motion.span>;
};
