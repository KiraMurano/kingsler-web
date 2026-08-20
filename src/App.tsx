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
import type { Role, PlotType, InstantType, GameCard } from './engine/types';

// Start intelligent bot engine once
startBotEngine();

export default function App() {
  const { 
    players, 
    activePlayerId,
    turnPhase,
    pendingAction,
    coronationCandidateId,
    startGame, 
    restartGame,
    performAction,
    playPlotAction,
    playInstant,
    doubtAction,
    passDoubt,
    targetAcceptAttack,
    targetDoubtAttack,
    targetDeclareDuel,
    attackerRetreatDuel,
    attackerAcceptDuel,
    hasPlayedRoleThisTurn,
    endTurn
  } = useGameStore();

  const [showNormalModal, setShowNormalModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isVaBanqueComboLaunch, setIsVaBanqueComboLaunch] = useState(false);
  
  const [pendingTargetAction, setPendingTargetAction] = useState<{
    type: 'normal' | 'role' | 'plot' | 'instant';
    name: string;
    cost: number;
    roleClaim?: Role;
    plotType?: PlotType;
    instantType?: InstantType;
    isPlotDirect?: boolean;
    isInstantDirect?: boolean;
    stakedCardIndex?: number;
    withVaBanque?: boolean;
  } | null>(null);

  const [selectedStakedCardIndex, setSelectedStakedCardIndex] = useState<number>(0);

  useEffect(() => {
    startGame();
    
    // Expose target trigger for modals
    (window as any).__startTargeting = (act: any) => {
      setPendingTargetAction(act);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (pendingTargetAction.isPlotDirect && pendingTargetAction.plotType) {
      playPlotAction(pendingTargetAction.plotType, pendingTargetAction.stakedCardIndex ?? 0, targetId);
    } else if (pendingTargetAction.isInstantDirect && pendingTargetAction.instantType) {
      playInstant(human.id, pendingTargetAction.instantType, pendingTargetAction.stakedCardIndex ?? 0, targetId);
    } else {
      const withVB = !!pendingTargetAction.withVaBanque;
      performAction({
        type: pendingTargetAction.type,
        name: pendingTargetAction.name,
        roleClaim: pendingTargetAction.roleClaim,
        stakedCardIndex: pendingTargetAction.stakedCardIndex,
        actorId: human.id,
        targetId,
        targetCardIndex: cardIndex,
        withVaBanque: withVB,
        costGold: pendingTargetAction.cost,
        costTokens: 1,
        description: `Действие ${pendingTargetAction.name} направлено на игрока.`
      });
    }
    setPendingTargetAction(null);
  };

  // Click on a Card in player's hand to stake it or trigger direct instant
  const handleCardClick = (card: GameCard, cardIndex: number) => {
    if (!human) return;

    // 1. If clicking card in VETO_WINDOW:
    if (turnPhase === 'VETO_WINDOW') {
      if (card === 'Право вето' && human.actionTokens >= 1) {
        playInstant(human.id, 'Право вето', cardIndex);
        return;
      }
    }

    // 2. If in TARGET_REACTION_WINDOW:
    if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === human.id) {
      if (card === 'Перенаправление' && human.actionTokens >= 1) {
        setPendingTargetAction({
          type: 'instant',
          name: 'Перенаправление',
          instantType: 'Перенаправление',
          isInstantDirect: true,
          stakedCardIndex: cardIndex,
          cost: 0
        });
        return;
      }
      targetDeclareDuel(human.id, cardIndex);
      return;
    }

    // 3. If playing Instant or Va-banque combo during own turn:
    if (isMyTurn) {
      if (card === 'Ва-банк') {
        if (human.actionTokens < 1) {
          showToast('Недостаточно жетонов действия (нужен 1 ⚡)');
          return;
        }
        if (hasPlayedRoleThisTurn) {
          showToast('Лимит: 1 действие Роли за ход уже сыграно');
          return;
        }
        const otherIdx = cardIndex === 0 ? 1 : 0;
        const validOtherIdx = human.hand[otherIdx] ? otherIdx : 0;
        setSelectedStakedCardIndex(validOtherIdx);
        setIsVaBanqueComboLaunch(true);
        setShowRoleModal(true);
        return;
      }

      if (card === 'Шпион') {
        if (human.actionTokens < 1) {
          showToast('Недостаточно жетонов действия (нужен 1 ⚡)');
          return;
        }
        setPendingTargetAction({
          type: 'instant',
          name: 'Шпион',
          instantType: 'Шпион',
          isInstantDirect: true,
          stakedCardIndex: cardIndex,
          cost: 0
        });
        return;
      }

      if (card === 'Дворцовый переполох') {
        if (human.actionTokens < 1) {
          showToast('Недостаточно жетонов действия (нужен 1 ⚡)');
          return;
        }
        setPendingTargetAction({
          type: 'instant',
          name: 'Дворцовый переполох',
          instantType: 'Дворцовый переполох',
          isInstantDirect: true,
          stakedCardIndex: cardIndex,
          cost: 0
        });
        return;
      }
    }

    if (!isMyTurn) {
      if (card === 'Право вето' && human.actionTokens >= 1) {
        playInstant(human.id, 'Право вето', cardIndex);
        return;
      }
      const active = players.find(p => p.id === activePlayerId);
      showToast(`Сейчас ход придворного: ${active?.name || 'другого игрока'}`);
      return;
    }

    setIsVaBanqueComboLaunch(false);
    setSelectedStakedCardIndex(cardIndex);
    setShowRoleModal(true);
  };

  // Keyboard Shortcuts Listener for Desktop Experience
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      if (turnPhase === 'DOUBT_WINDOW' && pendingAction?.actorId !== human?.id && human) {
        if (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'в') {
          doubtAction(human.id);
        } else if (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м') {
          passDoubt(human.id);
        }
      }

      // 3. Target reaction hotkeys
      if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction && pendingAction.targetId === human?.id && human) {
        if (e.key === '1') {
          targetAcceptAttack(human.id);
        } else if (e.key === '2' || e.key.toLowerCase() === 'd') {
          targetDoubtAttack(human.id);
        } else if (e.key === '3' || e.key.toLowerCase() === 'b') {
          const blockingRole = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
          const matchIdx = human.hand.indexOf(blockingRole);
          targetDeclareDuel(human.id, matchIdx !== -1 ? matchIdx : 0);
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
  }, [
    isMyTurn, 
    showNormalModal, 
    showRoleModal, 
    pendingTargetAction, 
    turnPhase, 
    pendingAction, 
    human,
    endTurn,
    doubtAction,
    passDoubt,
    targetAcceptAttack,
    targetDoubtAttack,
    targetDeclareDuel,
    attackerRetreatDuel,
    attackerAcceptDuel
  ]);

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

  if (coronationCandidateId) {
    const candidate = players.find(p => p.id === coronationCandidateId);
    turnBannerTitle = '👑 КРУГ КОРОНАЦИИ!';
    turnBannerDesc = `${candidate?.name || 'Лидер'} удерживает ${candidate?.favor || 5} 👑! Сбейте его влияние, пока круг не замкнулся!`;
  } else if (turnPhase === 'TARGET_REACTION_WINDOW') {
    const target = players.find(p => p.id === pendingAction?.targetId);
    turnBannerTitle = 'ЦЕЛЕВАЯ АТАКА';
    turnBannerDesc = `${target?.name || 'Жертва'} выбирает защиту от ${pendingAction?.roleClaim}`;
  } else if (turnPhase === 'DUEL_ATTACKER_WINDOW') {
    turnBannerTitle = 'ВЫЗОВ НА ДУЭЛЬ!';
    turnBannerDesc = `${activePlayer?.name} решает: Отступить или Принять бой!`;
  } else if (turnPhase === 'DOUBT_WINDOW') {
    turnBannerTitle = 'ОКНО СОМНЕНИЙ ДВОРА';
    turnBannerDesc = `Заявлена роль «${pendingAction?.roleClaim}». Кто усомнится?`;
  } else if (turnPhase === 'VETO_WINDOW') {
    turnBannerTitle = '🚫 ОКНО ВЕТО!';
    turnBannerDesc = `Применяется «${pendingAction?.roleClaim || pendingAction?.name}»! Любой игрок может сыграть Право вето (1 ⚡).`;
  }

  return (
    <div className="desktop-viewport">
      {/* Background ambient lighting */}
      <div className="ambient-glow-overlay" />

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
            <div className="brand-subtitle">39 Карт • 6 Ролей • Интриги • Инстанты • 2 ⚡ Жетона</div>
          </div>
        </div>

        {/* Center Coronation Goal Progress Banner */}
        <div className="coronation-status-banner cinzel-font">
          <div className="coronation-goal-text">
            <span>👑 ЦЕЛЬ: 6 КОРОН (2 ⚜️ = 1 👑)</span>
          </div>
          <div className="crown-segments-track" title="Для победы удержите 6 корон круг">
            {Array.from({ length: 6 }).map((_, i) => (
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
          <div className={`current-turn-stage-banner ${coronationCandidateId ? 'final-round-active-banner' : ''}`}>
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
            {/* Player Dashboard (Name, Crowns, Gold, Seals, Tokens) */}
            {human && (
              <PlayerStatusBar 
                player={human}
                isActive={activePlayerId === human.id}
              />
            )}

            {/* Large Interactive Desktop Hand Cards */}
            {human && (
              <div className="player-hand-desktop">
                {/* Floating Role Claim Popup directly above hand cards */}
                {showRoleModal && (
                  <RoleClaimPopup 
                    stakedCardIndex={selectedStakedCardIndex}
                    initialWithVaBanque={isVaBanqueComboLaunch}
                    onClose={() => {
                      setShowRoleModal(false);
                      setIsVaBanqueComboLaunch(false);
                    }}
                  />
                )}

                {human.hand.map((card, idx) => {
                  const isStakedOnTable = pendingAction && pendingAction.type === 'role' && pendingAction.actorId === human.id && turnPhase !== 'IDLE' && (pendingAction.stakedCardIndex === idx);
                  if (isStakedOnTable) {
                    return (
                      <div key={idx} className="staked-hand-placeholder" title="Эта карта сейчас находится на кону в центре стола">
                        <div className="staked-placeholder-inner">
                          <span style={{ fontSize: '1.4rem' }}>🂠</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#fbbf24' }}>НА КОНУ</span>
                          <span style={{ fontSize: '0.58rem', color: '#94a3b8' }}>«{pendingAction.roleClaim || card}»</span>
                        </div>
                      </div>
                    );
                  }
                  const isTargetReaction = turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === human.id;
                  const isPlayable = isMyTurn || isTargetReaction;
                  const hintText = isTargetReaction ? 'НА ДУЭЛЬ' : undefined;

                  return (
                    <Card 
                      key={idx} 
                      role={card} 
                      isPlayable={isPlayable}
                      hintText={hintText}
                      isSelected={showRoleModal && selectedStakedCardIndex === idx}
                      onClick={() => handleCardClick(card, idx)}
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
