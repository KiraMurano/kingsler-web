import { useEffect, useState } from 'react';
import { useGameStore } from './engine/GameStore';
import { startBotEngine } from './engine/Bot';
import { Table } from './components/Table';
import { Card } from './components/Card';
import { PlayerStatusBar } from './components/PlayerStatusBar';
import { ActionControls } from './components/ActionControls';
import { Chronicle } from './components/Chronicle';
import { Codex } from './components/Codex';
import { Modals } from './components/Modals';
import { RoleClaimPopup } from './components/RoleClaimPopup';
import { NormalActionsPopup } from './components/NormalActionsPopup';
import type { Role } from './engine/types';

// Start intelligent bot engine once
startBotEngine();

export default function App() {
  const { 
    players, 
    activePlayerId,
    turnPhase,
    pendingAction,
    coronationCandidateId,
    screenDamageFlash,
    startGame, 
    restartGame,
    performAction,
    doubtAction,
    passDoubt,
    targetAcceptAttack,
    targetDoubtAttack,
    targetDeclareDuel,
    attackerRetreatDuel,
    attackerAcceptDuel,
    endTurn
  } = useGameStore();

  const [showNormalModal, setShowNormalModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [pendingTargetAction, setPendingTargetAction] = useState<{
    type: 'normal' | 'role';
    name: string;
    cost: number;
    roleClaim?: Role;
    stakedCardIndex?: number;
  } | null>(null);

  const [selectedStakedCardIndex, setSelectedStakedCardIndex] = useState<number>(0);

  useEffect(() => {
    startGame();
    
    // Expose target trigger for modals
    (window as any).__startTargeting = (act: any) => {
      setPendingTargetAction(act);
    };
  }, []);

  const human = players.find(p => !p.isBot);
  const activePlayer = players.find(p => p.id === activePlayerId);
  const isMyTurn = activePlayerId === human?.id && turnPhase === 'IDLE';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleConfirmTarget = (targetId: string, cardIndex = 0) => {
    if (!pendingTargetAction || !human) return;
    performAction({
      type: pendingTargetAction.type,
      name: pendingTargetAction.name,
      roleClaim: pendingTargetAction.roleClaim,
      stakedCardIndex: pendingTargetAction.stakedCardIndex,
      actorId: human.id,
      targetId,
      targetCardIndex: cardIndex,
      costGold: pendingTargetAction.cost,
      description: `Действие ${pendingTargetAction.name} направлено на игрока.`
    });
    setPendingTargetAction(null);
  };

  // Click on a Card in player's hand to stake it and open role popup directly over it
  const handleCardClick = (_role: Role, cardIndex: number) => {
    if (!human) return;

    if (!isMyTurn) {
      const active = players.find(p => p.id === activePlayerId);
      showToast(`Сейчас ход придворного: ${active?.name || 'другого игрока'}`);
      return;
    }

    setSelectedStakedCardIndex(cardIndex);
    setShowRoleModal(true);
  };

  // Keyboard Shortcuts Listener for Desktop Experience
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        setShowNormalModal(false);
        setShowRoleModal(false);
        setShowRulesModal(false);
        setPendingTargetAction(null);
        return;
      }

      // 1. Idle turn hotkeys
      if (isMyTurn && !showNormalModal && !showRoleModal && !pendingTargetAction) {
        if (e.key === '1') {
          setShowNormalModal(true);
        } else if (e.key === '2') {
          setSelectedStakedCardIndex(0);
          setShowRoleModal(true);
        } else if (e.code === 'Space') {
          e.preventDefault();
          endTurn();
        }
      }

      // 2. Doubt window hotkeys
      if (turnPhase === 'DOUBT_WINDOW' && pendingAction?.actorId !== human?.id && human && human.reputation > 0) {
        if (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'в') {
          doubtAction(human.id);
        } else if (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м') {
          passDoubt(human.id);
        }
      }

      // 3. Target reaction hotkeys
      if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === human?.id && human) {
        if (e.key === '1') {
          targetAcceptAttack(human.id);
        } else if (e.key === '2' || e.key.toLowerCase() === 'd') {
          targetDoubtAttack(human.id);
        } else if (e.key === '3' || e.key.toLowerCase() === 'b') {
          targetDeclareDuel(human.id);
        }
      }

      // 4. Duel attacker window hotkeys
      if (turnPhase === 'DUEL_ATTACKER_WINDOW' && pendingAction?.actorId === human?.id && human) {
        if (e.key === '1' || e.key.toLowerCase() === 'r') {
          attackerRetreatDuel(human.id);
        } else if (e.key === '2' || e.key.toLowerCase() === 'a') {
          attackerAcceptDuel(human.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMyTurn, showNormalModal, showRoleModal, pendingTargetAction, turnPhase, pendingAction, human]);

  if (players.length === 0) {
    return (
      <div style={{ color: 'var(--gold-primary)', textAlign: 'center', marginTop: '40vh', fontSize: '1.2rem' }}>
        Загрузка королевского двора...
      </div>
    );
  }

  // Derive turn stage banner titles
  let turnBannerTitle = isMyTurn ? 'ВАШ ХОД' : `ХОД ПРИДВОРНОГО: ${activePlayer?.name?.toUpperCase() || ''}`;
  let turnBannerDesc = isMyTurn ? 'Сыграйте карту или выберите действие' : 'Обдумывает стратегию...';

  if (turnPhase === 'TARGET_REACTION_WINDOW') {
    const target = players.find(p => p.id === pendingAction?.targetId);
    turnBannerTitle = 'ЦЕЛЕВАЯ АТАКА';
    turnBannerDesc = `${target?.name || 'Жертва'} выбирает защиту от ${pendingAction?.roleClaim}`;
  } else if (turnPhase === 'DUEL_ATTACKER_WINDOW') {
    turnBannerTitle = 'ВЫЗОВ НА ДУЭЛЬ!';
    turnBannerDesc = `${activePlayer?.name} решает: Отступить или Принять бой!`;
  } else if (turnPhase === 'DOUBT_WINDOW') {
    turnBannerTitle = 'ОКНО СОМНЕНИЙ ДВОРА';
    turnBannerDesc = `Заявлена роль «${pendingAction?.roleClaim}». Кто усомнится?`;
  } else if (coronationCandidateId) {
    const cand = players.find(p => p.id === coronationCandidateId);
    turnBannerTitle = 'КРУГ КОРОНАЦИИ';
    turnBannerDesc = `👑 ${cand?.name} — Фаворит короля! Остановите его!`;
  }

  return (
    <div className={`desktop-viewport ${screenDamageFlash ? 'screen-damage-active screen-shake-anim' : ''}`}>
      {/* Background ambient lighting */}
      <div className="ambient-glow-overlay" />

      {/* Screen Damage Red Vignette Overlay */}
      {screenDamageFlash && <div className="screen-damage-vignette" />}

      {/* Toast Notice */}
      {toastMessage && (
        <div className="game-toast-notice">
          {toastMessage}
        </div>
      )}

      {/* 1. HERALDIC TOP BAR */}
      <header className="top-nav-desktop">
        {/* Brand */}
        <div className="nav-brand">
          <span className="brand-crest">👑</span>
          <div>
            <div className="brand-title cinzel-font gold-gradient-text">KINGLIER</div>
            <div className="brand-subtitle">Королевский Двор Блефа</div>
          </div>
        </div>

        {/* Center Coronation Goal Progress Banner */}
        <div className="coronation-status-banner cinzel-font">
          <div className="coronation-goal-text">
            <span>👑 ЦЕЛЬ: 7 КОРОН</span>
          </div>
          <div className="crown-segments-track" title="Для победы наберите 7 корон Благосклонности короля">
            {Array.from({ length: 7 }).map((_, i) => (
              <div 
                key={i} 
                className={`crown-segment ${(human?.favor ?? 0) > i ? 'filled' : ''}`}
              >
                {(human?.favor ?? 0) > i ? '👑' : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Top Actions */}
        <div className="nav-actions">
          <button 
            className="nav-pill-btn"
            onClick={() => setShowRulesModal(true)}
          >
            <span>📖</span>
            <span>Правила</span>
          </button>
          <button 
            className="nav-pill-btn"
            onClick={restartGame}
          >
            <span>🔄</span>
            <span>Новая партия</span>
          </button>
        </div>
      </header>

      {/* 2. MASTER 3-COLUMN DESKTOP GRID */}
      <div className="main-desktop-grid">
        {/* Left Column: Royal Chronicle (Live Feed) */}
        <Chronicle onOpenRules={() => setShowRulesModal(true)} />

        {/* Center Column: Grand Oval Table & Player Command Deck */}
        <main className="arena-center">
          {/* Top Turn Stage Banner */}
          <div className="current-turn-stage-banner">
            <span className="turn-banner-title cinzel-font">
              {turnBannerTitle}
            </span>
            <span style={{ color: 'var(--gold-border)' }}>•</span>
            <span className="turn-banner-desc">
              {turnBannerDesc}
            </span>
          </div>

          {/* Grand Oval Royal Table */}
          <Table 
            pendingTargetAction={pendingTargetAction}
            onSelectTarget={handleConfirmTarget}
            onCancelTarget={() => setPendingTargetAction(null)}
          />

          {/* Bottom Player Command Station */}
          <footer className="player-command-station">
            {/* Player Dashboard (Name, Hearts, Gold, Crowns) */}
            {human && (
              <PlayerStatusBar 
                player={human}
                isActive={activePlayerId === human.id}
              />
            )}

            {/* Large Interactive Desktop Hand Cards with Direct Floating Role Popup */}
            {human && human.reputation > 0 && (
              <div className="player-hand-desktop">
                {/* Floating Role Claim Popup directly above hand cards */}
                {showRoleModal && (
                  <RoleClaimPopup 
                    stakedCardIndex={selectedStakedCardIndex}
                    onClose={() => setShowRoleModal(false)}
                  />
                )}

                {human.hand.map((role, idx) => {
                  const isStakedOnTable = pendingAction && pendingAction.type === 'role' && pendingAction.actorId === human.id && turnPhase !== 'IDLE' && (pendingAction.stakedCardIndex === idx);
                  if (isStakedOnTable) {
                    return (
                      <div key={idx} className="staked-hand-placeholder" title="Эта карта сейчас находится на кону в центре стола">
                        <div className="staked-placeholder-inner">
                          <span style={{ fontSize: '1.4rem' }}>🂠</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#fbbf24' }}>НА КОНУ</span>
                          <span style={{ fontSize: '0.58rem', color: '#94a3b8' }}>«{pendingAction.roleClaim || role}»</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Card 
                      key={idx} 
                      role={role} 
                      isPlayable={isMyTurn}
                      isSelected={showRoleModal && selectedStakedCardIndex === idx}
                      onClick={() => handleCardClick(role, idx)}
                    />
                  );
                })}
              </div>
            )}

            {/* Action Buttons Toolbar with Direct Floating Normal Actions Popup */}
            <div style={{ position: 'relative' }}>
              {showNormalModal && (
                <NormalActionsPopup 
                  onClose={() => setShowNormalModal(false)}
                />
              )}
              <ActionControls 
                onOpenNormalActions={() => setShowNormalModal(true)}
              />
            </div>
          </footer>
        </main>

        {/* Right Column: Royal Codex (Roles Quick Guide & Rules) */}
        <Codex 
          onOpenRules={() => setShowRulesModal(true)} 
          onRestart={restartGame} 
        />
      </div>

      {/* 3. MODALS */}
      <Modals 
        showRulesModal={showRulesModal}
        onCloseRulesModal={() => setShowRulesModal(false)}
      />
    </div>
  );
}
