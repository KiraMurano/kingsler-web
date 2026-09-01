/**
 * Заявка роли — шесть плиток над картами руки.
 *
 * Карта уже выбрана в руке и лежит взакрытую; здесь выбирается только то, чем
 * её назвать. Правда и блеф стоят в одном ряду и выглядят одинаково: список,
 * в котором честный ход выделен, подсказывал бы соседям, куда смотреть.
 *
 * Не модалка: та же коробка, что у обычных действий, но над рукой. Имя на
 * арте 3:2, подпись на сплошной полосе снизу. Формат держит общий `ActionCard`.
 *
 * «Выложить открыто как интригу» и «разыграть инстант» отсюда ушли — это
 * решения о самой карте, и они принимаются в меню на карте.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { ALL_ROLES, CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import type { Role } from '@kinglier/engine/data/cardDescriptions';
import type { CardId } from '@kinglier/engine/types';
import { Button } from './ui/Button';
import { UiIcon, renderWithIcons } from './ui/Icon';
import { startTargeting } from './targeting';
import { ActionCard } from './ActionCard';
import { pickViewer } from '../lib/viewer';
import { byId, holds } from '@kinglier/engine/cardInstance';
import { playPayment, paidPlayPrice } from '@kinglier/engine/rules';
import { designRect, designViewport } from '../lib/uiScale.ts';

const EASE = [0.4, 0, 0.2, 1] as const;
const FADE = 0.36;

/** Просвет между верхним краем руки и коробкой. */
export const BLUFF_POP_GAP = 8;
export const BLUFF_POP_EDGE = 8;
/** Три плитки 3:2 в ряд ещё читаются, коробка входит в стол. */
export const BLUFF_POP_WIDTH = 640;

const VA_BANQUE_EFFECT: Record<string, string> = {
  Наследник: '+2 👑 при успешной проверке',
  Казначей: '+6 🪙 при успешной проверке',
  Дуэлянт: '+2 ⚜️ при успешной проверке',
  Шут: '+4 🪙 и +1 👑 при проверке',
  Вор: 'кража до 4 🪙 при проверке',
  Шантажист: 'кража 2 👑 при проверке'
};

export function placeBluffPopup(
  hand: { left: number; top: number; width: number },
  viewport: { width: number; height: number }
): { left: number; width: number; bottom: number; maxHeight: number } {
  const width = BLUFF_POP_WIDTH;
  const left = Math.max(
    BLUFF_POP_EDGE,
    Math.min(hand.left + hand.width / 2 - width / 2, viewport.width - width - BLUFF_POP_EDGE)
  );
  const bottom = Math.max(BLUFF_POP_EDGE, viewport.height - hand.top + BLUFF_POP_GAP);
  const maxHeight = Math.max(0, hand.top - BLUFF_POP_GAP - BLUFF_POP_EDGE);
  return { left, width, bottom, maxHeight };
}

function portal(node: React.ReactElement): React.ReactElement {
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}

interface BluffDialogProps {
  open: boolean;
  stakedCardId: CardId | null;
  /** Взведён ли «Ва-банк» переключателем в меню карты. */
  armedVaBanque?: boolean;
  onClose: () => void;
}

export const BluffDialog: React.FC<BluffDialogProps> = ({
  open,
  stakedCardId,
  armedVaBanque = false,
  onClose
}) => {
  const reduce = !!useReducedMotion();
  const [at, setAt] = useState<ReturnType<typeof placeBluffPopup> | null>(null);
  const linger = useRef<CardId | null>(stakedCardId);
  if (stakedCardId) linger.current = stakedCardId;
  const shownId = stakedCardId ?? linger.current;

  const { players, viewerId, performAction, hasPlayedRoleThisTurn, rules } = useGameStore(
    useShallow(s => ({
      players: s.players,
      viewerId: s.viewerId,
      performAction: s.performAction,
      hasPlayedRoleThisTurn: s.hasPlayedRoleThisTurn,
      rules: s.rules
    }))
  );
  const human = pickViewer(players, viewerId);
  const [withVaBanque, setWithVaBanque] = useState(armedVaBanque);

  useEffect(() => {
    if (open) setWithVaBanque(armedVaBanque);
  }, [open, armedVaBanque]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = document.querySelector('.hand');
      if (!el) return;
      setAt(placeBluffPopup(designRect(el), designViewport()));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  const fade = reduce ? 0.12 : FADE;
  const layer = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: fade, ease: EASE } },
    exit: { opacity: 0, transition: { duration: fade, ease: EASE } }
  };

  if (!human) return null;
  const staked = shownId ? (byId(human.hand, shownId) ?? human.hand[0]) : null;
  if (!staked) return null;

  const hasVaBanque = holds(human.hand, 'Ва-банк');
  const canPlay = playPayment(rules, human) !== null && !hasPlayedRoleThisTurn;
  const canUseVaBanque = hasVaBanque && canPlay;

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

  return portal(
    <AnimatePresence>
      {open && at && (
        <motion.div
          key="bluffpop"
          className="courtpop"
          exit={{ transition: { duration: fade, when: 'afterChildren' } }}
          transformTemplate={() => 'none'}
          onPointerDown={onClose}
        >
          <div
            className={`bluffpop__box${withVaBanque ? ' bluffpop__box--vabanque' : ''}`}
            role="dialog"
            aria-label={withVaBanque ? 'Розыгрыш под Ва-банком' : 'Розыгрыш или блеф'}
            style={{
              left: at.left,
              width: at.width,
              bottom: at.bottom,
              maxHeight: at.maxHeight
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            <motion.div className="popglass" transformTemplate={() => 'none'} {...layer} />
            <motion.div className="bluffpop__grid" {...layer}>
            {hasVaBanque && !hasPlayedRoleThisTurn && (
              <div className={`notice bluffpop__note${withVaBanque ? ' notice--arcane' : ''}`}>
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

            {hasPlayedRoleThisTurn && (
              <div className="bluffpop__warn">За ход можно разыграть только одну роль.</div>
            )}

            {ALL_ROLES.map(role => {
              const info = CARD_DESCRIPTIONS[role];
              /* «Шантажист» может стоить золота по правилам партии — и платит его
                 заявитель, а не только тот, кому поверили. Плитка обязана
                 показывать эту цену и гаснуть, когда денег нет: иначе клик уйдёт
                 в движок и молча отклонится. */
              const extra = info.cost + (role === 'Шантажист' ? rules.blackmailCost : 0);
              const payment = playPayment(rules, human, extra);
              const listedGold =
                extra + (human.actionTokens >= 1 ? 0 : (paidPlayPrice(rules) ?? 0));
              const affordable = payment !== null && !hasPlayedRoleThisTurn;
              return (
                <div key={role} className="bluffpop__card">
                  <ActionCard
                    action={role}
                    off={!affordable}
                    badge={
                      listedGold > 0 ? (
                        <span className="bluffpop__gold">
                          {listedGold} <UiIcon kind="coin" size="xs" />
                        </span>
                      ) : undefined
                    }
                    onClick={() => {
                      if (!affordable) return;
                      claimRole(role);
                    }}
                  >
                    {renderWithIcons(withVaBanque ? VA_BANQUE_EFFECT[role] : info.shortDescription)}
                  </ActionCard>
                </div>
              );
            })}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
