import React from 'react';

export type TagTone = 'neutral' | 'gold' | 'truth' | 'bluff' | 'danger' | 'cold' | 'arcane';

export interface TagProps {
  tone?: TagTone;
  size?: 'sm' | 'md';
  pulse?: boolean;
  title?: string;
  children: React.ReactNode;
}

const TONE_CLASS: Record<TagTone, string> = {
  neutral: '',
  gold: 'tag--gold',
  truth: 'tag--truth',
  bluff: 'tag--bluff',
  danger: 'tag--danger',
  cold: 'tag--cold',
  arcane: 'tag--arcane'
};

/** Short textual label. Never carries an icon — resources use `<Res>` instead. */
export const Tag: React.FC<TagProps> = ({
  tone = 'neutral',
  size = 'sm',
  pulse,
  title,
  children
}) => (
  <span
    className={['tag', TONE_CLASS[tone], size === 'md' ? 'tag--lg' : '', pulse ? 'tag--pulse' : '']
      .filter(Boolean)
      .join(' ')}
    title={title}
  >
    {children}
  </span>
);
