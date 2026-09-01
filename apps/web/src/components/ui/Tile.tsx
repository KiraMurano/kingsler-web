/**
 * Плитка выбора — одна форма для ролей и для действий двора.
 *
 * Приём взят у `.landing-highlight`: фон приглушён, на наведении расцветает.
 * Там это украшение; здесь плитка ещё и поднимается — обратная связь: глухая
 * плитка не расцветает и не поднимается, поэтому недоступность видна до
 * клика, а не после.
 */
import React from 'react';

export const Tile: React.FC<{
  art?: string;
  icon?: React.ReactNode;
  name: string;
  meta?: React.ReactNode;
  desc?: React.ReactNode;
  badge?: React.ReactNode;
  tone?: 'gold' | 'arcane';
  disabled?: boolean;
  onClick: () => void;
}> = ({ art, icon, name, meta, desc, badge, tone = 'gold', disabled, onClick }) => (
  <button
    type="button"
    className={`tile tile--${tone} ${art ? 'tile--art' : 'tile--icon'}`}
    style={art ? ({ '--tile-art': `url(${art})` } as React.CSSProperties) : undefined}
    disabled={disabled}
    onClick={onClick}
  >
    {icon && <span className="tile__icon">{icon}</span>}
    <span className="tile__body">
      <span className="tile__row">
        <span className="tile__name">{name}</span>
        {badge}
      </span>
      {meta && <span className="tile__meta">{meta}</span>}
      {desc && <span className="tile__desc">{desc}</span>}
    </span>
  </button>
);
