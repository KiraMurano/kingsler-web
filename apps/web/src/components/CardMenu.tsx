/**
 * Ряд кнопок над картой.
 *
 * Рисуется порталом в `document.body`, а не внутри слота руки, и вот почему.
 * Геройская строка живёт на `z-index: 72`, а слой карт — на 75, поэтому всё,
 * что лежит внутри строки, оказывается под картами: лежащая рядом карта
 * наезжала на меню. Поднять саму строку нельзя — тогда карты в руке уйдут под
 * рамку слота и под панель герба. Портал выносит меню из этой стопки целиком.
 *
 * Позиция берётся из реестра якорей: слот руки уже зарегистрирован там ради
 * полётов карт, так что второго источника геометрии заводить не нужно. Пока
 * меню открыто, карта лежит неподвижно, поэтому одного замера при открытии
 * хватает — плюс пересчёт на изменение размера окна.
 *
 * Коробки у меню нет: кнопки стоят на сукне сами по себе, как и в правой
 * колонке, и держатся не подложкой, а собственной заливкой.
 */
import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Search } from 'lucide-react';
import { dur, spring } from '../motion/tokens.ts';
import { useAnchorRects } from '../motion/AnchorRegistry.tsx';
import { zoneKey } from '../motion/zones.ts';
import type { Zone } from '../motion/zones.ts';
import { Tooltip } from './ui/Tooltip';
import { TokenCost } from './ui/TokenCost';
import type { CardMenuKind, CardMenuOption } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;

/** Просвет над картой. Считает подъём выбранной карты и её рост на наведении. */
const CLEARANCE = 28;

export const CardMenu: React.FC<{
  open: boolean;
  zone: Zone;
  options: CardMenuOption[];
  onPick: (kind: CardMenuKind) => void;
}> = ({ open, zone, options, onPick }) => {
  const reduce = !!useReducedMotion();
  const rects = useAnchorRects();
  const key = zoneKey(zone);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = rects.get(key);
      if (r) setAt({ x: r.left + r.width / 2, y: r.top - CLEARANCE });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, key, rects]);

  return createPortal(
    <AnimatePresence>
      {open && at && (
        <motion.div
          className="cardmenu"
          style={{ left: at.x, top: at.y }}
          initial={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.96 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: reduce ? { duration: 0.12 } : spring.hover
          }}
          exit={{
            opacity: 0,
            y: reduce ? 0 : 6,
            scale: reduce ? 1 : 0.97,
            transition: { duration: reduce ? 0.12 : dur.fade, ease: EASE }
          }}
          /* Клик по меню не должен доходить до сцены — она закрывает меню. */
          onPointerDown={e => e.stopPropagation()}
        >
          {options.map((o, i) => (
            <Tooltip key={o.kind} text={o.disabled ? o.reason : o.hint} tapToOpen={o.disabled}>
              <motion.button
                type="button"
                className={`cardmenu__item cardmenu__item--${o.tone}${
                  o.kind === 'inspect' ? ' cardmenu__item--icon' : ''
                }`}
                disabled={o.disabled}
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: {
                    delay: reduce ? 0 : i * dur.stagger,
                    duration: dur.fade,
                    ease: EASE
                  }
                }}
                onClick={() => onPick(o.kind)}
              >
                {/* «Подробнее» — единственный пункт, который ничего не меняет в
                    партии, поэтому он сжат до лупы и не делит ряд наравне с
                    решениями. */}
                {o.kind === 'inspect' ? (
                  <Search size={17} aria-label={o.label} />
                ) : (
                  <>
                    <span className="cardmenu__label">{o.label}</span>
                    {o.spendsToken && <TokenCost blocked={o.tokenBlocked} size="xs" />}
                  </>
                )}
              </motion.button>
            </Tooltip>
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
