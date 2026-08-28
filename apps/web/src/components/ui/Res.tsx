import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { courtly, resourceDeltaKind } from '../../lib/text';
import { UiIcon, renderWithIcons, type UiIconKind } from './Icon';
import { AnimatedNumber } from './AnimatedNumber';

/**
 * Resource chips. Visualised via crisp WebP resource icons.
 */
export type ResourceKind = 'gold' | 'crown' | 'seal' | 'act';

const RESOURCE_ICON_KIND: Record<ResourceKind, UiIconKind> = {
  gold: 'coin',
  crown: 'crown',
  seal: 'bulla',
  act: 'move'
};

const RESOURCE_LABEL: Record<ResourceKind, string> = {
  gold: 'Монеты',
  crown: 'Короны влияния — 6 удержанных корон дают победу',
  seal: 'Королевские печати — 2 печати превращаются в корону',
  act: 'Жетоны действия — по 2 в начале каждого хода'
};

export interface ResProps {
  kind: ResourceKind;
  value: React.ReactNode;
  suffix?: string;
  size?: 'sm' | 'lg';
  muted?: boolean;
  title?: string;
}

export const Res: React.FC<ResProps> = ({ kind, value, suffix, size = 'sm', muted, title }) => (
  <span
    className={['res', muted ? 'res--empty' : `res--${kind}`, size === 'lg' ? 'res--lg' : '']
      .filter(Boolean)
      .join(' ')}
    title={title ?? RESOURCE_LABEL[kind]}
  >
    <span className="res__i" aria-hidden>
      <UiIcon kind={RESOURCE_ICON_KIND[kind]} size={size === 'lg' ? 'md' : 'sm'} />
    </span>
    <span>
      <span className="res__n">
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        {suffix ? ` ${suffix}` : ''}
      </span>
    </span>
  </span>
);

const TOKEN_MAX = 2;
const SEAL_MAX = 2;

export const Bolts: React.FC<{ tokens: number }> = ({ tokens }) => (
  <span className="bolts" title={RESOURCE_LABEL.act} aria-label={`${tokens} из ${TOKEN_MAX}`}>
    {Array.from({ length: TOKEN_MAX }, (_, i) => (
      <span key={i} className={tokens > i ? 'bolt' : 'bolt bolt--off'} aria-hidden>
        <UiIcon kind="move" size="sm" />
      </span>
    ))}
  </span>
);

export const Seals: React.FC<{ count: number }> = ({ count }) => (
  <span
    className={['res', count === 0 ? 'res--empty' : 'res--seal'].join(' ')}
    title={RESOURCE_LABEL.seal}
    aria-label={`${count} из ${SEAL_MAX}`}
  >
    {Array.from({ length: SEAL_MAX }, (_, i) => (
      <span key={i} className={count > i ? 'res__i' : 'res__i res__i--off'} aria-hidden>
        <UiIcon kind="bulla" size="sm" />
      </span>
    ))}
  </span>
);

export type DeltaEvent = { id: string; text: string; isGain: boolean };

/** Просвет над коробкой, у которой капсула берёт своё место. */
const DELTA_LIFT = 6;

/**
 * Всплывающие капсулы ресурса («+1 🪙», «-1 ⚡», «🚫 ПРАВО ВЕТО!»).
 *
 * Рисуются порталом в `body`, а не там, где стоят. Ряд сидений живёт на
 * `z-index: 5`, и он же — своя стопка; всё, что внутри, оказывается под слоем
 * карт, и капсула ныряла под колоду и под лежащую рядом карту. Поднять саму
 * стопку нельзя: тогда сидения встанут поверх летящих карт. Портал выносит
 * капсулу из стопки целиком — тот же приём, что у меню над картой.
 *
 * Попутно это развязывает капсулу и сиденье: раньше её `transform` растил
 * слой у ближайшего трансформированного предка, и чип соседа «мылился» ровно
 * на время анимации (см. комментарий к `.seat--left`).
 *
 * Координаты берутся у той коробки, внутри которой капсула стояла бы без
 * портала, — замер при появлении и пересчёт на изменение размера окна. Живёт
 * капсула 2.2 с, за это время стол не переезжает.
 */
export const Deltas: React.FC<{ events: readonly DeltaEvent[]; kind: ResourceKind | 'other' }> = ({
  events,
  kind
}) => {
  const mark = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const mine = events.filter(e => resourceDeltaKind(e.text) === kind);
  const shown = mine.length > 0;

  useLayoutEffect(() => {
    if (!shown) return;
    const measure = () => {
      const host = mark.current?.parentElement;
      if (!host) return;
      const r = host.getBoundingClientRect();
      setAt({ x: r.left + r.width / 2, y: r.top - DELTA_LIFT });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [shown]);

  return (
    <>
      {/* Метка остаётся на месте капсулы: по её родителю и берётся геометрия. */}
      <span ref={mark} className="delta-origin" aria-hidden />
      {shown &&
        at &&
        createPortal(
          <>
            {mine.map(d => (
              <div
                key={d.id}
                className={`delta ${d.isGain ? 'delta--gain' : 'delta--loss'}`}
                style={{ left: at.x, top: at.y }}
              >
                {renderWithIcons(courtly(d.text))}
              </div>
            ))}
          </>,
          document.body
        )}
    </>
  );
};
