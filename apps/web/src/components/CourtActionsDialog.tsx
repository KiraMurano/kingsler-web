/**
 * Обычные действия — четыре карточки со своим артом.
 *
 * Не модалка: четыре плитки 2×2 в одной коробке над кнопками, без завесы.
 * Коробка шире колонки и стоит по её центру. Арт 3:1 — как нарисован.
 * Формат держит общий `ActionCard`.
 *
 * «Сменить карты» уводит выбор на стол: какую карту сбросить — видно по самой
 * карте, а не по её названию в списке. Попап закрывается, над столом
 * повисает просьба отметить карты, и отмеченные приподнимаются в руке.
 */
import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { InspectableItem } from '@kinglier/engine/data/cardDescriptions';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { UiIcon } from './ui/Icon';
import { startTargeting } from './targeting';
import { ActionCard } from './ActionCard';
import { pickViewer } from '../lib/viewer';
import { designRect, designViewport } from '../lib/uiScale.ts';

const EASE = [0.4, 0, 0.2, 1] as const;
/** Появление и уход коробки — одна длина. */
const FADE = 0.36;

/** Просвет между верхним краем кнопок и коробкой. */
export const COURT_POP_GAP = 8;
/** Отступ от края окна, если якорь прижат к кромке. */
export const COURT_POP_EDGE = 8;
/** 2×2: шире колонки, плитки читаются, коробка ещё входит в стол. */
export const COURT_POP_WIDTH = 528;

export function placeCourtPopup(
  bar: { left: number; top: number; width: number },
  viewport: { width: number; height: number }
): { left: number; width: number; bottom: number; maxHeight: number } {
  const width = COURT_POP_WIDTH;
  const left = Math.max(
    COURT_POP_EDGE,
    Math.min(bar.left + bar.width / 2 - width / 2, viewport.width - width - COURT_POP_EDGE)
  );
  const bottom = Math.max(COURT_POP_EDGE, viewport.height - bar.top + COURT_POP_GAP);
  const maxHeight = Math.max(0, bar.top - COURT_POP_GAP - COURT_POP_EDGE);
  return { left, width, bottom, maxHeight };
}

function portal(node: React.ReactElement): React.ReactElement {
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}

export const CourtActionsDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onInspectCard: (card: InspectableItem) => void;
  /** Открыть выбор карт к обмену прямо за столом. */
  onStartExchange: () => void;
}> = ({ open, onClose, onInspectCard, onStartExchange }) => {
  const reduce = !!useReducedMotion();
  const [at, setAt] = useState<ReturnType<typeof placeCourtPopup> | null>(null);
  const { players, viewerId, performAction, rules } = useGameStore(
    useShallow(s => ({
      players: s.players,
      viewerId: s.viewerId,
      performAction: s.performAction,
      rules: s.rules
    }))
  );
  const human = pickViewer(players, viewerId);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = document.querySelector('.actionbar');
      if (!el) return;
      setAt(placeCourtPopup(designRect(el), designViewport()));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  if (!human) return null;

  /* Цены и кап пира берутся из правил партии: их задаёт хост, и диалог обязан
     показывать те числа, по которым реально играют. */
  const feastCap = rules.crownsToWin - 1;
  const hasTokens = human.actionTokens >= 1;
  const feastOff = !hasTokens || human.gold < rules.feastCost || human.favor >= feastCap;
  const rumourOff = !hasTokens || human.gold < rules.rumorCost;

  const fade = reduce ? 0.12 : FADE;
  const layer = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: fade, ease: EASE } },
    exit: { opacity: 0, transition: { duration: fade, ease: EASE } }
  };

  return portal(
    <AnimatePresence>
      {open && at && (
        <motion.div
          key="courtpop"
          className="courtpop"
          exit={{ transition: { duration: fade, when: 'afterChildren' } }}
          transformTemplate={() => 'none'}
          onPointerDown={onClose}
        >
          <div
            className="courtpop__box"
            role="dialog"
            aria-label="Обычные действия"
            style={{
              left: at.left,
              width: at.width,
              bottom: at.bottom,
              maxHeight: at.maxHeight
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            <motion.div className="popglass" transformTemplate={() => 'none'} {...layer} />
            <motion.div className="courtpop__grid" {...layer}>
            <div className="courtpop__card">
              <ActionCard
                action="Распустить слух"
                off={rumourOff}
                onClick={() => {
                  if (rumourOff) return;
                  onClose();
                  startTargeting({
                    type: 'normal',
                    name: 'Распустить слух',
                    cost: rules.rumorCost,
                    description: `Заплатил ${rules.rumorCost} 🪙: выбранный игрок теряет -1 👑.`
                  });
                }}
              >
                Потратьте {rules.rumorCost} <UiIcon kind="coin" size="xs" />, чтобы немедленно
                сбросить 1 <UiIcon kind="crown" size="xs" /> у соперника. Срывает{' '}
                {/* Название карты — не текст, а ссылка на неё: игрок читает про
                    «Королевский приём» ровно там, где впервые о нём услышал.
                    `span`, а не `button`: карточка сама кнопка, и кнопка внутри
                    кнопки — невалидная разметка. */}
                <span
                  className="cardlink"
                  onClick={e => {
                    e.stopPropagation();
                    onInspectCard('Королевский приём');
                  }}
                >
                  Королевский приём
                </span>{' '}
                и сжигает{' '}
                <span
                  className="cardlink"
                  onClick={e => {
                    e.stopPropagation();
                    onInspectCard('Охранная грамота');
                  }}
                >
                  Охранную грамоту
                </span>
                .
              </ActionCard>
            </div>

            <div className="courtpop__card">
              <ActionCard
                action="Устроить пир"
                off={feastOff}
                onClick={() => {
                  if (feastOff) return;
                  onClose();
                  performAction({
                    type: 'normal',
                    name: 'Устроить пир',
                    actorId: human.id,
                    costGold: rules.feastCost,
                    costTokens: 1,
                    description: `Платит ${rules.feastCost} 🪙 и получает +1 👑.`
                  });
                }}
              >
                Потратьте {rules.feastCost} <UiIcon kind="coin" size="xs" />, чтобы купить 1{' '}
                <UiIcon kind="crown" size="xs" />. Победную корону таким образом получить нельзя.
              </ActionCard>
            </div>

            <div className="courtpop__card">
              <ActionCard
                action="Сменить карты"
                off={!hasTokens}
                onClick={() => {
                  if (!hasTokens) return;
                  onClose();
                  onStartExchange();
                }}
              >
                Сбросьте одну или обе карты и немедленно доберите новые.
              </ActionCard>
            </div>

            <div className="courtpop__card">
              <ActionCard
                action="Просить содержание"
                off={!hasTokens}
                onClick={() => {
                  if (!hasTokens) return;
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
                Возьмите 1 <UiIcon kind="coin" size="xs" /> из королевской казны.
              </ActionCard>
            </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
