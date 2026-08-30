import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { StakedCardArena } from './StakedCardArena';
import { Button } from './ui/Button';
import type { GameCard } from '@kinglier/engine/types';
import type { PendingTargetAction } from './targeting';
import { dur } from '../motion/tokens.ts';
import { designRect, designViewport } from '../lib/uiScale.ts';

/** Что просят сделать за столом и как от этого отказаться. */
export interface ArenaPrompt {
  text: React.ReactNode;
  onCancel: () => void;
}

interface ArenaProps {
  pendingTargetAction: PendingTargetAction | null;
  onCancelTarget: () => void;
  /**
   * Просьба, висящая над столом: выбрать жертву, отметить карты к обмену.
   * Баннер один на всех — сколько бы поводов его показать ни завелось, выглядят
   * и ведут себя они одинаково.
   */
  prompt?: ArenaPrompt | null;
  /**
   * Vestigial: card inspection moved to the card layer along with the cards
   * themselves. Kept so `App` still typechecks until it stops passing it.
   */
  onInspectCard?: (card: GameCard) => void;
}

/** Где стоит баннер: доля высоты стола, отсчитанная от его нижнего края. */
const BAR_BOTTOM = 0.28;

export const Arena: React.FC<ArenaProps> = ({ pendingTargetAction, onCancelTarget, prompt }) => {
  const reduce = !!useReducedMotion();
  /* `.targetbar` centres itself with the `translate` property rather than
     with `transform`, precisely so that the two never fight: `transform`
     belongs to motion here. */
  const rise = reduce ? 0 : 8;

  /*
   * Баннер выбора цели рисуется порталом в `body`, а не внутри арены.
   *
   * Арена живёт на `z-index: 70` и этим заводит собственную стопку, а слой
   * карт — на 75. Что бы баннер себе ни назначил, он оставался под картами:
   * лежащая рядом интрига наезжала на него. Поднять саму арену нельзя — её
   * же мебель встанет поверх карт, которые в неё летят.
   *
   * Координаты снимаются с самой арены: она растянута `inset: 0` по столу,
   * так что её прямоугольник — это и есть стол. Пока баннер открыт, стол не
   * переезжает, поэтому хватает замера при появлении и пересчёта на resize.
   */
  const arena = useRef<HTMLElement>(null);
  const [at, setAt] = useState<{ x: number; bottom: number } | null>(null);
  const banner: ArenaPrompt | null =
    prompt ??
    (pendingTargetAction
      ? {
          text: (
            <>
              Выберите цель для <strong>«{pendingTargetAction.name}»</strong>
            </>
          ),
          onCancel: onCancelTarget
        }
      : null);
  const open = !!banner;

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const node = arena.current;
      if (!node) return;
      const r = designRect(node);
      setAt({
        x: r.left + r.width / 2,
        bottom: designViewport().height - (r.bottom - r.height * BAR_BOTTOM)
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  return (
    <section className="arena" ref={arena}>
      {/* Deck and discard used to be two invisible points just inside the
          felt's rim. They are real piles now, standing outside the table
          where they cannot collide with a seat panel — see `CardPiles`. */}
      <div className="stage">
        <StakedCardArena />
      </div>

      {createPortal(
        <AnimatePresence>
          {banner && at && (
            <motion.div
              key="targetbar"
              className="targetbar"
              style={{ left: at.x, bottom: at.bottom }}
              initial={{ opacity: 0, y: rise }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: rise }}
              transition={{ duration: reduce ? 0.12 : dur.fade, ease: [0.4, 0, 0.2, 1] }}
            >
              <span>{banner.text}</span>
              <Button tone="danger" size="sm" onClick={banner.onCancel}>
                Отмена
              </Button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </section>
  );
};
