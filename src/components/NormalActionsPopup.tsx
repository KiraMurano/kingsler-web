import { useGameStore } from '../engine/GameStore';
import { ROLE_INFO } from '../engine/roles';

interface NormalActionsPopupProps {
  onClose: () => void;
}

export function NormalActionsPopup({ onClose }: NormalActionsPopupProps) {
  const { players, performAction } = useGameStore();
  const human = players.find(p => !p.isBot);

  if (!human) return null;

  return (
    <>
      {/* Invisible backdrop for click-outside dismissal without blurring cards */}
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
              Доступны всегда, не требуют роли и их нельзя оспорить
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
            onClick={() => {
              onClose();
              performAction({
                type: 'normal',
                name: '🪙 Просить содержание',
                actorId: human.id,
                costGold: 0,
                description: 'Получает 1 💰 из казны.'
              });
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '0.86rem' }}>🪙 Просить содержание</span>
              <span style={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 800 }}>Бесплатно</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
              Получите +1 💰 золотой в личную казну.
            </div>
          </button>

          {/* 2. Feast */}
          <button 
            type="button"
            className="role-select-card-desktop"
            style={{ padding: '8px 12px' }}
            disabled={human.gold < 3 || human.favor >= 4}
            onClick={() => {
              onClose();
              performAction({
                type: 'normal',
                name: '🍷 Устроить пир',
                actorId: human.id,
                costGold: 3,
                description: 'Платит 3 💰 и получает +1 👑.'
              });
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '0.86rem' }}>🍷 Устроить пир</span>
              <span style={{ fontSize: '0.68rem', color: human.favor >= 4 ? '#f87171' : '#fbbf24', fontWeight: 800 }}>
                {human.favor >= 4 ? 'Лимит (макс. 4 👑)' : '3 💰'}
              </span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
              Заплатите 3 💰 → получите +1 👑 (до 4 👑 максимум, 5-я только за Наследника/Шантажиста).
            </div>
          </button>

          {/* 3. Restore Reputation (Heal) */}
          <button 
            type="button"
            className="role-select-card-desktop"
            style={{ padding: '8px 12px' }}
            disabled={human.gold < 5 || human.reputation >= 3}
            onClick={() => {
              onClose();
              performAction({
                type: 'normal',
                name: '❤️ Восстановить репутацию',
                actorId: human.id,
                costGold: 5,
                description: 'Платит 5 💰 и восстанавливает 1 ❤️ репутации.'
              });
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: '#f43f5e', fontSize: '0.86rem' }}>❤️ Восстановить репутацию</span>
              <span style={{ fontSize: '0.68rem', color: human.reputation >= 3 ? '#94a3b8' : '#fbbf24', fontWeight: 800 }}>
                {human.reputation >= 3 ? 'Максимум (3 ❤️)' : '5 💰'}
              </span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
              Заплатите 5 💰 → восстановите 1 ❤️ репутации (макс. 3 ❤️).
            </div>
          </button>

          {/* 4. Rumor */}
          <button 
            type="button"
            className="role-select-card-desktop"
            style={{ padding: '8px 12px' }}
            disabled={human.gold < 5}
            onClick={() => {
              onClose();
              setTimeout(() => {
                (window as any).__startTargeting({
                  type: 'normal',
                  name: '📜 Распустить слух',
                  cost: 5,
                  description: 'Заплатил 5 💰: выбранный игрок теряет -1 👑.'
                });
              }, 50);
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '0.86rem' }}>📜 Распустить слух</span>
              <span style={{ fontSize: '0.68rem', color: '#fbbf24', fontWeight: 800 }}>5 💰</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
              Заплатите 5 💰 → выбранный игрок теряет -1 👑. Нельзя оспорить или заблокировать!
            </div>
          </button>

          {/* 5. Swap 1 Card */}
          <div className="role-select-card-desktop" style={{ cursor: 'default', background: 'rgba(15, 23, 42, 0.8)', padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '0.86rem' }}>🔄 Сменить карту с руки</span>
              <span style={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 800 }}>Бесплатно</span>
            </div>
            <div style={{ fontSize: '0.66rem', color: '#cbd5e1', marginBottom: '6px' }}>
              Сбросить 1 карту в сброс и взять новую из колоды:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {human.hand.map((cardRole, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="action-deck-btn btn-blue"
                  style={{ padding: '6px 4px', height: 'auto', borderRadius: '8px' }}
                  onClick={() => {
                    onClose();
                    performAction({
                      type: 'normal',
                      name: '🔄 Сменить карту',
                      stakedCardIndex: idx,
                      actorId: human.id,
                      costGold: 0,
                      description: `Сбросил карту ${idx + 1} («${cardRole}») и взял новую.`
                    });
                  }}
                >
                  <span style={{ fontSize: '0.58rem', color: '#93c5fd' }}>Сбросить #{idx + 1}:</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff' }}>{ROLE_INFO[cardRole]?.badge} {cardRole}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
