import React from 'react';

const FALLBACK = '/avatars/bot1.webp';

interface PortraitProps {
  src: string;
  name: string;
  className?: string;
  /** Накладки поверх лица — они обрезаются вместе с ним по кругу. */
  children?: React.ReactNode;
}

export const Portrait: React.FC<PortraitProps> = ({ src, name, className = '', children }) => (
  <div className={className}>
    <img
      className="portrait__img"
      src={src}
      alt={name}
      onError={e => {
        const img = e.currentTarget;
        if (!img.src.endsWith(FALLBACK)) img.src = FALLBACK;
      }}
    />
    {children}
  </div>
);
