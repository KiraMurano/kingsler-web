/**
 * Высота следует за содержимым, а не прыгает кадром.
 *
 * `layout="size"` рисует смену размера через scale и тянет текст. Здесь
 * высота — обычное число: блок едет к новой мере, а буквы остаются собой.
 *
 * `overflow: hidden` на покое режет подсказки над кнопками, поэтому по
 * умолчанию режем только пока высота едет.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

const EASE = [0.4, 0, 0.2, 1] as const;

export const AutoHeight: React.FC<{
  children: React.ReactNode;
  duration: number;
  reduce?: boolean;
  /** Подсказки живут внутри — прятать вылезающее только на время хода. */
  clip?: 'always' | 'during';
}> = ({ children, duration, reduce, clip = 'during' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);
  const [height, setHeight] = useState<number | null>(null);
  const [clipping, setClipping] = useState(clip === 'always');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = Math.round(el.offsetHeight);
      setHeight(h => (h === next ? h : next));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (height !== null) seeded.current = true;
  }, [height]);

  const hideOverflow = !reduce && (clip === 'always' || clipping);

  return (
    <motion.div
      initial={false}
      animate={reduce || height === null ? undefined : { height }}
      transition={{ duration: seeded.current ? duration : 0, ease: EASE }}
      onAnimationStart={() => {
        if (clip === 'during') setClipping(true);
      }}
      onAnimationComplete={() => {
        if (clip === 'during') setClipping(false);
      }}
      style={{ overflow: hideOverflow ? 'hidden' : 'visible', width: '100%' }}
    >
      <div ref={ref}>{children}</div>
    </motion.div>
  );
};
