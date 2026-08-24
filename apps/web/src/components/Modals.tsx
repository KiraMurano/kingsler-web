import React, { useState } from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS, CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import {
  TOTAL_ROLES_COUNT,
  TOTAL_PLOTS_COUNT,
  TOTAL_INSTANTS_COUNT,
  TOTAL_DECK_SIZE
} from '@kinglier/engine/cards';
import type { ConspiracyPromptData, Player, GameCard } from '@kinglier/engine/types';
import { courtly } from '../lib/text';
import { pickViewer } from '../lib/viewer';
import { Dialog } from './ui/Overlay';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { Res } from './ui/Res';
import { Portrait } from './Portrait';

const CardPlate: React.FC<{ card: GameCard; caption?: string; width?: number }> = ({
  card,
  caption,
  width = 132
}) => {
  const info = CARD_DESCRIPTIONS[card];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
      {caption && <Tag>{caption}</Tag>}
      <div className={`detail__art cardframe cardframe--${info.category}`} style={{ width }}>
        <img src={info.artImage} alt={info.name} />
      </div>
      <span style={{ fontSize: '0.82rem', color: 'var(--gold-pale)' }}>{info.name}</span>
    </div>
  );
};

function ConspiracyDialog({
  prompt,
  players,
  selfId,
  onClose,
  onActivate
}: {
  prompt: ConspiracyPromptData;
  players: Player[];
  selfId: string;
  onClose: () => void;
  onActivate: (targetId: string, effect: 'gold' | 'crown', isImmediate: boolean) => void;
}) {
  const opponents = players.filter(p => p.id !== selfId);
  const [targetId, setTargetId] = useState(opponents[0]?.id ?? '');
  const [effect, setEffect] = useState<'gold' | 'crown'>(prompt.charges >= 3 ? 'crown' : 'gold');

  const target = opponents.find(p => p.id === targetId) ?? opponents[0];
  const unvetoable = prompt.charges >= 4;

  return (
    <Dialog
      open
      onClose={onClose}
      width={560}
      title={`Тайный заговор · ${prompt.charges} из 4`}
      description={
        <div style={{ display: 'flex', gap: 6 }}>
          <Tag tone="arcane">активация в ход · 1 ⚡</Tag>
          {unvetoable && <Tag tone="danger">вето невозможно</Tag>}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {unvetoable && (
          <div className="notice notice--arcane">
            Максимальный заряд: это действие нельзя отменить «Правом вето».
          </div>
        )}

        <div>
          <div className="detail__label">Цель заговора</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {opponents.map(opponent => (
              <button
                key={opponent.id}
                type="button"
                className={`opt ${opponent.id === targetId ? 'opt--on' : ''}`}
                style={{ textAlign: 'center' }}
                onClick={() => setTargetId(opponent.id)}
              >
                <Portrait
                  src={opponent.avatar}
                  name={opponent.name}
                  className="seat__portrait"
                />
                <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 600 }}>
                  {opponent.name}
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 4 }}
                >
                  <Res kind="crown" value={opponent.favor} />
                  <Res kind="gold" value={opponent.gold} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="detail__label">Удар</div>
          <div className="optgrid">
            <Button
              tone={effect === 'gold' ? 'gold' : 'plain'}
              block
              sub={target ? `Отнимет ${Math.min(prompt.charges, target.gold)} 🪙` : undefined}
              onClick={() => setEffect('gold')}
            >
              Сбить казну
            </Button>
            <Button
              tone={effect === 'crown' ? 'danger' : 'plain'}
              block
              disabled={prompt.charges < 3}
              sub={prompt.charges < 3 ? 'нужно 3 заряда' : `Отнимет 1 👑 у ${target?.name}`}
              onClick={() => prompt.charges >= 3 && setEffect('crown')}
            >
              Лишить короны
            </Button>
          </div>
        </div>

        <div className="optgrid">
          <Button
            tone="gold"
            size="lg"
            block
            onClick={() => onActivate(target?.id ?? targetId, effect, prompt.isImmediateReaction)}
          >
            Свершить
          </Button>
          <Button tone="plain" size="lg" block sub="копить дальше" onClick={onClose}>
            Подождать
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RedirectChoiceDialog({
  attackerName,
  roleClaim,
  onRedirect,
  onBluffDuel,
  onClose
}: {
  attackerName: string;
  roleClaim: string;
  onRedirect: () => void;
  onBluffDuel: () => void;
  onClose: () => void;
}) {
  const shield = roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';

  return (
    <Dialog
      open
      onClose={onClose}
      width={520}
      title="Как использовать «Перенаправление»?"
      description={`${attackerName} атакует вас ролью «${roleClaim}»`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <button type="button" className="opt" onClick={onRedirect}>
          <div className="opt__row">
            <span className="opt__name">Разыграть как инстант</span>
            <Tag tone="gold">0 ⚡</Tag>
          </div>
          <div className="opt__desc">
            Нападение уходит на другого придворного — защищаться будет он.
          </div>
        </button>

        <button type="button" className="opt" onClick={onBluffDuel}>
          <div className="opt__row">
            <span className="opt__name">Выставить на дуэль как блеф</span>
            <Tag tone="bluff">щит «{shield}»</Tag>
          </div>
          <div className="opt__desc">
            Карта ляжет взакрытую. Если атакующий примет вызов, блеф раскроется.
          </div>
        </button>

        <Button tone="bare" block onClick={onClose}>
          Вернуться к выбору защиты
        </Button>
      </div>
    </Dialog>
  );
}

interface ModalsProps {
  showRules: boolean;
  onCloseRules: () => void;
  redirectCardIndex: number | null;
  onCloseRedirect: () => void;
  onRedirectAsInstant: (cardIndex: number) => void;
  onRedirectAsDuelBluff: (cardIndex: number) => void;
}

export const Modals: React.FC<ModalsProps> = ({
  showRules,
  onCloseRules,
  redirectCardIndex,
  onCloseRedirect,
  onRedirectAsInstant,
  onRedirectAsDuelBluff
}) => {
  const {
    players,
    viewerId,
    pendingAction,
    informantPeekData,
    conspiracyPrompt,
    closeInformantPeek,
    closeConspiracyDialog,
    activateConspiracy,
    turnPhase,
    winnerId,
    restartGame
  } = useGameStore();

  const human = pickViewer(players, viewerId);
  if (!human) return null;

  if (redirectCardIndex !== null && pendingAction) {
    const attacker = players.find(p => p.id === pendingAction.actorId);
    return (
      <RedirectChoiceDialog
        attackerName={attacker?.name ?? 'Нападающий'}
        roleClaim={pendingAction.roleClaim ?? 'атака'}
        onRedirect={() => onRedirectAsInstant(redirectCardIndex)}
        onBluffDuel={() => onRedirectAsDuelBluff(redirectCardIndex)}
        onClose={onCloseRedirect}
      />
    );
  }

  // conspiracyPrompt isn't redacted per-viewer (unlike informantPeekData) — it's
  // broadcast to everyone, so only render it for the player it actually
  // belongs to, or every online client would pop up the same "whose conspiracy
  // is this" dialog on someone else's turn.
  if (conspiracyPrompt && conspiracyPrompt.playerId === human.id) {
    return (
      <ConspiracyDialog
        prompt={conspiracyPrompt}
        players={players}
        selfId={human.id}
        onClose={closeConspiracyDialog}
        onActivate={(targetId, effect, isImmediate) =>
          activateConspiracy(human.id, targetId, effect, isImmediate)
        }
      />
    );
  }

  if (turnPhase === 'INFORMANT_PEEK' && informantPeekData) {
    const target = players.find(p => p.id === informantPeekData.targetId);
    return (
      <Dialog
        open
        onClose={closeInformantPeek}
        width={420}
        title="Сеть информаторов доносит"
        description={`${target?.name} взял из колоды новую карту`}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <CardPlate card={informantPeekData.newCard} width={144} />
        </div>
        <Button tone="gold" block onClick={closeInformantPeek}>
          Запомнить
        </Button>
      </Dialog>
    );
  }

  if (turnPhase === 'GAME_OVER') {
    const isDraw = winnerId === 'draw';
    const winner = isDraw ? null : players.find(p => p.id === winnerId);
    const board = [...players].sort(
      (a, b) => b.favor - a.favor || b.seals - a.seals || b.gold - a.gold
    );

    return (
      <Dialog
        open
        onClose={restartGame}
        width={540}
        title={
          isDraw
            ? 'Престол остался пуст'
            : winner?.id === human.id
              ? 'Вы коронованы'
              : 'Коронация состоялась'
        }
        description={
          isDraw ? 'Претенденты набрали равное влияние.' : `Двор присягает: ${winner?.name}`
        }
      >
        <div className="detail__label">Итоговое влияние</div>
        <div className="board">
          {board.map((p, rank) => (
            <div key={p.id} className={`board__row ${rank === 0 ? 'board__row--top' : ''}`}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="board__rank">{rank + 1}</span>
                <span style={{ fontWeight: p.id === human.id ? 700 : 500 }}>
                  {p.name}
                  {p.id === human.id ? ' — вы' : ''}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 5 }}>
                <Res kind="crown" value={p.favor} />
                <Res kind="seal" value={p.seals} muted={p.seals === 0} />
                <Res kind="gold" value={p.gold} />
              </span>
            </div>
          ))}
        </div>
        <Button tone="gold" size="lg" block style={{ marginTop: 16 }} onClick={restartGame}>
          Новая партия
        </Button>
      </Dialog>
    );
  }

  if (showRules) {
    return (
      <Dialog
        open
        onClose={onCloseRules}
        width={700}
        title="Свод законов двора"
        description={`Единая колода из ${TOTAL_DECK_SIZE} карт · цель — удержать 6 👑 полный круг`}
      >
        <div className="rules">
          <div>
            <h4>Колода и победа</h4>
            {TOTAL_ROLES_COUNT} карт ролей, {TOTAL_PLOTS_COUNT} интриг и {TOTAL_INSTANTS_COUNT}{' '}
            инстантов. Побеждает тот, кто первым удержит 6 👑 целый круг. За выигранные споры
            начисляются печати: 2 ⚜️ обращаются в 1 👑.
          </div>

          <div>
            <h4>Ход состоит из трёх фаз</h4>
            <ul>
              <li>
                <b>Утро.</b> Жетоны восполняются до 2 ⚡, срабатывают выложенные интриги.
              </li>
              <li>
                <b>Действие двора</b> (не более одного): содержание, пир, слух или обмен карт — 1 ⚡.
              </li>
              <li>
                <b>Розыгрыш карт:</b> одна интрига, одна роль и любые инстанты. Добор карт
                происходит только в конце хода.
              </li>
            </ul>
          </div>

          <div>
            <h4>Блеф</h4>
            Любую карту можно положить взакрытую и заявить как любую роль двора. При проверке карта
            вскрывается и уходит в сброс — вместе с репутацией, если это был блеф.
          </div>

          <div>
            <h4>Роли двора</h4>
            <div className="rules__grid">
              {ALL_ROLES.map(role => (
                <div key={role} className="rules__cell">
                  <b>{role}.</b> {CARD_DESCRIPTIONS[role].shortDescription}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4>Интриги</h4>
            <div className="rules__grid">
              {ALL_PLOTS.map(plot => (
                <div key={plot} className="rules__cell">
                  <b>{plot}.</b> {CARD_DESCRIPTIONS[plot].shortDescription}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4>Инстанты</h4>
            <div className="rules__grid">
              {ALL_INSTANTS.map(instant => (
                <div key={instant} className="rules__cell">
                  <b>{instant}.</b> {courtly(CARD_DESCRIPTIONS[instant].shortDescription)}
                </div>
              ))}
            </div>
          </div>

          <Button tone="gold" block onClick={onCloseRules}>
            Понятно
          </Button>
        </div>
      </Dialog>
    );
  }

  return null;
};
