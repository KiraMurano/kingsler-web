import { useGameStore } from '../engine/GameStore';
import { ALL_ROLES, ROLE_INFO } from '../engine/roles';

interface RoleClaimPopupProps {
  stakedCardIndex: number;
  onClose: () => void;
}

export function RoleClaimPopup({ stakedCardIndex, onClose }: RoleClaimPopupProps) {
  const { players, performAction } = useGameStore();
  const human = players.find(p => !p.isBot);

  if (!human) return null;

  const activeStakedRole = human.hand[stakedCardIndex] || human.hand[0];
  const activeCardInfo = ROLE_INFO[activeStakedRole];

  // Arrow position pointing directly at the staked card in hand
  const arrowPosition = stakedCardIndex === 0 ? '28%' : '72%';

  return (
    <>
      {/* Invisible/soft backdrop for click-outside dismissal */}
      <div className="popup-click-outside-backdrop" onClick={onClose} />

      <div 
        className="role-claim-popup-desktop"
        style={{ '--arrow-left': arrowPosition } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        {/* Header Strip */}
        <div className="role-popup-header">
          <div>
            <div className="role-popup-title cinzel-font">
              Заявление роли двору
            </div>
            <div className="role-popup-subtitle">
              На кону карта #{stakedCardIndex + 1}: <strong style={{ color: 'var(--gold-light)' }}>{activeCardInfo?.badge} {activeStakedRole}</strong> (взакрытую)
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

        {/* 4x2 Grid of Roles */}
        <div className="roles-grid-desktop" style={{ gap: '8px' }}>
          {ALL_ROLES.map(role => {
            const info = ROLE_INFO[role];
            const canAfford = human.gold >= info.cost;
            const isTrueCard = role === activeStakedRole;

            return (
              <button
                key={role}
                className={`role-select-card-desktop ${isTrueCard ? 'is-truth-role' : ''}`}
                disabled={!canAfford}
                style={{
                  padding: '8px 10px',
                  borderColor: isTrueCard ? 'rgba(74, 222, 128, 0.85)' : undefined,
                  background: isTrueCard 
                    ? 'linear-gradient(180deg, rgba(34, 197, 94, 0.2) 0%, rgba(15, 23, 42, 0.95) 100%)' 
                    : undefined,
                  boxShadow: isTrueCard ? '0 0 16px rgba(34, 197, 94, 0.3)' : undefined
                }}
                onClick={() => {
                  onClose();
                  if (info.targeted) {
                    setTimeout(() => {
                      (window as any).__startTargeting({
                        type: 'role',
                        name: role,
                        roleClaim: role,
                        stakedCardIndex,
                        cost: info.cost
                      });
                    }, 50);
                  } else {
                    performAction({
                      type: 'role',
                      name: role,
                      roleClaim: role,
                      stakedCardIndex,
                      actorId: human.id,
                      costGold: info.cost,
                      description: info.fullDescription
                    });
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.25rem' }}>{info.badge}</span>
                    <span style={{ fontWeight: 800, color: isTrueCard ? '#4ade80' : 'var(--gold-light)', fontSize: '0.85rem' }}>
                      {role}
                    </span>
                  </div>

                  {isTrueCard ? (
                    <span className="role-truth-badge">
                      ✨ ПРАВДА
                    </span>
                  ) : (
                    <span className="role-bluff-badge">
                      🎭 БЛЕФ
                    </span>
                  )}
                </div>

                {info.cost > 0 && (
                  <span style={{ fontSize: '0.65rem', color: '#fbbf24', fontWeight: 700 }}>Стоимость: {info.cost} 💰</span>
                )}
                <div style={{ fontSize: '0.68rem', color: '#cbd5e1', lineHeight: 1.25 }}>
                  {info.shortDescription}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
