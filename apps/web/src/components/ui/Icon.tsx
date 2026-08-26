import React from 'react';
import { renderWithIcons } from '../../lib/renderIcons';

export type UiIconKind =
  | 'coin'
  | 'gold'
  | 'crown'
  | 'bulla'
  | 'seal'
  | 'move'
  | 'act'
  | 'bolt';

export type UiIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '500';

const ICON_MAP: Record<UiIconKind, { sm: string; lg: string; alt: string }> = {
  coin: { sm: '/assets/ui/coin-sm.webp', lg: '/assets/ui/coin-500.webp', alt: 'Монета' },
  gold: { sm: '/assets/ui/coin-sm.webp', lg: '/assets/ui/coin-500.webp', alt: 'Золото' },
  crown: { sm: '/assets/ui/crown-sm.webp', lg: '/assets/ui/crown-500.webp', alt: 'Корона' },
  bulla: { sm: '/assets/ui/bulla-sm.webp', lg: '/assets/ui/bulla-500.webp', alt: 'Булла' },
  seal: { sm: '/assets/ui/bulla-sm.webp', lg: '/assets/ui/bulla-500.webp', alt: 'Печать' },
  move: { sm: '/assets/ui/move-sm.webp', lg: '/assets/ui/move-500.webp', alt: 'Действие' },
  act: { sm: '/assets/ui/move-sm.webp', lg: '/assets/ui/move-500.webp', alt: 'Действие' },
  bolt: { sm: '/assets/ui/move-sm.webp', lg: '/assets/ui/move-500.webp', alt: 'Действие' }
};

export interface UiIconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  kind: UiIconKind;
  size?: UiIconSize;
  inline?: boolean;
}

export const UiIcon: React.FC<UiIconProps> = ({
  kind,
  size = 'sm',
  inline = true,
  className = '',
  style,
  alt,
  ...rest
}) => {
  const conf = ICON_MAP[kind] ?? ICON_MAP.coin;
  const isLarge = size === 'lg' || size === 'xl' || size === '500';
  const src = isLarge ? conf.lg : conf.sm;

  return (
    <img
      src={src}
      alt={alt ?? conf.alt}
      className={`ui-icon ui-icon--${kind} ui-icon--${size} ${inline ? 'ui-icon--inline' : ''} ${className}`.trim()}
      draggable={false}
      style={style}
      {...rest}
    />
  );
};

export { renderWithIcons };

export const RichText: React.FC<{
  children: React.ReactNode;
  size?: UiIconSize;
}> = ({ children, size = 'sm' }) => {
  if (typeof children === 'string') {
    return <>{renderWithIcons(children, size)}</>;
  }
  return <>{children}</>;
};
