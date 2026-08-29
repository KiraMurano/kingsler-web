import React from 'react';

export type ButtonTone =
  | 'plain'
  | 'gold'
  | 'danger'
  | 'calm'
  | 'good'
  | 'arcane'
  /** Оранжевый. Пока только у переключателя «Ва-банк». */
  | 'ember'
  | 'bare';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  sub?: React.ReactNode;
}

const TONE_CLASS: Record<ButtonTone, string> = {
  plain: '',
  gold: 'btn--gold',
  danger: 'btn--danger',
  calm: 'btn--calm',
  good: 'btn--good',
  arcane: 'btn--arcane',
  ember: 'btn--ember',
  bare: 'btn--bare'
};

export const Button: React.FC<ButtonProps> = ({
  tone = 'plain',
  size = 'md',
  block,
  sub,
  children,
  className = '',
  ...rest
}) => (
  <button
    type="button"
    className={[
      'btn',
      TONE_CLASS[tone],
      size === 'sm' ? 'btn--sm' : size === 'lg' ? 'btn--lg' : '',
      block ? 'btn--block' : '',
      className
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    <span className="btn__row">{children}</span>
    {sub && <span className="btn__sub">{sub}</span>}
  </button>
);
