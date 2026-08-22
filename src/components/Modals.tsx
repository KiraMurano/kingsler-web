import React, { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import { 
  ALL_ROLES, 
  ALL_PLOTS, 
  ALL_INSTANTS, 
  CARD_DESCRIPTIONS 
} from '../data/cardDescriptions';

import {
  TOTAL_ROLES_COUNT, 
  TOTAL_PLOTS_COUNT, 
  TOTAL_INSTANTS_COUNT, 
  TOTAL_DECK_SIZE 
} from '../engine/cards';

import type { ConspiracyPromptData, Player, GameCard } from '../engine/types';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

function ConspiracyModalDialog({
  prompt,
  players,
  onClose,
  onActivate
}: {
  prompt: ConspiracyPromptData;
  players: Player[];
  onClose: () => void;
  onActivate: (targetId: string, effect: 'gold' | 'crown', isImmediate: boolean) => void;
}) {
  const opponents = players.filter(p => p.isBot);
  const [targetId, setTargetId] = useState<string>(opponents[0]?.id || '');
  const [effect, setEffect] = useState<'gold' | 'crown'>(prompt.charges >= 3 ? 'crown' : 'gold');

  const selectedTarget = opponents.find(p => p.id === targetId) || opponents[0];
  const isUnvetoable = prompt.charges >= 4;

  return (
    <Dialog
      open={true}
      onClose={onClose}
      maxWidth="520px"
      title={`⚔️ Свершение «Тайного заговора» (${prompt.charges}/4)`}
      description={
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          <Badge variant={prompt.isImmediateReaction ? 'emerald' : 'purple'}>
            {prompt.isImmediateReaction ? '⚡ Мгновенная реакция • 0 ⚡' : '⚡ Активация в ход • 1 ⚡'}
          </Badge>
          {isUnvetoable && (
            <Badge variant="ruby">🛡️ БЕЗ ПРАВА ВЕТО</Badge>
          )}
        </div>
      }
    >
      <div>
        {isUnvetoable && (
          <div style={{ padding: '8px 12px', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid #c084fc', borderRadius: '8px', marginBottom: '12px', textAlign: 'center', fontSize: '0.78rem', color: '#e9d5ff', fontWeight: 800 }}>
            🛡️ МАКСИМАЛЬНЫЙ ЗАРЯД (4/4): Это действие невозможно отменить «Правом вето»!
          </div>
        )}

        {/* 1. Target Selection */}
        <div style={{ fontSize: '0.78rem', color: '#fef08a', fontWeight: 800, marginBottom: '6px' }}>
          1. Выберите цель заговора:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
          {opponents.map(opp => {
            const isSel = opp.id === targetId;
            return (
              <div
                key={opp.id}
                onClick={() => setTargetId(opp.id)}
                style={{
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  background: isSel ? 'rgba(234, 179, 8, 0.25)' : 'rgba(255,255,255,0.05)',
                  border: isSel ? '2px solid #facc15' : '1px solid rgba(255,255,255,0.1)',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ fontSize: '1.4rem' }}>{opp.avatar}</div>
                <div style={{ fontWeight: 800, fontSize: '0.78rem', color: isSel ? '#fef08a' : '#cbd5e1' }}>
                  {opp.name}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '4px' }}>
                  <Badge variant="gold" size="sm">👑 {opp.favor}</Badge>
                  <Badge variant="amber" size="sm">🪙 {opp.gold}</Badge>
                </div>
              </div>
            );
          })}
        </div>

        {/* 2. Effect Selection */}
        <div style={{ fontSize: '0.78rem', color: '#fef08a', fontWeight: 800, marginBottom: '6px' }}>
          2. Выберите эффект разрядки:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {/* Option A: Coins */}
          <Button
            variant={effect === 'gold' ? 'gold' : 'secondary'}
            size="md"
            onClick={() => setEffect('gold')}
            style={{ width: '100%', padding: '10px 8px' }}
            subtext={selectedTarget ? `Сбросит: ${Math.min(3, selectedTarget.gold)} 🪙 в казну` : 'Требует 2+ заряда'}
          >
            🪙 Сброс до 3 монет
          </Button>

          {/* Option B: Crown */}
          <Button
            variant={effect === 'crown' ? 'red' : 'secondary'}
            size="md"
            disabled={prompt.charges < 3}
            onClick={() => prompt.charges >= 3 && setEffect('crown')}
            style={{ width: '100%', padding: '10px 8px' }}
            subtext={prompt.charges < 3 ? '⛔ Нужно 3+ заряда' : selectedTarget ? `Собьёт 1 👑 у ${selectedTarget.name}` : 'Сбивает 1 👑'}
          >
            👑 Лишить 1 короны
          </Button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="gold"
            size="lg"
            style={{ flex: 1 }}
            onClick={() => onActivate(selectedTarget?.id || targetId, effect, prompt.isImmediateReaction)}
          >
            💥 Свершить Заговор!
          </Button>

          <Button
            variant="blue"
            size="lg"
            style={{ flex: 1 }}
            subtext={prompt.charges >= 4 ? 'Макс. заряд • 4/4' : 'Копить дальше'}
            onClick={onClose}
          >
            ⏳ Сохранить заряды
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function RedirectChoiceModal({
  attackerName,
  roleClaim,
  onSelectRedirect,
  onSelectBluffDuel,
  onClose
}: {
  attackerName: string;
  roleClaim: string;
  onSelectRedirect: () => void;
  onSelectBluffDuel: () => void;
  onClose: () => void;
}) {
  const blockingRole = roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
  const blockingRoleDeclined = roleClaim === 'Вор' ? 'Казначеем' : 'Рыцарем';

  return (
    <Dialog
      open={true}
      onClose={onClose}
      maxWidth="500px"
      title="🔀 Реакция на атаку: «Перенаправление»"
      description={`Придворный ${attackerName} атакует вас ролью «${roleClaim}»!`}
    >
      <div>
        <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '14px', textAlign: 'center' }}>
          Как вы хотите использовать карту <strong>«Перенаправление»</strong>?
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {/* Option 1: Instant Redirect */}
          <Button
            variant="gold"
            size="md"
            style={{ padding: '12px 14px', alignItems: 'flex-start', textAlign: 'left' }}
            subtext="Перенаправить нападение на другого соперника за столом. Новая цель будет вынуждена защищаться!"
            onClick={onSelectRedirect}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{ fontSize: '0.92rem', color: '#fef08a' }}>🔀 Разыграть инстант «Перенаправление»</span>
              <Badge variant="gold" size="sm">0 ⚡ Бесплатно</Badge>
            </div>
          </Button>

          {/* Option 2: Duel Bluff */}
          <Button
            variant="red"
            size="md"
            style={{ padding: '12px 14px', alignItems: 'flex-start', textAlign: 'left' }}
            subtext={`Положить карту взакрытую на дуэль и заявить щит ${blockingRoleDeclined}. Если атакующий примет вызов — ваш блеф раскроется!`}
            onClick={onSelectBluffDuel}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{ fontSize: '0.92rem', color: '#fca5a5' }}>🎭 Выставить на Дуэль как Блеф</span>
              <Badge variant="ruby" size="sm">0 ⚡ БЛЕФ • {blockingRole}</Badge>
            </div>
          </Button>
        </div>

        <Button
          variant="secondary"
          size="md"
          style={{ width: '100%' }}
          onClick={onClose}
        >
          ✕ Отмена (вернуться к выбору защиты)
        </Button>
      </div>
    </Dialog>
  );
}

