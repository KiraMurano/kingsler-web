import { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import { 
  ALL_ROLES, 
  ALL_PLOTS, 
  ALL_INSTANTS, 
  CARD_INFO, 
  TOTAL_ROLES_COUNT, 
  TOTAL_PLOTS_COUNT, 
  TOTAL_INSTANTS_COUNT, 
  TOTAL_DECK_SIZE 
} from '../engine/cards';
import type { ConspiracyPromptData, Player, GameCard } from '../engine/types';

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
    <div className="game-modal-overlay" style={{ zIndex: 1000 }}>
      <div className="game-modal-content" style={{ maxWidth: '520px', border: isUnvetoable ? '2px solid #a855f7' : '2px solid #eab308' }}>
        <div className="modal-header-title cinzel-font">
          ⚔️ Свершение «Тайного заговора» ({prompt.charges}/4)
        </div>

        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <span 
            style={{ 
              display: 'inline-block',
              padding: '3px 10px', 
              borderRadius: '999px',
              fontSize: '0.74rem',
              fontWeight: 800,
              background: prompt.isImmediateReaction ? 'rgba(34, 197, 94, 0.2)' : 'rgba(147, 51, 234, 0.2)',
              color: prompt.isImmediateReaction ? '#4ade80' : '#c084fc',
              border: prompt.isImmediateReaction ? '1px solid #22c55e' : '1px solid #a855f7'
            }}
          >
            {prompt.isImmediateReaction ? '⚡ Мгновенная бесплатная реакция (0 ⚡)' : '⚡ Активация в свой ход (1 ⚡)'}
          </span>
        </div>

        {isUnvetoable && (
          <div style={{ padding: '8px 12px', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid #c084fc', borderRadius: '8px', marginBottom: '12px', textAlign: 'center', fontSize: '0.76rem', color: '#e9d5ff', fontWeight: 800 }}>
            🛡️ МАКСИМАЛЬНЫЙ ЗАРЯД (4/4): Это действие невозможно заблокировать «Правом вето»!
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
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  👑 {opp.favor} | 🪙 {opp.gold}
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
          <button
            type="button"
            className="action-deck-btn"
            onClick={() => setEffect('gold')}
            style={{
              padding: '10px 8px',
              textAlign: 'center',
              background: effect === 'gold' ? 'linear-gradient(135deg, #b45309, #d97706)' : 'rgba(255,255,255,0.05)',
              border: effect === 'gold' ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fef08a' }}>
              🪙 Сброс до 3 монет
            </div>
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1', marginTop: '4px' }}>
              {selectedTarget ? `Сбросит: ${Math.min(3, selectedTarget.gold)} 🪙 в казну` : 'Требует 2+ заряда'}
            </div>
          </button>

          {/* Option B: Crown */}
          <button
            type="button"
            className="action-deck-btn"
            disabled={prompt.charges < 3}
            onClick={() => prompt.charges >= 3 && setEffect('crown')}
            style={{
              padding: '10px 8px',
              textAlign: 'center',
              opacity: prompt.charges < 3 ? 0.4 : 1,
              background: effect === 'crown' ? 'linear-gradient(135deg, #7c2d12, #c2410c)' : 'rgba(255,255,255,0.05)',
              border: effect === 'crown' ? '2px solid #fb923c' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fed7aa' }}>
              👑 Лишить 1 короны
            </div>
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1', marginTop: '4px' }}>
              {prompt.charges < 3 ? '⛔ Требуется 3+ заряда' : selectedTarget ? `Собьёт: 1 👑 у ${selectedTarget.name}` : 'Сбивает 1 👑'}
            </div>
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="action-deck-btn btn-gold"
            style={{ flex: 1, padding: '12px' }}
            onClick={() => onActivate(selectedTarget?.id || targetId, effect, prompt.isImmediateReaction)}
          >
            <span className="action-deck-btn-title" style={{ fontSize: '0.86rem' }}>
              💥 Свершить Заговор!
            </span>
          </button>

          <button
            type="button"
            className="action-deck-btn btn-blue"
            style={{ flex: 1, padding: '12px' }}
            onClick={onClose}
          >
            <span className="action-deck-btn-title" style={{ fontSize: '0.82rem' }}>
              ⏳ Сохранить заряды
            </span>
            <span className="action-deck-btn-sub">
              {prompt.charges >= 4 ? 'Макс. заряд (4/4)' : 'Копить дальше'}
            </span>
          </button>
        </div>
      </div>
    </div>
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
    <div className="game-modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div 
        className="game-modal-content" 
        style={{ maxWidth: '500px', border: '2px solid #fbbf24', boxShadow: '0 0 35px rgba(251, 191, 36, 0.4)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header-title cinzel-font gold-gradient-text" style={{ fontSize: '1.25rem' }}>
          🔀 Реакция на атаку: «Перенаправление»
        </div>

        <div style={{ textAlign: 'center', marginBottom: '12px', fontSize: '0.84rem', color: '#cbd5e1' }}>
          Придворный <strong style={{ color: 'var(--gold-light)' }}>{attackerName}</strong> атакует вас ролью <strong style={{ color: '#ef4444' }}>«{roleClaim}»</strong>!
          <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: '4px' }}>
            Как вы хотите использовать карту <strong>«Перенаправление»</strong>?
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {/* Option 1: Instant Redirect */}
          <button
            type="button"
            className="action-deck-btn btn-gold"
            style={{ padding: '12px 14px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px' }}
            onClick={onSelectRedirect}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span className="action-deck-btn-title" style={{ fontSize: '0.92rem', color: '#fef08a' }}>
                🔀 Разыграть инстант «Перенаправление»
              </span>
              <span style={{ fontSize: '0.68rem', background: '#eab308', color: '#000', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                0 ⚡ БЕСПЛАТНО
              </span>
            </div>
            <span style={{ fontSize: '0.74rem', color: '#fef3c7', lineHeight: 1.3 }}>
              Перенаправить нападение {roleClaim === 'Вор' ? 'Вора' : 'Шантажиста'} на другого соперника за столом. Новая цель будет вынуждена защищаться!
            </span>
          </button>

          {/* Option 2: Duel Bluff */}
          <button
            type="button"
            className="action-deck-btn btn-red"
            style={{ padding: '12px 14px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px' }}
            onClick={onSelectBluffDuel}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span className="action-deck-btn-title" style={{ fontSize: '0.92rem', color: '#fca5a5' }}>
                🎭 Выставить на Дуэль как Блеф
              </span>
              <span style={{ fontSize: '0.68rem', background: '#dc2626', color: '#fff', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                0 ⚡ БЛЕФ («{blockingRole}»)
              </span>
            </div>
            <span style={{ fontSize: '0.74rem', color: '#fecaca', lineHeight: 1.3 }}>
              Положить карту взакрытую на дуэль и заявить щит {blockingRoleDeclined}. Если атакующий примет вызов и вскроет карту — ваш блеф раскроется!
            </span>
          </button>
        </div>

        <button
          type="button"
          className="action-deck-btn btn-blue"
          style={{ width: '100%', padding: '10px', fontSize: '0.8rem' }}
          onClick={onClose}
        >
          ✕ Отмена (вернуться к выбору защиты)
        </button>
      </div>
    </div>
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

export function Modals({
  showRulesModal,
  onCloseRulesModal,
  redirectModalCardIndex,
  onCloseRedirectModal,
  onConfirmRedirectInstant,
  onConfirmRedirectDuelBluff
}: ModalsProps) {
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

  // -1. Redirection Choice Modal (Redirect Instant vs Duel Bluff)
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

  // 1. Spy Peek Modal (Pure instant reveal, no stealing)
  if (turnPhase === 'SPY_PEEK' && spyPeekData) {
    const target = players.find(p => p.id === spyPeekData.targetId);
    const targetCards = spyPeekData.targetCards || ['Наследник', 'Казначей'];

    return (
      <div className="game-modal-overlay">
        <div className="game-modal-content" style={{ maxWidth: '540px' }}>
          <div className="modal-header-title cinzel-font">👁️ Тайный надзор Шпиона</div>
          <div style={{ fontSize: '0.84rem', color: '#cbd5e1', textAlign: 'center', marginBottom: '14px' }}>
            Вы тайно взглянули на обе карты игрока <strong style={{ color: 'var(--gold-light)' }}>{target?.name}</strong>. Вы получили стратегическую информацию для будущих проверок и споров:
          </div>

          {/* Target's 2 Cards View */}
          <div style={{ display: 'grid', gridTemplateColumns: targetCards.length > 1 ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '16px' }}>
            {targetCards.map((cardRole: GameCard, idx: number) => {
              const info = CARD_INFO[cardRole] || { badge: '🂠', name: cardRole, shortDescription: '', gradient: '', borderColor: '#d97706' };
              return (
                <div 
                  key={idx}
                  style={{
                    background: info.gradient || 'linear-gradient(180deg, #1e293b, #0f172a)',
                    border: `2px solid ${info.borderColor || '#fbbf24'}`,
                    borderRadius: '14px',
                    padding: '14px 10px',
                    textAlign: 'center',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--gold-light)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                      Карта #{idx + 1} у {target?.name}
                    </div>
                    <div style={{ fontSize: '2.4rem', marginBottom: '4px' }}>{info.badge}</div>
                    <div className="cinzel-font" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--gold-light)' }}>
                      {info.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#e2e8f0', marginTop: '6px', lineHeight: 1.25 }}>
                      {info.shortDescription}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '12px' }}>
            <button 
              type="button"
              className="action-deck-btn btn-gold" 
              style={{ width: '100%', padding: '12px', fontSize: '0.84rem' }}
              onClick={() => completeSpyAction()}
            >
              Понятно (запомнить карты)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Informant Peek Modal (Сеть информаторов перехватила карту)
  if (turnPhase === 'INFORMANT_PEEK' && informantPeekData) {
    const target = players.find(p => p.id === informantPeekData.targetId);
    const info = CARD_INFO[informantPeekData.newCard];

    return (
      <div className="game-modal-overlay">
        <div className="game-modal-content" style={{ maxWidth: '440px', textAlign: 'center' }}>
          <div className="modal-header-title cinzel-font">👁️ Сеть информаторов перехватила карту!</div>
          <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '14px' }}>
            Ваши шпионы донесли: соперник <strong style={{ color: 'var(--gold-light)' }}>{target?.name}</strong> получил новую карту из колоды:
          </div>

          <div 
            style={{
              background: info.gradient,
              border: `2px solid ${info.borderColor}`,
              borderRadius: '14px',
              padding: '16px',
              maxWidth: '220px',
              margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '4px' }}>{info.badge}</div>
            <div className="cinzel-font" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold-light)' }}>
              {info.name}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#e2e8f0', marginTop: '6px' }}>
              {info.shortDescription}
            </div>
          </div>

          <button
            type="button"
            className="action-deck-btn btn-gold"
            style={{ width: '100%', padding: '10px' }}
            onClick={closeInformantPeek}
          >
            Понятно (запомнить)
          </button>
        </div>
      </div>
    );
  }

  // 3. Victory / Game Over Modal
  if (turnPhase === 'GAME_OVER') {
    const isDraw = winnerId === 'draw';
    const winner = isDraw ? null : players.find(p => p.id === winnerId);
    const isHumanWinner = winner?.id === human.id;

    // Leaderboard sorted by Crowns -> Seals -> Gold
    const leaderboard = [...players].sort((a, b) => {
      if (b.favor !== a.favor) return b.favor - a.favor;
      if (b.seals !== a.seals) return b.seals - a.seals;
      return b.gold - a.gold;
    });

    return (
      <div className="game-modal-overlay">
        <div className="game-modal-content" style={{ textAlign: 'center', maxWidth: '520px' }}>
          <div style={{ fontSize: '4rem', marginBottom: '4px' }}>
            {isDraw ? '⚖️' : isHumanWinner ? '👑' : '🏆'}
          </div>
          <div className="modal-header-title cinzel-font gold-gradient-text" style={{ fontSize: '1.6rem' }}>
            {isDraw ? 'НИЧЬЯ — ПРЕСТОЛ ПУСТ!' : isHumanWinner ? 'ВЫ КОРОНОВАНЫ!' : 'КОРОНАЦИЯ СОСТОЯЛАСЬ!'}
          </div>
          <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginTop: '4px', lineHeight: 1.4 }}>
            {isDraw 
              ? 'Претенденты набрали абсолютно равное влияние. Королевство ждет новую дуэль!'
              : <>Победитель королевского двора: <strong style={{ color: 'var(--gold-light)' }}>{winner?.name}</strong>!</>}
          </div>

          {/* Leaderboard Table */}
          <div style={{ marginTop: '16px', background: 'rgba(15, 23, 42, 0.85)', borderRadius: '10px', padding: '8px 12px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--gold-light)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
              Итоговое влияние двора:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {leaderboard.map((p, rank) => {
                const isTop = rank === 0;
                return (
                  <div 
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: isTop ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: isTop ? '1px solid #eab308' : '1px solid transparent',
                      fontSize: '0.76rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, width: '16px' }}>{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`}</span>
                      <span style={{ fontWeight: isTop ? 800 : 600, color: p.id === human.id ? '#93c5fd' : '#fff' }}>
                        {p.name} {p.id === human.id ? '(Вы)' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--gold-light)', fontWeight: 800 }}>👑 {p.favor}</span>
                      <span style={{ color: '#c084fc', fontWeight: 700 }}>⚜️ {p.seals}</span>
                      <span style={{ color: '#fbbf24' }}>🪙 {p.gold}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button className="action-deck-btn btn-gold" style={{ marginTop: '16px', padding: '12px' }} onClick={restartGame}>
            Сыграть новую партию
          </button>
        </div>
      </div>
    );
  }

  // 4. Rules Modal
  if (showRulesModal) {
    return (
      <div className="game-modal-overlay" onClick={onCloseRulesModal}>
        <div className="game-modal-content" style={{ maxWidth: '680px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header-title cinzel-font">Свод законов двора Kinglier</div>
          
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <strong style={{ color: 'var(--gold-light)' }}>👑 Единая колода из {TOTAL_DECK_SIZE} карт и победа:</strong> Колода состоит из {TOTAL_ROLES_COUNT} карт Ролей ({ALL_ROLES.length} ролей × 3), {TOTAL_PLOTS_COUNT} Интриг 🎴 ({ALL_PLOTS.length} типов) и {TOTAL_INSTANTS_COUNT} Инстантов ⚡ ({ALL_INSTANTS.length} типов). Побеждает тот, кто первым удержит 6 👑 корон полный круг. За разоблачения и победы в спорах начисляются <span style={{ color: '#c084fc' }}>⚜️ печати</span> (<strong>2 ⚜️ = 1 👑</strong>).
            </div>

            <div>
              <strong style={{ color: '#38bdf8' }}>⚡ 3 Фазы Хода и 2 Жетона Действия:</strong>
              <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                <li><strong>Фаза 1 (Утро):</strong> Восполнение до 2 ⚡ + срабатывание эффектов круга («Приём», «Булла»).</li>
                <li><strong>Фаза 2 (Обычное действие, макс. 1):</strong> Содержание, Пир, Слух, Смена 1-2 карт (1 ⚡) или пропуск фазы. Вернуться к ней после перехода к картам нельзя!</li>
                <li><strong>Фаза 3 (Розыгрыш карт):</strong> Интрига 🎴 (макс. 1, 1 ⚡), Роль 👑 (макс. 1, 1 ⚡), Инстанты ⚡ (по 1 ⚡, защита 0 ⚡).</li>
                <li><strong>Добор карт:</strong> Карты из колоды добираются в руку (до 2 штук) <strong>только в конце хода</strong>!</li>
              </ul>
            </div>

            <div>
              <strong style={{ color: '#fef08a' }}>🎭 Блеф любой картой:</strong> Любую карту из руки (даже Интригу или Инстант) можно выложить взакрытую и заявить как любую из 6 Ролей! При проверке карта вскрывается и уходит в сброс.
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', fontWeight: 'bold', color: 'var(--gold-light)' }}>
              {ALL_ROLES.length} Ролей Двора ({TOTAL_ROLES_COUNT} карт):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {ALL_ROLES.map(r => (
                <div key={r} style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.05)', padding: '6px 8px', borderRadius: '6px' }}>
                  <strong style={{ color: 'var(--gold-light)' }}>{CARD_INFO[r].badge} {r}:</strong> {CARD_INFO[r].shortDescription}
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', fontWeight: 'bold', color: '#facc15' }}>
              {ALL_PLOTS.length} Интриг 🎴 ({TOTAL_PLOTS_COUNT} карт):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {ALL_PLOTS.map(p => (
                <div key={p} style={{ fontSize: '0.72rem', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                  <strong style={{ color: '#facc15' }}>{CARD_INFO[p].badge} {p}:</strong> {CARD_INFO[p].shortDescription}
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', fontWeight: 'bold', color: '#c084fc' }}>
              {ALL_INSTANTS.length} Инстантов ⚡ ({TOTAL_INSTANTS_COUNT} карт):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {ALL_INSTANTS.map(i => (
                <div key={i} style={{ fontSize: '0.72rem', background: 'rgba(192, 132, 252, 0.1)', border: '1px solid rgba(192, 132, 252, 0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                  <strong style={{ color: '#c084fc' }}>{CARD_INFO[i].badge} {i}:</strong> {CARD_INFO[i].shortDescription}
                </div>
              ))}
            </div>
          </div>

          <button className="close-modal-btn" onClick={onCloseRulesModal} style={{ marginTop: '14px' }}>Понятно</button>
        </div>
      </div>
    );
  }

  return null;
}
