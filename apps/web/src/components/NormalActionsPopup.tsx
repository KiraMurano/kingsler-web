import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { Dialog } from './ui/Overlay';
import { UiIcon } from './ui/Icon';
import { startTargeting } from './targeting';
import { pickViewer } from '../lib/viewer';

const FEAST_CROWN_CAP = 5;

export const NormalActionsPopup: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { players, viewerId, performAction } = useGameStore();
  const human = pickViewer(players, viewerId);
  if (!human) return null;

  const hasTokens = human.actionTokens >= 1;
  const feastBlocked = human.favor >= FEAST_CROWN_CAP;

  return (
    <Dialog
      open
      onClose={onClose}
      width={560}
      title="Действия двора"
      description={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Tag tone="cold">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              1 <UiIcon kind="move" size="xs" /> за действие
            </span>
          </Tag>
          <span>Их нельзя оспорить или заблокировать</span>
        </span>
      }
    >
      <div className="optlist">
        <button
          type="button"
          className="opt"
          disabled={!hasTokens}
          onClick={() => {
            onClose();
            performAction({
              type: 'normal',
              name: 'Просить содержание',
              actorId: human.id,
              costGold: 0,
              costTokens: 1,
              description: 'Получает 1 🪙 из казны.'
            });
          }}
        >
          <div className="opt__row">
            <span className="opt__name">Просить содержание</span>
            <Tag tone="gold">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                +1 <UiIcon kind="coin" size="xs" />
              </span>
            </Tag>
          </div>
          <div className="opt__desc">Одна монета из королевской казны, без риска.</div>
        </button>

        <button
          type="button"
          className="opt"
          disabled={!hasTokens || human.gold < 3 || feastBlocked}
          onClick={() => {
            onClose();
            performAction({
              type: 'normal',
              name: 'Устроить пир',
              actorId: human.id,
              costGold: 3,
              costTokens: 1,
              description: 'Платит 3 🪙 и получает +1 👑.'
            });
          }}
        >
          <div className="opt__row">
            <span className="opt__name">Устроить пир</span>
            <Tag tone={feastBlocked ? 'danger' : 'gold'}>
              {feastBlocked ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  предел {FEAST_CROWN_CAP} <UiIcon kind="crown" size="xs" />
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  3 <UiIcon kind="coin" size="xs" /> <ArrowRight size={11} /> +1{' '}
                  <UiIcon kind="crown" size="xs" />
                </span>
              )}
            </Tag>
          </div>
          <div className="opt__desc">
            Купить корону влияния. Так можно дойти лишь до {FEAST_CROWN_CAP}{' '}
            <UiIcon kind="crown" size="xs" /> — победную корону придётся отбирать в спорах.
          </div>
        </button>

        <button
          type="button"
          className="opt"
          disabled={!hasTokens || human.gold < 5}
          onClick={() => {
            onClose();
            startTargeting({
              type: 'normal',
              name: 'Распустить слух',
              cost: 5,
              description: 'Заплатил 5 🪙: выбранный игрок теряет -1 👑.'
            });
          }}
        >
          <div className="opt__row">
            <span className="opt__name">Распустить слух</span>
            <Tag tone="gold">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                5 <UiIcon kind="coin" size="xs" /> <ArrowRight size={11} /> -1{' '}
                <UiIcon kind="crown" size="xs" />
              </span>
            </Tag>
          </div>
          <div className="opt__desc">
            Сбивает корону у соперника, срывает Королевский приём и круг коронации.
          </div>
        </button>

        <div className="notice">
          <div className="notice__title" style={{ marginBottom: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              Сменить карты · 1 <UiIcon kind="move" size="xs" />
            </span>
          </div>
          <div style={{ marginBottom: 8 }}>
            Сбросьте одну или обе карты и немедленно доберите новые.
          </div>
          <div className="optgrid">
            {human.hand.map(({ card, id }, idx) => (
              <Button
                key={id}
                tone="calm"
                size="sm"
                block
                disabled={!hasTokens}
                sub={card}
                onClick={() => {
                  onClose();
                  performAction({
                    type: 'normal',
                    name: 'Сменить карту',
                    stakedCardId: id,
                    stakedCardIds: [id],
                    actorId: human.id,
                    costGold: 0,
                    costTokens: 1,
                    description: `Сбросил карту ${idx + 1} («${card}») и взял новую.`
                  });
                }}
              >
                Сбросить {idx + 1}
              </Button>
            ))}
          </div>
          {human.hand.length >= 2 && (
            <Button
              tone="gold"
              size="sm"
              block
              disabled={!hasTokens}
              style={{ marginTop: 7 }}
              onClick={() => {
                onClose();
                performAction({
                  type: 'normal',
                  name: 'Сменить 2 карты',
                  stakedCardIds: human.hand.map(c => c.id),
                  actorId: human.id,
                  costGold: 0,
                  costTokens: 1,
                  description: `Сбросил обе карты («${human.hand[0].card}», «${human.hand[1].card}») и взял две новые.`
                });
              }}
            >
              Сменить обе карты
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
};
