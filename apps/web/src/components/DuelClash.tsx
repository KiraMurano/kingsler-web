/**
 * Стычка: сноп искр в момент, когда карты сходятся.
 *
 * Сам сноп — общий (`motion/Sparks.tsx`), здесь остаётся только то, что
 * принадлежит дуэли: когда бить и куда. Пока искрила одна дуэль, физика жила
 * прямо тут; как только их попросила и сработавшая интрига, держать копию
 * холста рядом стало нельзя.
 */
import React, { useEffect } from 'react';
import { useReducedMotion } from 'motion/react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useAnchorRects } from '../motion/AnchorRegistry.tsx';
import { strike } from '../motion/Sparks.tsx';
import { zoneKey } from '../motion/zones.ts';

/**
 * Через сколько после начала дуэли карты сходятся, мс.
 *
 * Спросить об этом слой карт было бы честнее, но его признак прибытия —
 * попадание пружины в порог `0.6 px` — при заминке кадров не срабатывает
 * вовсе, так что ждать его нельзя.
 *
 * Бьём с опережением, а не по факту сближения. Пружина подходит к цели
 * асимптотически, и «точный» момент встречи — это когда карты уже стоят:
 * искра тогда читается как отдельное событие после движения, а не как его
 * причина. Удар на подлёте глаз связывает со столкновением.
 */
const CLASH_AT_MS = 450;

export const DuelClash: React.FC = () => {
  const rects = useAnchorRects();
  const reduce = !!useReducedMotion();

  /* Дуэль началась — значит, карты уже летят навстречу. Ждём, пока сойдутся,
     и бьём искрой в точку встречи. Замер делается в момент удара, а не сейчас:
     к тому времени карты уже стоят, и края у них там, где надо. */
  const duelLive = useGameStore(
    s =>
      s.pendingDuelDefenderCardId !== null &&
      (s.turnPhase === 'DUEL_CLASH' || s.turnPhase === 'DUEL_OUTCOME')
  );

  useEffect(() => {
    if (!duelLive || reduce) return;
    const timer = setTimeout(() => {
      const attacker = rects.get(zoneKey({ kind: 'duel', side: 'attacker' }));
      const defender = rects.get(zoneKey({ kind: 'duel', side: 'defender' }));
      if (!attacker || !defender) return;

      /* Точка удара — там, где смыкаются обращённые друг к другу края карт. */
      const [left, right] =
        attacker.left <= defender.left ? [attacker, defender] : [defender, attacker];
      strike(
        (left.right + right.left) / 2,
        (left.top + left.height / 2 + right.top + right.height / 2) / 2
      );
    }, CLASH_AT_MS);
    return () => clearTimeout(timer);
  }, [duelLive, reduce, rects]);

  return null;
};
