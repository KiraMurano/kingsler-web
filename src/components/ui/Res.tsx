import React from 'react';
import { courtly, resourceDeltaKind } from '../../lib/text';

/**
 * Resource chips. These four glyphs are the only pictograms allowed in the
 * interface — everything else is set in type.
 */
export type ResourceKind = 'gold' | 'crown' | 'seal' | 'act';

const RESOURCE_GLYPH: Record<ResourceKind, string> = {
  gold: '🪙',
  crown: '👑',
  seal: '⚜️',
  act: '⚡'
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
      {RESOURCE_GLYPH[kind]}
    </span>
    <span>
      {value}
      {suffix ? ` ${suffix}` : ''}
    </span>
  </span>
);

const TOKEN_MAX = 2;
const SEAL_MAX = 2;

export const Bolts: React.FC<{ tokens: number }> = ({ tokens }) => (
  <span className="bolts" title={RESOURCE_LABEL.act} aria-label={`${tokens} из ${TOKEN_MAX}`}>
    {Array.from({ length: TOKEN_MAX }, (_, i) => (
      <span key={i} className={tokens > i ? 'bolt' : 'bolt bolt--off'} aria-hidden>
        {RESOURCE_GLYPH.act}
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
        {RESOURCE_GLYPH.seal}
      </span>
    ))}
  </span>
);

export type DeltaEvent = { id: string; text: string; isGain: boolean };

export const Deltas: React.FC<{ events: readonly DeltaEvent[]; kind: ResourceKind | 'other' }> = ({
  events,
  kind
}) => (
  <>
    {events
      .filter(e => resourceDeltaKind(e.text) === kind)
      .map(d => (
        <div key={d.id} className={`delta ${d.isGain ? 'delta--gain' : 'delta--loss'}`}>
          {courtly(d.text)}
        </div>
      ))}
  </>
);
