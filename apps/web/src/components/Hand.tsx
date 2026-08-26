/**
 * The two hero slots, as holes rather than as cards.
 *
 * Both anchors are always rendered, whether or not a card is currently in
 * them. That is the whole reason slots stay sticky: when the card in slot 0
 * is staked on the table, slot 1 no longer slides across to fill the gap,
 * and the returning card flies back to the hole it left. The cards
 * themselves are drawn by `CardLayer`, which springs each one toward the
 * anchor its zone names — see `motion/AnchorRegistry.tsx`.
 */
import React from 'react';
import type { Player } from '@kinglier/engine/types';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';

interface HandProps {
  player: Player;
}

export const Hand: React.FC<HandProps> = ({ player }) => (
  <div className="hand">
    {([0, 1] as const).map(slot => (
      <CardAnchor
        key={slot}
        className="hand__slot"
        zone={{ kind: 'hand', playerId: player.id, slot }}
      >
        <div className="hand__frame" />
      </CardAnchor>
    ))}
  </div>
);
