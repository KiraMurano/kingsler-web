/**
 * Столбик кнопок над картой.
 *
 * Живёт внутри `.hand__slot`, а не в `CardLayer`: слой карт весь построен на
 * `scale` от базового размера, и меню внутри него масштабировалось бы вместе с
 * летящей картой. Слот стоит на месте всегда — меню тоже.
 *
 * Пункты приходят из `TableView` и потому всегда согласованы с тем, что пишет
 * правая колонка. Глухой пункт остаётся на месте и объясняет себя тултипом:
 * исчезнувший вариант неопытный игрок читает как поломку.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur, spring } from '../motion/tokens.ts';
import { Tooltip } from './ui/Tooltip';
import { TokenCost } from './ui/TokenCost';
import type { CardMenuKind, CardMenuOption } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;

export const CardMenu: React.FC<{
  open: boolean;
  options: CardMenuOption[];
  onPick: (kind: CardMenuKind) => void;
}> = ({ open, options, onPick }) => {
  const reduce = !!useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cardmenu"
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
            <Tooltip
              key={o.kind}
              text={o.disabled ? o.reason : o.hint}
              tapToOpen={o.disabled}
            >
              <motion.button
                type="button"
                className={`cardmenu__item cardmenu__item--${o.tone}`}
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
                <span className="cardmenu__label">{o.label}</span>
                {o.spendsToken && <TokenCost blocked={o.tokenBlocked} size="xs" />}
              </motion.button>
            </Tooltip>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
