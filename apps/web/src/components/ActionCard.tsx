/**
 * Обычное действие — арт с крупным именем, описание на сплошной полосе снизу.
 *
 * Раньше это были строки без арта, и комментарий над ними объяснял почему: «у
 * них нет ни лица, ни арта, и крупная плитка обещала больше, чем в них есть».
 * Теперь лицо у них есть, и обещание стало правдой — четыре действия двора
 * перестали быть списком настроек и читаются как то же, чем играют.
 *
 * Арт — широкая полоса, не карта: обычное действие картой не является.
 * Имя лежит на картинке, правило — уже на заливке под ней, чтобы буквы
 * не боролись с артом.
 *
 * Компонент один на попап двора и на кодекс. Место, где показывают одно и
 * то же, должно показывать это одинаково, а два похожих блока в двух файлах
 * расходятся на первой же правке.
 *
 * Наклон к курсору — та же формула, что у карт за столом (`cardTilt`): иначе
 * «как карты» разошлось бы с картами на первой правке предела.
 */
import React from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import type { InspectableItem } from '@kinglier/engine/data/cardDescriptions';
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { cardArt } from '../lib/cardArt.ts';
import { cardTilt } from '../lib/cardTilt.ts';
import { spring, tilt } from '../motion/tokens.ts';

export const ActionCard: React.FC<{
  action: InspectableItem;
  /** Плашка в правом верхнем углу: цена или состояние. */
  badge?: React.ReactNode;
  /** Описание под названием. */
  children: React.ReactNode;
  /**
   * Действие сейчас недоступно.
   *
   * Не `disabled`: тот глушит клики по всему, что внутри кнопки, а внутри
   * «Распустить слух» живут ссылки на карты — прочитать про «Королевский
   * приём» должно быть можно и тогда, когда на само действие не хватает
   * золота. Кнопка остаётся кнопкой и остаётся в обходе с клавиатуры, а
   * недоступность объявляет `aria-disabled`.
   */
  off?: boolean;
  onClick?: () => void;
}> = ({ action, badge, children, off = false, onClick }) => {
  const info = CARD_DESCRIPTIONS[action];
  const reduce = !!useReducedMotion();
  const tiltXTarget = useMotionValue(0);
  const tiltYTarget = useMotionValue(0);
  const tiltX = useSpring(tiltXTarget, spring.hover);
  const tiltY = useSpring(tiltYTarget, spring.hover);

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const next = cardTilt(
      e.currentTarget.getBoundingClientRect(),
      e.clientX,
      e.clientY,
      tilt.pointerMax
    );
    tiltXTarget.set(next.x);
    tiltYTarget.set(next.y);
  };

  const releaseTilt = () => {
    tiltXTarget.set(0);
    tiltYTarget.set(0);
  };

  return (
    <div className="actioncard__tilt">
      <motion.button
        type="button"
        className={`actioncard${off ? ' actioncard--off' : ''}`}
        aria-disabled={off}
        style={{
          rotateX: reduce ? 0 : tiltX,
          rotateY: reduce ? 0 : tiltY,
          transformStyle: 'preserve-3d'
        }}
        whileHover={
          !off && !reduce ? { y: -10, scale: 1.03, transition: spring.hover } : undefined
        }
        whileTap={!off && !reduce ? { scale: 0.97, transition: spring.press } : undefined}
        onPointerMove={onPointerMove}
        onPointerLeave={releaseTilt}
        onPointerDown={releaseTilt}
        onClick={onClick}
      >
        <span
          className="actioncard__art"
          style={info.artImage ? { backgroundImage: `url(${cardArt(info.artImage, 512)})` } : undefined}
        >
          <span className="actioncard__head">
            <span className="actioncard__name">{info.name}</span>
            {badge}
          </span>
        </span>
        <span className="actioncard__desc">
          <span>{children}</span>
        </span>
      </motion.button>
    </div>
  );
};
