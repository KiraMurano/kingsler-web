import React, { useState } from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS, CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import type { ConspiracyPromptData, Player, GameCard } from '@kinglier/engine/types';
import { CONSPIRACY_FULL_CHARGE, CONSPIRACY_GOLD_HIT } from '@kinglier/engine/resolvers/plotResolver';
import { courtly } from '../lib/text';
import { pickViewer } from '../lib/viewer';
import { LogOut, Save } from 'lucide-react';
import { SavePresetDialog } from '../rules/SavePresetDialog';
import { Dialog } from './ui/Overlay';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { Res } from './ui/Res';
import { UiIcon, renderWithIcons } from './ui/Icon';
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
  const [effect, setEffect] = useState<'gold' | 'crown'>('crown');

  const target = opponents.find(p => p.id === targetId) ?? opponents[0];
  /* Диалог открывается только на полном заряде — Заговор частичных ударов
     больше не наносит, так что вето здесь невозможно всегда. */
  const targetHoldsCharter = target?.activePlot?.type === 'Охранная грамота';

  return (
    <Dialog
      open
      onClose={onClose}
      width={560}
      title={`Тайный заговор · ${prompt.charges} из ${CONSPIRACY_FULL_CHARGE}`}
      description={
        <div style={{ display: 'flex', gap: 6 }}>
          <Tag tone="arcane">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              активация в ход · 1 <UiIcon kind="move" size="xs" />
            </span>
          </Tag>
          <Tag tone="danger">вето невозможно</Tag>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="notice notice--arcane">
          Полный заряд: это действие нельзя отменить «Правом вето».
        </div>

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
              sub={
                target ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    Отнимет {Math.min(CONSPIRACY_GOLD_HIT, target.gold)}{' '}
                    <UiIcon kind="coin" size="xs" />
                  </span>
                ) : undefined
              }
              onClick={() => setEffect('gold')}
            >
              Сбить казну
            </Button>
            <Button
              tone={effect === 'crown' ? 'danger' : 'plain'}
              block
              sub={
                targetHoldsCharter ? (
                  <span>Сожжёт «Охранную грамоту» — корона устоит</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    Отнимет 1 <UiIcon kind="crown" size="xs" /> у {target?.name}
                  </span>
                )
              }
              onClick={() => setEffect('crown')}
            >
              {targetHoldsCharter ? 'Сжечь грамоту' : 'Лишить короны'}
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

interface ModalsProps {
  showRules: boolean;
  onCloseRules: () => void;
  /**
   * Выход в меню после партии.
   *
   * Живёт снаружи: `Root` знает, что при выходе надо ещё и покинуть комнату и
   * убрать `?room=` из адреса, а движок про меню не знает вовсе.
   */
  onExitToMenu: () => void;
}

export const Modals: React.FC<ModalsProps> = ({ showRules, onCloseRules, onExitToMenu }) => {
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const {
    players,
    viewerId,
    informantPeekData,
    conspiracyPrompt,
    closeInformantPeek,
    closeConspiracyDialog,
    activateConspiracy,
    turnPhase,
    winnerId,
    rules
  } = useGameStore(
    useShallow(s => ({
      players: s.players,
      viewerId: s.viewerId,
      informantPeekData: s.informantPeekData,
      conspiracyPrompt: s.conspiracyPrompt,
      closeInformantPeek: s.closeInformantPeek,
      closeConspiracyDialog: s.closeConspiracyDialog,
      activateConspiracy: s.activateConspiracy,
      turnPhase: s.turnPhase,
      winnerId: s.winnerId,
      rules: s.rules
    }))
  );

  const human = pickViewer(players, viewerId);
  /* Состав колоды берётся из правил партии, а не из констант: с Фазы 2 его
     задаёт хост, и справочник обязан показывать ту колоду, которой играют. */
  const crownsToWin = rules.crownsToWin;
  const countOf = (cards: readonly GameCard[]) =>
    cards.reduce((sum, card) => sum + (rules.deck[card] ?? 0), 0);
  const rolesCount = countOf(ALL_ROLES);
  const plotsCount = countOf(ALL_PLOTS);
  const instantsCount = countOf(ALL_INSTANTS);
  const deckSize = rolesCount + plotsCount + instantsCount;
  if (!human) return null;

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
        onClose={onExitToMenu}
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
        {/* Выход, а не новая партия: состав стола, правила и режим — оффлайн
            или комната — выбирают в меню, и начинать «ещё раз» вслепую, тем же
            составом и по тем же числам, значит решать это за игрока. Закрытие
            диалога ведёт туда же: за ним всё равно лежит доигранный стол. */}
        <Button
          tone="gold"
          size="lg"
          block
          style={{ marginTop: 16 }}
          onClick={onExitToMenu}
        >
          <LogOut size={18} /> Выйти в меню
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
        description={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Единая колода из {deckSize} карт · цель — удержать {crownsToWin}{' '}
            <UiIcon kind="crown" size="xs" /> полный круг
          </span>
        }
      >
        <div className="rules">
          <div>
            <h4>Колода и победа</h4>
            {rolesCount} карт ролей, {plotsCount} интриг и {instantsCount}{' '}
            инстантов. Побеждает тот, кто первым удержит {crownsToWin}{' '}
            <UiIcon kind="crown" size="xs" /> целый круг. За выигранные споры начисляются печати: 2 <UiIcon kind="bulla" size="xs" />{' '}
            обращаются в 1 <UiIcon kind="crown" size="xs" />.
          </div>

          <div>
            <h4>Ход состоит из трёх фаз</h4>
            <ul>
              <li>
                <b>Утро.</b> Жетоны восполняются до 2 <UiIcon kind="move" size="xs" />,
                срабатывают выложенные интриги.
              </li>
              <li>
                <b>Действие двора</b> (не более одного): содержание, пир, слух или обмен карт — 1{' '}
                <UiIcon kind="move" size="xs" />.
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
                  <b>{role}.</b> {renderWithIcons(CARD_DESCRIPTIONS[role].shortDescription)}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4>Интриги</h4>
            <div className="rules__grid">
              {ALL_PLOTS.map(plot => (
                <div key={plot} className="rules__cell">
                  <b>{plot}.</b> {renderWithIcons(CARD_DESCRIPTIONS[plot].shortDescription)}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4>Инстанты</h4>
            <div className="rules__grid">
              {ALL_INSTANTS.map(instant => (
                <div key={instant} className="rules__cell">
                  <b>{instant}.</b>{' '}
                  {renderWithIcons(courtly(CARD_DESCRIPTIONS[instant].shortDescription))}
                </div>
              ))}
            </div>
          </div>

          {/* Сохранять баланс осмысленно отсюда: настройки уже опробованы за
              столом. Загрузка живёт в настройках перед стартом — там она и
              нужна. */}
          <div className="rules__actions">
            <Button tone="plain" block onClick={() => setSavePresetOpen(true)}>
              <Save size={16} /> Сохранить настройки
            </Button>
            <Button tone="gold" block onClick={onCloseRules}>
              Понятно
            </Button>
          </div>

          <SavePresetDialog
            open={savePresetOpen}
            rules={rules}
            onClose={() => setSavePresetOpen(false)}
          />
        </div>
      </Dialog>
    );
  }

  return null;
};