interface ModalsProps {
  showRulesModal: boolean;
  onCloseRulesModal: () => void;
  redirectModalCardIndex?: number | null;
  onCloseRedirectModal?: () => void;
  onConfirmRedirectInstant?: (cardIndex: number) => void;
  onConfirmRedirectDuelBluff?: (cardIndex: number) => void;
}

export const Modals: React.FC<ModalsProps> = ({
  showRulesModal,
  onCloseRulesModal,
  redirectModalCardIndex,
  onCloseRedirectModal,
  onConfirmRedirectInstant,
  onConfirmRedirectDuelBluff
}) => {
  const { 
    players, 
    pendingAction,
    spyPeekData,
    informantPeekData,
    conspiracyPrompt,
    completeSpyAction,
    closeInformantPeek,
    closeConspiracyDialog,
    activateConspiracy,
    turnPhase,
    winnerId,
    restartGame
  } = useGameStore();

  const human = players.find(p => !p.isBot);
  if (!human) return null;

  // -1. Redirection Choice Modal
  if (redirectModalCardIndex !== undefined && redirectModalCardIndex !== null && pendingAction) {
    const attacker = players.find(p => p.id === pendingAction.actorId);
    return (
      <RedirectChoiceModal
        attackerName={attacker?.name || 'Нападающий'}
        roleClaim={pendingAction.roleClaim || 'Атака'}
        onSelectRedirect={() => onConfirmRedirectInstant?.(redirectModalCardIndex)}
        onSelectBluffDuel={() => onConfirmRedirectDuelBluff?.(redirectModalCardIndex)}
        onClose={() => onCloseRedirectModal?.()}
      />
    );
  }

  // 0. Conspiracy Modal
  if (conspiracyPrompt) {
    return (
      <ConspiracyModalDialog
        prompt={conspiracyPrompt}
        players={players}
        onClose={closeConspiracyDialog}
        onActivate={(targetId, effect, isImmediate) => {
          activateConspiracy(human.id, targetId, effect, isImmediate);
        }}
      />
    );
  }

  // 1. Spy Peek Modal
  if (turnPhase === 'SPY_PEEK' && spyPeekData) {
    const target = players.find(p => p.id === spyPeekData.targetId);
    const targetCards = spyPeekData.targetCards || ['Наследник', 'Казначей'];

    return (
      <Dialog
        open={true}
        onClose={() => completeSpyAction()}
        maxWidth="500px"
        title="👁️ Тайный надзор Шпиона"
        description={`Вы тайно взглянули на обе карты игрока ${target?.name}`}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '14px 0 18px' }}>
            {targetCards.map((cardRole: GameCard, idx: number) => {
              const info = CARD_DESCRIPTIONS[cardRole] || CARD_DESCRIPTIONS['Наследник'];
              return (
                <div 
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Badge variant="gold" size="sm">Карта #{idx + 1}</Badge>
                  <div 
                    style={{
                      width: '130px',
                      aspectRatio: '2 / 3',
                      borderRadius: '12px',
                      border: `2px solid ${info.borderColor || '#fbbf24'}`,
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.8)'
                    }}
                  >
                    <img 
                      src={info.artImage} 
                      alt={info.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <Button 
            variant="gold" 
            size="md"
            style={{ width: '100%' }}
            onClick={() => completeSpyAction()}
          >
            Понятно (запомнить карты)
          </Button>
        </div>
      </Dialog>
    );
  }

  // 2. Informant Peek Modal
  if (turnPhase === 'INFORMANT_PEEK' && informantPeekData) {
    const target = players.find(p => p.id === informantPeekData.targetId);
    const info = CARD_DESCRIPTIONS[informantPeekData.newCard];

    return (
      <Dialog
        open={true}
        onClose={closeInformantPeek}
        maxWidth="420px"
        title="👁️ Сеть информаторов перехватила карту!"
        description={`Соперник ${target?.name} получил новую карту из колоды:`}
      >
        <div style={{ textAlign: 'center' }}>
          <div 
            style={{
              width: '140px',
              aspectRatio: '2 / 3',
              borderRadius: '12px',
              border: `2px solid ${info.borderColor}`,
              overflow: 'hidden',
              margin: '12px auto 18px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.8)'
            }}
          >
            <img 
              src={info.artImage} 
              alt={info.name} 
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
            />
          </div>

          <Button
            variant="gold"
            size="md"
            style={{ width: '100%' }}
            onClick={closeInformantPeek}
          >
            Понятно (запомнить)
          </Button>
        </div>
      </Dialog>
    );
  }

  // 3. Victory / Game Over Modal
  if (turnPhase === 'GAME_OVER') {
    const isDraw = winnerId === 'draw';
    const winner = isDraw ? null : players.find(p => p.id === winnerId);
    const isHumanWinner = winner?.id === human.id;

    const leaderboard = [...players].sort((a, b) => {
      if (b.favor !== a.favor) return b.favor - a.favor;
      if (b.seals !== a.seals) return b.seals - a.seals;
      return b.gold - a.gold;
    });

    return (
      <Dialog
        open={true}
        onClose={restartGame}
        maxWidth="540px"
        title={isDraw ? '⚖️ НИЧЬЯ — ПРЕСТОЛ ПУСТ!' : isHumanWinner ? '👑 ВЫ КОРОНОВАНЫ!' : '🏆 КОРОНАЦИЯ СОСТОЯЛАСЬ!'}
        description={isDraw ? 'Претенденты набрали равное влияние.' : `Победитель королевского двора: ${winner?.name}!`}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '8px' }}>
            {isDraw ? '⚖️' : isHumanWinner ? '👑' : '🏆'}
          </div>

          {/* Leaderboard Table */}
          <div style={{ margin: '14px 0', background: 'rgba(15, 23, 42, 0.85)', borderRadius: '10px', padding: '10px 14px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--gold-light)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
              Итоговое влияние двора:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {leaderboard.map((p, rank) => {
                const isTop = rank === 0;
                return (
                  <div 
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      background: isTop ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: isTop ? '1px solid #eab308' : '1px solid transparent',
                      fontSize: '0.78rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, width: '18px' }}>{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`}</span>
                      <span style={{ fontWeight: isTop ? 800 : 600, color: p.id === human.id ? '#93c5fd' : '#fff' }}>
                        {p.name} {p.id === human.id ? '(Вы)' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <Badge variant="gold" size="sm">👑 {p.favor}</Badge>
                      <Badge variant="purple" size="sm">⚜️ {p.seals}</Badge>
                      <Badge variant="amber" size="sm">🪙 {p.gold}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Button variant="gold" size="lg" style={{ width: '100%', marginTop: '10px' }} onClick={restartGame}>
            Сыграть новую партию
          </Button>
        </div>
      </Dialog>
    );
  }

  // 4. Full Rules Modal
  if (showRulesModal) {
    return (
      <Dialog
        open={true}
        onClose={onCloseRulesModal}
        maxWidth="680px"
        title="Свод законов двора Kinglier"
        description={`Единая колода из ${TOTAL_DECK_SIZE} карт • Цель: 6 👑 корон`}
      >
        <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <strong style={{ color: 'var(--gold-light)' }}>👑 Колода и победа:</strong> Колода состоит из {TOTAL_ROLES_COUNT} карт Ролей ({ALL_ROLES.length} ролей по 3), {TOTAL_PLOTS_COUNT} Интриг 🎴 ({ALL_PLOTS.length} типов) и {TOTAL_INSTANTS_COUNT} Инстантов ⚡ ({ALL_INSTANTS.length} типов). Побеждает тот, кто первым удержит 6 👑 корон полный круг. За разоблачения и победы в спорах начисляются <span style={{ color: '#c084fc' }}>⚜️ печати</span> (<strong>2 ⚜️ = 1 👑</strong>).
          </div>

          <div>
            <strong style={{ color: '#38bdf8' }}>⚡ 3 Фазы Хода и 2 Жетона Действия:</strong>
            <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
              <li><strong>Фаза 1 (Утро):</strong> Восполнение до 2 ⚡ + срабатывание эффектов («Приём», «Булла»).</li>
              <li><strong>Фаза 2 (Обычное действие, макс. 1):</strong> Содержание, Пир, Слух, Смена карт (1 ⚡) или пропуск фазы.</li>
              <li><strong>Фаза 3 (Розыгрыш карт):</strong> Интрига 🎴 (макс. 1, 1 ⚡), Роль 👑 (макс. 1, 1 ⚡), Инстанты ⚡ (по 1 ⚡, защита 0 ⚡).</li>
              <li><strong>Добор карт:</strong> Карты из колоды добираются в руку (до 2 штук) <strong>только в конце хода</strong>!</li>
            </ul>
          </div>

          <div>
            <strong style={{ color: '#fef08a' }}>🎭 Блеф любой картой:</strong> Любую карту из руки можно выложить взакрытую и заявить как любую из 6 Ролей! При проверке карта вскрывается и уходит в сброс.
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', fontWeight: 'bold', color: 'var(--gold-light)' }}>
            {ALL_ROLES.length} Ролей Двора:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {ALL_ROLES.map(r => (
              <div key={r} style={{ fontSize: '0.74rem', background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '6px' }}>
                <strong style={{ color: 'var(--gold-light)' }}>{CARD_DESCRIPTIONS[r].badge} {r}:</strong> {CARD_DESCRIPTIONS[r].shortDescription}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', fontWeight: 'bold', color: '#facc15' }}>
            {ALL_PLOTS.length} Интриг 🎴:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {ALL_PLOTS.map(p => (
              <div key={p} style={{ fontSize: '0.74rem', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.25)', padding: '6px 10px', borderRadius: '6px' }}>
                <strong style={{ color: '#facc15' }}>{CARD_DESCRIPTIONS[p].badge} {p}:</strong> {CARD_DESCRIPTIONS[p].shortDescription}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', fontWeight: 'bold', color: '#c084fc' }}>
            {ALL_INSTANTS.length} Инстантов ⚡:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {ALL_INSTANTS.map(i => (
              <div key={i} style={{ fontSize: '0.74rem', background: 'rgba(192, 132, 252, 0.1)', border: '1px solid rgba(192, 132, 252, 0.25)', padding: '6px 10px', borderRadius: '6px' }}>
                <strong style={{ color: '#c084fc' }}>{CARD_DESCRIPTIONS[i].badge} {i}:</strong> {CARD_DESCRIPTIONS[i].shortDescription}
              </div>
            ))}
          </div>

          <Button variant="gold" size="md" style={{ marginTop: '10px' }} onClick={onCloseRulesModal}>
            Понятно
          </Button>
        </div>
      </Dialog>
    );
  }

  return null;
};
