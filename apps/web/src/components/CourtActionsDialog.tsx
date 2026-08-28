/**
 * Действия двора — четыре плитки той же формы, что и роли в блефе.
 *
 * У этих действий нет арта: они не карты, а ходы, и рисовать им портрет было
 * бы враньём о том, что лежит на столе. Вместо арта иконка на градиенте —
 * форма, отступы и жест наведения те же, поэтому два списка читаются как один
 * язык, а не как два разных экрана.
 *
 * «Сменить карты» раскрывается на месте: выбор, какую карту сбросить, — это
 * продолжение того же решения, и уводить его во вторую модалку значило бы
 * дважды спросить об одном.
 */
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Coins, Crown, RefreshCw, ScrollText } from 'lucide-react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { dur } from '../motion/tokens.ts';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { Tile } from './ui/Tile';
import { Dialog } from './ui/Overlay';
import { UiIcon } from './ui/Icon';
import { startTargeting } from './targeting';
import { pickViewer } from '../lib/viewer';

const FEAST_CROWN_CAP = 5;
const ICON = 28;

export const CourtActionsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { players, viewerId, performAction } = useGameStore(
    useShallow(s => ({
      players: s.players,
      viewerId: s.viewerId,
      performAction: s.performAction
    }))
  );
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const human = pickViewer(players, viewerId);
  if (!human) return null;

  const hasTokens = human.actionTokens >= 1;
  const feastBlocked = human.favor >= FEAST_CROWN_CAP;

  return (
    <Dialog
      open
      onClose={onClose}
      width={640}
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
      {/* `wait`: наложенные друг на друга сетка и выбор карт читаются как
          грязь — тот же довод, что в `PhasePanel`. */}
      <AnimatePresence mode="wait" initial={false}>
        {exchangeOpen ? (
          <motion.div
            key="exchange"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.panel }}
          >
            <div className="overlay__desc" style={{ margin: '0 0 10px' }}>
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
            <Button
              tone="bare"
              size="sm"
              block
              style={{ marginTop: 7 }}
              onClick={() => setExchangeOpen(false)}
            >
              Назад к действиям
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="actions"
            className="tilegrid tilegrid--pairs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.panel }}
          >
            <Tile
              icon={<Coins size={ICON} />}
              name="Просить содержание"
              meta={<>+1 <UiIcon kind="coin" size="xs" /></>}
              desc="Одна монета из королевской казны, без риска."
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
            />

            <Tile
              icon={<Crown size={ICON} />}
              name="Устроить пир"
              meta={
                feastBlocked ? (
                  <>предел {FEAST_CROWN_CAP} <UiIcon kind="crown" size="xs" /></>
                ) : (
                  <>3 <UiIcon kind="coin" size="xs" /> <ArrowRight size={11} /> +1{' '}
                  <UiIcon kind="crown" size="xs" /></>
                )
              }
              desc={
                <>
                  Купить корону влияния. Так можно дойти лишь до {FEAST_CROWN_CAP}{' '}
                  <UiIcon kind="crown" size="xs" /> — победную корону придётся отбирать в спорах.
                </>
              }
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
            />

            <Tile
              icon={<ScrollText size={ICON} />}
              name="Распустить слух"
              meta={
                <>5 <UiIcon kind="coin" size="xs" /> <ArrowRight size={11} /> -1{' '}
                <UiIcon kind="crown" size="xs" /></>
              }
              desc="Сбивает корону у соперника, срывает Королевский приём и круг коронации."
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
            />

            <Tile
              icon={<RefreshCw size={ICON} />}
              name="Сменить карты"
              meta={<>1 <UiIcon kind="move" size="xs" /></>}
              desc="Сбросьте одну или обе карты и немедленно доберите новые."
              disabled={!hasTokens}
              onClick={() => setExchangeOpen(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
};
