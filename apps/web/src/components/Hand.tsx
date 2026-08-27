/**
 * The two hero slots, as holes rather than as cards.
 *
 * Both anchors are always rendered, whether or not a card is currently in
 * them. That is the whole reason slots stay sticky: when the card in slot 0
 * is staked on the table, slot 1 no longer slides across to fill the gap,
 * and the returning card flies back to the hole it left. The cards
 * themselves are drawn by `CardLayer`, which springs each one toward the
 * anchor its zone names — see `motion/AnchorRegistry.tsx`.
 *
 * Меню карты висит здесь же, над слотом. Какая карта держит слот, спрашиваем
 * у книги слотов, а не у `player.hand[slot]`: движок держит руку сжатой, и
 * индекс в массиве слотом не является — иначе меню открывалось бы над пустым
 * слотом, стоило соседке уйти на кон.
 */
import React from 'react';
import type { Player } from '@kinglier/engine/types';
import type { CardId } from '@kinglier/engine/cardInstance';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';
import { CardMenu } from './CardMenu';
import { cardInSlot } from '../lib/handSlotBook.ts';
import type { SlotBook } from '../lib/handSlotBook.ts';
import type { CardMenuKind, CardMenuOption } from '../lib/tableView.ts';

interface HandProps {
  player: Player;
  slotBook: SlotBook;
  openCardId: CardId | null;
  menus: Record<CardId, CardMenuOption[]>;
  onPick: (cardId: CardId, kind: CardMenuKind) => void;
}

export const Hand: React.FC<HandProps> = ({
  player,
  slotBook,
  openCardId,
  menus,
  onPick
}) => (
  <div className="hand">
    {([0, 1] as const).map(slot => {
      const held = cardInSlot(slotBook, player.id, slot);
      return (
        <CardAnchor
          key={slot}
          className="hand__slot"
          zone={{ kind: 'hand', playerId: player.id, slot }}
        >
          <div className="hand__frame" />
          {held && (
            <CardMenu
              open={openCardId === held}
              zone={{ kind: 'hand', playerId: player.id, slot }}
              options={menus[held] ?? []}
              onPick={kind => onPick(held, kind)}
            />
          )}
        </CardAnchor>
      );
    })}
  </div>
);
