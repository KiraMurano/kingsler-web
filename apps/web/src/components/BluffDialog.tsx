/**
 * Заявка роли — шесть плиток, по одной на роль двора.
 *
 * Карта уже выбрана в руке и лежит взакрытую; здесь выбирается только то, чем
 * её назвать. Правда и блеф стоят в одном ряду и выглядят одинаково: список,
 * в котором честный ход выделен, подсказывал бы соседям, куда смотреть.
 *
 * «Выложить открыто как интригу» и «разыграть инстант» отсюда ушли — это
 * решения о самой карте, и они принимаются в меню на карте.
 */
import React, { useState } from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { ALL_ROLES, CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import type { Role } from '@kinglier/engine/data/cardDescriptions';
import type { CardId } from '@kinglier/engine/types';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { Tile } from './ui/Tile';
import { Dialog } from './ui/Overlay';
import { UiIcon, renderWithIcons } from './ui/Icon';
import { startTargeting } from './targeting';
import { pickViewer } from '../lib/viewer';
import { byId, holds } from '@kinglier/engine/cardInstance';

const VA_BANQUE_EFFECT: Record<string, string> = {
  Наследник: '+2 👑 при успешной проверке',
  Казначей: '+6 🪙 при успешной проверке',
  Рыцарь: '+4 🪙 при успешной проверке',
  Шут: '+4 🪙 и +1 👑 при проверке',
  Вор: 'кража до 4 🪙 при проверке',
  Шантажист: 'кража 2 👑 при проверке'
};

interface BluffDialogProps {
  stakedCardId: CardId;
  onClose: () => void;
}

export const BluffDialog: React.FC<BluffDialogProps> = ({ stakedCardId, onClose }) => {
  const { players, viewerId, performAction, hasPlayedRoleThisTurn } = useGameStore(
    useShallow(s => ({
      players: s.players,
      viewerId: s.viewerId,
      performAction: s.performAction,
      hasPlayedRoleThisTurn: s.hasPlayedRoleThisTurn
    }))
  );
  const human = pickViewer(players, viewerId);

  const hasVaBanque = !!human && holds(human.hand, 'Ва-банк');
  const canUseVaBanque = hasVaBanque && (human?.actionTokens ?? 0) >= 1 && !hasPlayedRoleThisTurn;
  const [withVaBanque, setWithVaBanque] = useState(false);

  if (!human) return null;

  const staked = byId(human.hand, stakedCardId) ?? human.hand[0];
  if (!staked) return null;

  const card = staked.card;
  const stakedSlot = human.hand.findIndex(h => h.id === staked.id);
  const hasTokens = human.actionTokens >= 1;

  const claimRole = (role: Role) => {
    const roleInfo = CARD_DESCRIPTIONS[role];
    onClose();
    if (roleInfo.targeted) {
      startTargeting({
        type: 'role',
        name: role,
        roleClaim: role,
        stakedCardId: staked.id,
        withVaBanque,
        cost: roleInfo.cost
      });
    } else {
      performAction({
        type: 'role',
        name: role,
        roleClaim: role,
        stakedCardId: staked.id,
        actorId: human.id,
        withVaBanque,
        costGold: roleInfo.cost,
        costTokens: 1,
        description: roleInfo.fullDescription
      });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width={640}
      className={withVaBanque ? 'dialog__panel--vabanque' : undefined}
      title={withVaBanque ? 'Розыгрыш под Ва-банком' : 'Розыгрыш или блеф'}
      description={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          Карта {stakedSlot + 1}: <Tag tone="gold">{card}</Tag>
        </span>
      }
    >
      {hasVaBanque && !hasPlayedRoleThisTurn && (
        <div className="optlist">
          <div className={`notice ${withVaBanque ? 'notice--arcane' : ''}`}>
            <div className="notice__row">
              <div>
                <div className="notice__title">Сыграть с Ва-банком</div>
                <div>
                  При проверке эффект роли удваивается, при блефе поймавший получает +2{' '}
                  <UiIcon kind="bulla" size="xs" />.
                </div>
              </div>
              <Button
                tone={withVaBanque ? 'danger' : 'arcane'}
                size="sm"
                disabled={!canUseVaBanque && !withVaBanque}
                onClick={() => setWithVaBanque(!withVaBanque)}
              >
                {withVaBanque ? 'Отключить' : 'Удвоить'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div
        className="overlay__desc"
        style={{
          margin: '4px 0 10px',
          color: hasPlayedRoleThisTurn ? 'var(--crimson-soft)' : undefined
        }}
      >
        {hasPlayedRoleThisTurn ? (
          'За ход можно разыграть только одну роль.'
        ) : withVaBanque ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            Выберите заявляемую роль · 1 <UiIcon kind="move" size="xs" />
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            Положите карту взакрытую и заявите любую роль двора · 1{' '}
            <UiIcon kind="move" size="xs" />
          </span>
        )}
      </div>

      <div className="tilegrid">
        {ALL_ROLES.map(role => {
          const info = CARD_DESCRIPTIONS[role];
          const affordable = human.gold >= info.cost && hasTokens && !hasPlayedRoleThisTurn;
          const truthful = role === card;
          return (
            <Tile
              key={role}
              art={info.artImage}
              name={role}
              tone={withVaBanque ? 'arcane' : 'gold'}
              badge={<Tag tone={truthful ? 'truth' : 'bluff'}>{truthful ? 'правда' : 'блеф'}</Tag>}
              meta={info.cost > 0 ? <>{info.cost} <UiIcon kind="coin" size="xs" /></> : 'бесплатно'}
              desc={renderWithIcons(withVaBanque ? VA_BANQUE_EFFECT[role] : info.shortDescription)}
              disabled={!affordable}
              onClick={() => claimRole(role)}
            />
          );
        })}
      </div>
    </Dialog>
  );
};
