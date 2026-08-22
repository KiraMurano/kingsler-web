import { useGameStore } from '../engine/GameStore';
import { CARD_INFO } from '../engine/cards';

interface NormalActionsPopupProps {
  onClose: () => void;
}

export function NormalActionsPopup({ onClose }: NormalActionsPopupProps) {
  const { players, performAction } = useGameStore();
  const human = players.find(p => !p.isBot);

  if (!human) return null;

  const hasTokens = human.actionTokens >= 1;

  return (
    <>
      <div className="popup-click-outside-backdrop" onClick={onClose} />

      <div 
        className="normal-actions-popup-desktop"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Strip */}
        <div className="role-popup-header">
          <div>
            <div className="role-popup-title cinzel-font">
              Обычные действия двора
            </div>
            <div className="role-popup-subtitle">
              Стоят 1 ⚡ жетон действия, доступны всегда и их нельзя оспорить
            </div>
          </div>

          <button 
            type="button"
            className="role-popup-close-btn"
            onClick={onClose}
            title="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* List of Normal Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          {/* 1. Income */}
          <button 
            type="button"
            className="role-select-card-desktop"
            style={{ padding: '8px 12px' }}
            disabled={!hasTokens}
            onClick={() => {
              onClose();
              performAction({
                type: 'normal',
                name: '🪙 Просить содержание',
                actorId: human.id,
                costGold: 0,
                costTokens: 1,
                description: 'Получает 1 🪙 из казны.'
              });
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '0.86rem' }}>🪙 Просить содержание</span>
              <span style={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 800 }}>1 ⚡ (0 🪙)</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
              Получите +1 🪙 золотой в личную казну.
            </div>
          </button>

          {/* 2. Feast */}
          <button 
            type="button"
            className="role-select-card-desktop"
            style={{ padding: '8px 12px' }}
            disabled={!hasTokens || human.gold < 3 || human.favor >= 5}
            onClick={() => {
              onClose();
              performAction({
                type: 'normal',
                name: '🍷 Устроить пир',
                actorId: human.id,
                costGold: 3,
                costTokens: 1,
                description: 'Платит 3 🪙 и получает +1 👑.'
              });
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '0.86rem' }}>🍷 Устроить пир</span>
              <span style={{ fontSize: '0.68rem', color: human.favor >= 5 ? '#f87171' : '#fbbf24', fontWeight: 800 }}>
                {human.favor >= 5 ? 'Лимит (макс. 5 👑)' : '1 ⚡ + 3 🪙'}
              </span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
              Заплатите 3 🪙 → получите +1 👑 (до 5 👑 максимум, 6-я победная только за действия/споры).
            </div>
          </button>

          {/* 3. Rumor */}
          <button 
            type="button"
            className="role-select-card-desktop"
            style={{ padding: '8px 12px' }}
            disabled={!hasTokens || human.gold < 5}
            onClick={() => {
              onClose();
              setTimeout(() => {
                (window as any).__startTargeting({
                  type: 'normal',
                  name: '📜 Распустить слух',
                  cost: 5,
                  description: 'Заплатил 5 🪙: выбранный игрок теряет -1 👑.'
                });
              }, 50);
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '0.86rem' }}>📜 Распустить слух</span>
              <span style={{ fontSize: '0.68rem', color: '#fbbf24', fontWeight: 800 }}>1 ⚡ + 5 🪙</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
              Заплатите 5 🪙 → выбранный игрок теряет -1 👑. Срывает Королевский приём! Нельзя оспорить.
            </div>
          </button>

          {/* 4. Swap 1 or 2 Cards (Free in Gold, 1 Action Token) */}
          <div className="role-select-card-desktop" style={{ cursor: 'default', background: 'rgba(15, 23, 42, 0.8)', padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '0.86rem' }}>🔄 Сменить 1 или 2 карты</span>
              <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 800 }}>1 ⚡ (Бесплатно)</span>
            </div>
            <div style={{ fontSize: '0.66rem', color: '#cbd5e1', marginBottom: '6px' }}>
              Сбросить 1 или 2 карты на выбор и сразу взять новые из колоды:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: human.hand.length >= 2 ? '1fr 1fr' : '1fr', gap: '6px', marginBottom: human.hand.length >= 2 ? '6px' : '0' }}>
              {human.hand.map((cardRole, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="action-deck-btn btn-blue"
                  disabled={!hasTokens}
                  style={{ padding: '6px 4px', height: 'auto', borderRadius: '8px', opacity: !hasTokens ? 0.4 : 1 }}
                  onClick={() => {
                    onClose();
                    performAction({
                      type: 'normal',
                      name: '🔄 Сменить карту',
                      stakedCardIndex: idx,
                      stakedCardIndices: [idx],
                      actorId: human.id,
                      costGold: 0,
                      costTokens: 1,
                      description: `Сбросил карту #${idx + 1} («${cardRole}») и бесплатно взял новую.`
                    });
                  }}
                >
                  <span style={{ fontSize: '0.58rem', color: '#93c5fd' }}>Сбросить только #{idx + 1}:</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff' }}>{CARD_INFO[cardRole]?.badge} {cardRole}</span>
                </button>
              ))}
            </div>
            {human.hand.length >= 2 && (
              <button
                type="button"
                className="action-deck-btn"
                disabled={!hasTokens}
                style={{ 
                  width: '100%',
                  padding: '7px 10px', 
                  borderRadius: '8px', 
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(99, 102, 241, 0.3))',
                  border: '1px solid rgba(56, 189, 248, 0.5)',
                  color: '#e0f2fe',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: !hasTokens ? 0.4 : 1,
                  cursor: hasTokens ? 'pointer' : 'not-allowed'
                }}
                onClick={() => {
                  onClose();
                  performAction({
                    type: 'normal',
                    name: '🔄 Сменить 2 карты',
                    stakedCardIndices: [0, 1],
                    actorId: human.id,
                    costGold: 0,
                    costTokens: 1,
                    description: `Сбросил обе карты («${human.hand[0]}», «${human.hand[1]}») и бесплатно взял 2 новые.`
                  });
                }}
              >
                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#bae6fd' }}>🔄 Сменить обе карты (2 шт.)</span>
                <span style={{ fontSize: '0.66rem', color: '#7dd3fc', fontWeight: 700 }}>Взять 2 новые 🂠🂠</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
