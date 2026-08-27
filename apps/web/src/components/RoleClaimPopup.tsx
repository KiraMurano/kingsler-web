import React, { useState } from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { ALL_ROLES, CARD_DESCRIPTIONS, isPlot, isInstant } from '@kinglier/engine/data/cardDescriptions';
import type { CardId, PlotType, InstantType } from '@kinglier/engine/types';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { Dialog } from './ui/Overlay';
import { UiIcon, renderWithIcons } from './ui/Icon';
import { startTargeting } from './targeting';
import { pickViewer } from '../lib/viewer';
import { byId, holds } from '@kinglier/engine/cardInstance';

/** Instants that need a victim before they resolve. */
const TARGETED_INSTANTS: InstantType[] = [
  'Дворцовый переполох',
  'Перенаправление',
  'Обыск покоев',
  'Обвинение в измене'
];

/** Instants a player may lay down openly on their own turn. */
const OPENLY_PLAYABLE_INSTANTS: InstantType[] = [
  'Обыск покоев',
  'Дворцовый переполох',
  'Обвинение в измене'
];

const VA_BANQUE_EFFECT: Record<string, string> = {
  Наследник: '+2 👑 при успешной проверке',
  Казначей: '+6 🪙 при успешной проверке',
  Рыцарь: '+4 🪙 при успешной проверке',
  Шут: '+4 🪙 и +1 👑 при проверке',
  Вор: 'кража до 4 🪙 при проверке',
  Шантажист: 'кража 2 👑 при проверке'
};

interface RoleClaimPopupProps {
  stakedCardId: CardId;
  initialWithVaBanque?: boolean;
  onClose: () => void;
}

export const RoleClaimPopup: React.FC<RoleClaimPopupProps> = ({
  stakedCardId,
  initialWithVaBanque = false,
  onClose
}) => {
  const {
    players,
    viewerId,
    performAction,
    playPlotAction,
    playInstant,
    hasPlayedPlotThisTurn,
    hasPlayedRoleThisTurn
  } = useGameStore();
  const human = pickViewer(players, viewerId);

  const hasVaBanque = !!human && holds(human.hand, 'Ва-банк');
  const canUseVaBanque = hasVaBanque && (human?.actionTokens ?? 0) >= 1 && !hasPlayedRoleThisTurn;
  const [withVaBanque, setWithVaBanque] = useState(initialWithVaBanque && canUseVaBanque);

  if (!human) return null;

  const staked = byId(human.hand, stakedCardId) ?? human.hand[0];
  if (!staked) return null;

  const card = staked.card;
  const stakedSlot = human.hand.findIndex(h => h.id === staked.id);
  const info = CARD_DESCRIPTIONS[card];
  const hasTokens = human.actionTokens >= 1;

  const playAsPlot = () => {
    if (!hasTokens || hasPlayedPlotThisTurn) return;
    onClose();
    if (card === 'Досье') {
      startTargeting({
        type: 'plot',
        name: 'Досье',
        cost: 0,
        isPlotDirect: true,
        plotType: 'Досье',
        stakedCardId: staked.id
      });
    } else {
      playPlotAction(card as PlotType, staked.id);
    }
  };

  const playAsInstant = () => {
    if (!hasTokens) return;
    onClose();
    if (TARGETED_INSTANTS.includes(card as InstantType)) {
      startTargeting({
        type: 'instant',
        name: card,
        cost: 0,
        isInstantDirect: true,
        instantType: card as InstantType,
        stakedCardId: staked.id
      });
    } else {
      playInstant(human.id, card as InstantType, staked.id);
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
      <div className="optlist">
        {hasVaBanque && !hasPlayedRoleThisTurn && (
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
        )}

        {!withVaBanque && isPlot(card) && (
          <div className="notice notice--gold">
            <div className="notice__row">
              <div>
                <div className="notice__title">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    Выложить открыто как интригу · 1 <UiIcon kind="move" size="xs" />
                  </span>
                </div>
                <div>
                  {hasPlayedPlotThisTurn
                    ? 'За ход можно выложить только одну интригу.'
                    : renderWithIcons(info.shortDescription)}
                </div>
              </div>
              <Button
                tone="gold"
                size="sm"
                disabled={hasPlayedPlotThisTurn || !hasTokens}
                onClick={playAsPlot}
              >
                На стол
              </Button>
            </div>
          </div>
        )}

        {!withVaBanque && isInstant(card) && card !== 'Ва-банк' && (
          <div className="notice notice--arcane">
            <div className="notice__row">
              <div>
                <div className="notice__title">
                  {OPENLY_PLAYABLE_INSTANTS.includes(card as InstantType) ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      Разыграть инстант · 1 <UiIcon kind="move" size="xs" />
                    </span>
                  ) : (
                    'Реактивный инстант — ждёт своего окна'
                  )}
                </div>
                <div>{renderWithIcons(info.shortDescription)}</div>
              </div>
              {OPENLY_PLAYABLE_INSTANTS.includes(card as InstantType) && (
                <Button tone="arcane" size="sm" disabled={!hasTokens} onClick={playAsInstant}>
                  Сыграть
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

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

      <div className="optgrid">
        {ALL_ROLES.map(role => {
          const roleInfo = CARD_DESCRIPTIONS[role];
          const affordable = human.gold >= roleInfo.cost && hasTokens && !hasPlayedRoleThisTurn;
          const truthful = role === card;

          return (
            <button
              key={role}
              type="button"
              className={`opt ${truthful ? 'opt--truth' : ''}`}
              disabled={!affordable}
              onClick={() => {
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
              }}
            >
              <div className="opt__row">
                <span className="opt__name">{role}</span>
                <Tag tone={truthful ? 'truth' : 'bluff'}>{truthful ? 'правда' : 'блеф'}</Tag>
              </div>
              <div className="opt__desc">
                {renderWithIcons(
                  withVaBanque ? VA_BANQUE_EFFECT[role] : roleInfo.shortDescription
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
};
