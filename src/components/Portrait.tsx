import React from 'react';

const FALLBACK = '/avatars/bot1.jpg';

interface PortraitProps {
  src: string;
  name: string;
  className?: string;
}

export const Portrait: React.FC<PortraitProps> = ({ src, name, className = '' }) => (
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
  </div>
);
