import { useGameStore } from '../engine/GameStore';

interface ActionControlsProps {
  onOpenNormalActions: () => void;
}

export function ActionControls({
  onOpenNormalActions
}: ActionControlsProps) {
  const { 
    players, 
    activePlayerId, 
    turnPhase, 
    pendingAction, 
    doubtAction, 
    passDoubt, 
    targetAcceptAttack, 
    targetDoubtAttack, 
    targetDeclareDuel, 
    attackerRetreatDuel, 
    attackerAcceptDuel, 
    endTurn 
  } = useGameStore();

  const human = players.find(p => !p.isBot);
  const isEliminated = !human || human.reputation <= 0;
  const isMyTurn = !isEliminated && activePlayerId === human.id && turnPhase === 'IDLE';
  const isActor = pendingAction?.actorId === human?.id;
  const isTarget = pendingAction?.targetId === human?.id;

  // 1. TARGET REACTION WINDOW (Victim's exclusive decision)
  if (turnPhase === 'TARGET_REACTION_WINDOW' && !isEliminated) {
    const actor = players.find(p => p.id === pendingAction?.actorId);
    const blockingRole = pendingAction?.roleClaim === 'Вор' ? 'Казначеем' : 'Рыцарем';

    if (isTarget) {
      return (
        <div className="player-actions-toolbar">
          <div style={{ fontSize: '0.72rem', color: '#fef08a', fontWeight: 800, textAlign: 'center', marginBottom: '2px' }}>
            ⚔️ {actor?.name} атакует вас «{pendingAction?.roleClaim}»!
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
            {/* Option 1: Accept */}
            <button 
              className="action-deck-btn btn-blue"
              onClick={() => targetAcceptAttack(human.id)}
              style={{ padding: '6px 4px' }}
            >
              <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>🏳️ Принять</span>
              <span className="action-deck-btn-sub">Без риска</span>
            </button>
            {/* Option 2: Doubt */}
            <button 
              className="action-deck-btn btn-red"
              onClick={() => targetDoubtAttack(human.id)}
              style={{ padding: '6px 4px' }}
            >
              <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>⚔️ Не верю!</span>
              <span className="action-deck-btn-sub">Проверить</span>
            </button>
            {/* Option 3: Duel */}
            <button 
              className="action-deck-btn btn-gold"
              onClick={() => targetDeclareDuel(human.id)}
              style={{ padding: '6px 4px' }}
            >
              <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>🤺 Дуэль!</span>
              <span className="action-deck-btn-sub">Блок {blockingRole}</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 2. DUEL ATTACKER WINDOW (Attacker's decision: 2 vertical rows)
  if (turnPhase === 'DUEL_ATTACKER_WINDOW' && !isEliminated) {
    if (isActor) {
      return (
        <div className="player-actions-toolbar">
          <button 
            className="action-deck-btn btn-red"
            onClick={() => attackerAcceptDuel(human.id)}
            style={{ padding: '8px 12px' }}
          >
            <span className="action-deck-btn-title">
              ⚔️ Принять дуэль! <span className="hotkey-badge">[2]</span>
            </span>
            <span className="action-deck-btn-sub">Вскрыть карту на кону</span>
          </button>
          <button 
            className="action-deck-btn btn-blue"
            onClick={() => attackerRetreatDuel(human.id)}
            style={{ padding: '6px 12px' }}
          >
            <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>
              🏳️ Отступить <span className="hotkey-badge">[1]</span>
            </span>
            <span className="action-deck-btn-sub">Сбросить карту в сброс (0 ❤️)</span>
          </button>
        </div>
      );
    }
  }

  // 3. DOUBT WINDOW (Court check for truth vs bluff: 2 vertical rows identical to default)
  if (turnPhase === 'DOUBT_WINDOW' && !isActor && !isEliminated) {
    return (
      <div className="player-actions-toolbar">
        {/* Top Button: Doubt / Check */}
        <button 
          className="action-deck-btn btn-red"
          onClick={() => doubtAction(human.id)}
          style={{ padding: '8px 12px' }}
        >
          <span className="action-deck-btn-title">
            ⚔️ Сомневаюсь! <span className="hotkey-badge">[D]</span>
          </span>
          <span className="action-deck-btn-sub">Проверить карту на блеф</span>
        </button>

        {/* Bottom Button: Pass / Trust */}
        <button 
          className="action-deck-btn btn-green"
          onClick={() => passDoubt(human.id)}
          style={{ padding: '6px 12px' }}
        >
          <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>
            ✋ Верю <span className="hotkey-badge">[V]</span>
          </span>
          <span className="action-deck-btn-sub">Пропустить ход</span>
        </button>
      </div>
    );
  }

  // 4. DEFAULT IDLE ACTION BAR (When choosing action on player's turn or waiting)
  return (
    <div className="player-actions-toolbar">
      {/* Blue Button: Normal Actions */}
      <button 
        className="action-deck-btn btn-blue"
        disabled={!isMyTurn}
        onClick={onOpenNormalActions}
        style={{ padding: '9px 12px' }}
      >
        <span className="action-deck-btn-title">
          🕊️ Обычные действия <span className="hotkey-badge">[1]</span>
        </span>
        <span className="action-deck-btn-sub">Пир, Содержание, Слух, Смена</span>
      </button>

      {/* Pass / Skip Turn Button */}
      <button 
        className="action-deck-btn btn-red"
        style={{ padding: '6px 12px' }}
        disabled={!isMyTurn}
        onClick={endTurn}
      >
        <span className="action-deck-btn-title" style={{ fontSize: '0.72rem' }}>
          ✋ Пропустить ход <span className="hotkey-badge">[Пробел]</span>
        </span>
      </button>
    </div>
  );
}
