import { useGameStore } from '../engine/GameStore';
import { PlayerAvatar } from './PlayerAvatar';
import { StakedCardArena } from './StakedCardArena';
import type { Role, Player } from '../engine/types';

interface TableProps {
  pendingTargetAction?: { 
    type: 'normal' | 'role'; 
    name: string; 
    cost: number; 
    roleClaim?: Role; 
    stakedCardIndex?: number 
  } | null;
  onSelectTarget?: (targetId: string) => void;
  onCancelTarget?: () => void;
}

export function Table({ 
  pendingTargetAction, 
  onSelectTarget,
  onCancelTarget
}: TableProps) {
  const { players, activePlayerId } = useGameStore();
  const human = players.find(p => !p.isBot);

  // Desktop Arc Seat Positioning for the 5 opponent bots (Optimized with full top clearance)
  const botSeatPositions = [
    { seat: 5, top: '46%', left: '-14px', transform: 'translateY(-50%)' },               // Yulia (Far Left)
    { seat: 2, top: '-22px', left: '25%', transform: 'none' },                           // Masha (Top Left)
    { seat: 6, top: '-34px', left: '50%', transform: 'translateX(-50%)' },               // Anton (Top Center)
    { seat: 3, top: '-22px', right: '25%', transform: 'none' },                          // Sasha (Top Right)
    { seat: 4, top: '46%', right: '-14px', transform: 'translateY(-50%)' }               // Dima (Far Right)
  ];

  const isValidTarget = (player: Player): boolean => {
    if (!pendingTargetAction) return false;
    if (player.id === human?.id || player.reputation <= 0) return false;
    if (pendingTargetAction.roleClaim === 'Шантажист' && player.favor === 0) return false;
    return true;
  };

  return (
    <div className="desktop-table-container">
      <div className="grand-oval-table">
        {/* Felt border pattern */}
        <div className="table-felt-pattern" />

        {/* Center Crown Watermark */}
        <div className="table-center-crest">👑</div>

        {/* Floating Targeting Prompt Banner when choosing a victim */}
        {pendingTargetAction && (
          <div className="table-targeting-banner">
            <div className="targeting-banner-content cinzel-font">
              <span className="targeting-icon-pulse">🎯</span>
              <span className="targeting-text">
                Выберите цель для <strong style={{ color: 'var(--gold-light)' }}>«{pendingTargetAction.name}»</strong>:
              </span>
              <button 
                type="button" 
                className="targeting-cancel-pill"
                onClick={onCancelTarget}
              >
                ✕ Отмена (Esc)
              </button>
            </div>
          </div>
        )}

        {/* 5 Bot Avatars seated along the table perimeter */}
        {botSeatPositions.map(cfg => {
          const player = players.find(p => p.seatNumber === cfg.seat);
          if (!player) return null;

          const isCurrentActive = activePlayerId === player.id;
          const isTargetable = isValidTarget(player);

          return (
            <PlayerAvatar 
              key={player.id}
              player={player}
              isActive={isCurrentActive}
              isTargetable={isTargetable}
              onTarget={() => {
                if (isTargetable && onSelectTarget) {
                  onSelectTarget(player.id);
                }
              }}
              style={{
                top: cfg.top,
                left: cfg.left,
                right: cfg.right,
                transform: cfg.transform
              }}
            />
          );
        })}

        {/* Center Interactive 3D Staked Card Arena */}
        <StakedCardArena />
      </div>
    </div>
  );
}
