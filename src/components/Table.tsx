import { useGameStore } from '../engine/GameStore';
import { PlayerAvatar } from './PlayerAvatar';
import { StakedCardArena } from './StakedCardArena';
import type { Role, PlotType, InstantType, Player } from '../engine/types';

interface TableProps {
  pendingTargetAction?: { 
    type: 'normal' | 'role' | 'plot' | 'instant'; 
    name: string; 
    cost: number; 
    roleClaim?: Role; 
    plotType?: PlotType;
    instantType?: InstantType;
    isPlotDirect?: boolean;
    isInstantDirect?: boolean;
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

  // Desktop Arc Seat Positioning for the 3 opponent bots (Left, Top Center, Right)
  const botSeatPositions = [
    { seat: 2, top: '44%', left: '-12px', transform: 'translateY(-50%)' },               // Bot 1 (Left)
    { seat: 3, top: '-34px', left: '50%', transform: 'translateX(-50%)' },              // Bot 2 (Top Center)
    { seat: 4, top: '44%', right: '-12px', transform: 'translateY(-50%)' }              // Bot 3 (Right)
  ];

  const isValidTarget = (player: Player): boolean => {
    if (!pendingTargetAction) return false;
    if (player.id === human?.id) return false;
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

        {/* 3 Bot Avatars seated along the table perimeter */}
        <div className="table-bots-perimeter">
          {botSeatPositions.map((pos) => {
            const player = players.find(p => p.seatNumber === pos.seat);
            if (!player) return null;

            const isTargetable = isValidTarget(player);

            return (
              <PlayerAvatar 
                key={player.id}
                player={player}
                isActive={activePlayerId === player.id}
                isTargetable={isTargetable}
                onTarget={isTargetable && onSelectTarget ? () => onSelectTarget(player.id) : undefined}
                style={{
                  position: 'absolute',
                  top: pos.top,
                  left: pos.left,
                  right: pos.right,
                  transform: pos.transform
                }}
              />
            );
          })}
        </div>

        {/* Center Staked Arena for Active Cards & 3D Flips */}
        <StakedCardArena />
      </div>
    </div>
  );
}
