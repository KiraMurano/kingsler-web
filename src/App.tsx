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
import { CardDetailModal } from './components/CardDetailModal';
import { RoleClaimPopup } from './components/RoleClaimPopup';
import { NormalActionsPopup } from './components/NormalActionsPopup';
import { Button } from './components/ui/Button';
import { Badge } from './components/ui/Badge';
import { 
  ALL_ROLES, 
  ALL_PLOTS, 
  ALL_INSTANTS 
} from './data/cardDescriptions';
import { TOTAL_DECK_SIZE } from './engine/cards';

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
    deck,
    history,
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
    endTurn
  } = useGameStore();

  const [showNormalModal, setShowNormalModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showChronicleSheet, setShowChronicleSheet] = useState(false);
  const [showCodexSheet, setShowCodexSheet] = useState(false);
  const [inspectedCard, setInspectedCard] = useState<GameCard | null>(null);
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
  const [redirectModalCardIndex, setRedirectModalCardIndex] = useState<number | null>(null);

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

  // Click on a Card in player's hand
  const handleCardClick = (card: GameCard, cardIndex: number) => {
    if (!human) return;

    // 1. If clicking card in VETO_WINDOW:
    if (turnPhase === 'VETO_WINDOW') {
      if (card === 'Право вето') {
        playInstant(human.id, 'Право вето', cardIndex);
        return;
      }
    }

    // 2. If in TARGET_REACTION_WINDOW:
    if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === human.id) {
      if (card === 'Перенаправление') {
        setRedirectModalCardIndex(cardIndex);
        return;
      }
      targetDeclareDuel(human.id, cardIndex);
      return;
    }

    // 3. If in own turn (IDLE):
    if (isMyTurn) {
      setIsVaBanqueComboLaunch(false);
      setSelectedStakedCardIndex(cardIndex);
      setShowRoleModal(true);
      return;
    }

    // 4. If not my turn:
    if (card === 'Право вето') {
      playInstant(human.id, 'Право вето', cardIndex);
      return;
    }
    const active = players.find(p => p.id === activePlayerId);
    showToast(`Сейчас ход придворного: ${active?.name || 'другого игрока'}`);
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        setShowNormalModal(false);
        setShowRoleModal(false);
        setShowRulesModal(false);
        setShowChronicleSheet(false);
        setShowCodexSheet(false);
        setInspectedCard(null);
        setPendingTargetAction(null);
        setRedirectModalCardIndex(null);
        return;
      }

      // 1. Idle turn hotkeys
      if (isMyTurn && !showNormalModal && !showRoleModal && !pendingTargetAction && !showChronicleSheet && !showCodexSheet) {
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
    showChronicleSheet,
    showCodexSheet,
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
    turnBannerDesc = `${candidate?.name || 'Лидер'} удерживает ${candidate?.favor || 6} 👑! Сбейте его влияние, пока круг не замкнулся!`;
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
    turnBannerDesc = `Применяется «${pendingAction?.roleClaim || pendingAction?.name}»! Любой игрок может сыграть Право вето (0 ⚡).`;
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
            <div className="brand-subtitle">
              {TOTAL_DECK_SIZE} Карт • {ALL_ROLES.length} Ролей • {ALL_PLOTS.length} Интриг • {ALL_INSTANTS.length} Инстантов
            </div>
          </div>
        </div>

        {/* Center: Dynamic Turn Stage & Action Status Pill */}
        <div className={`top-turn-stage-pill ${coronationCandidateId ? 'final-round-active-banner' : ''}`}>
          <span className="turn-pill-icon">{isMyTurn ? '⚔️' : (coronationCandidateId ? '👑' : '⏳')}</span>
          <span className="turn-banner-title cinzel-font">
            {turnBannerTitle}
          </span>
          <span className="turn-pill-divider">•</span>
          <span className="turn-banner-desc">
            {turnBannerDesc}
          </span>
        </div>

        {/* Right Actions & Navigation Buttons */}
        <div className="nav-actions">
          {/* Coronation Goal Tracker */}
          <div className="coronation-status-banner cinzel-font">
            <div className="coronation-goal-text">
              <span>ЦЕЛЬ: 6 👑</span>
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

          {/* Button: Chronicle (Летопись) */}
          <Button
            variant={showChronicleSheet ? 'gold' : 'secondary'}
            size="sm"
            onClick={() => setShowChronicleSheet(true)}
            title="Открыть летопись дворцовых событий"
          >
            <span>📜 Летопись</span>
            <Badge variant="gold" size="sm">{history.length}</Badge>
          </Button>

          {/* Button: Codex (Кодекс) */}
          <Button
            variant={showCodexSheet ? 'gold' : 'secondary'}
            size="sm"
            onClick={() => setShowCodexSheet(true)}
            title="Открыть кодекс всех карт и колоду"
          >
            <span>📖 Кодекс</span>
            <Badge variant="sapphire" size="sm">🂠 {deck.length}</Badge>
          </Button>

          {/* Button: Rules */}
          <Button 
            variant="ghost"
            size="sm"
            onClick={() => setShowRulesModal(true)}
            title="Открыть свод правил игры"
          >
            ⚖️ Правила
          </Button>

          {/* Button: New Game */}
          <Button 
            variant="ghost"
            size="sm"
            onClick={restartGame}
            title="Начать новую партию"
          >
            🔄 Новая игра
          </Button>
        </div>
      </header>

      {/* 2. FULL-STAGE ARENA (Center Focus on Royal Table & Player Heroes) */}
      <main className="main-full-stage">
        {/* Grand Oval Royal Table */}
        <Table 
          pendingTargetAction={pendingTargetAction}
          onSelectTarget={handleConfirmTarget}
          onCancelTarget={() => setPendingTargetAction(null)}
          onInspectCard={(card) => setInspectedCard(card)}
        />

        {/* Bottom Player Command Station */}
        <footer className="player-command-station">
          {/* Player Dashboard (Name, Crowns, Gold, Seals, Tokens, Active Plot) */}
          {human && (
            <PlayerStatusBar 
              player={human}
              isActive={activePlayerId === human.id}
              onInspectCard={(card) => setInspectedCard(card)}
            />
          )}

          {/* Central Hero: Two Interactive Desktop Hand Cards */}
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
                    <div 
                      key={idx} 
                      className="staked-hand-placeholder" 
                      style={{ cursor: 'pointer' }}
                      onClick={() => setInspectedCard((pendingAction.roleClaim || card) as GameCard)}
                      title="Нажмите, чтобы открыть подробное описание заявленной карты"
                    >
                      <div className="staked-placeholder-inner">
                        <span style={{ fontSize: '1.4rem' }}>🂠</span>
                        <Badge variant="gold" size="sm">НА КОНУ</Badge>
                        <span style={{ fontSize: '0.82rem', color: '#fef08a', marginTop: '2px', fontWeight: 800 }}>«{pendingAction.roleClaim || card}»</span>
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

      {/* 3. SLIDE-OUT SHEETS (Chronicle and Codex) */}
      <Chronicle 
        open={showChronicleSheet}
        onClose={() => setShowChronicleSheet(false)}
        onOpenRules={() => {
          setShowChronicleSheet(false);
          setShowRulesModal(true);
        }}
      />

      <Codex 
        open={showCodexSheet}
        onClose={() => setShowCodexSheet(false)}
        onOpenRules={() => {
          setShowCodexSheet(false);
          setShowRulesModal(true);
        }}
        onSelectCardToInspect={(card) => {
          setInspectedCard(card);
        }}
      />

      {/* 4. CARD DETAIL INSPECTION MODAL */}
      <CardDetailModal
        card={inspectedCard}
        onClose={() => setInspectedCard(null)}
      />

      {/* 5. GAME OUTCOME & ACTION MODALS */}
      <Modals 
        showRulesModal={showRulesModal}
        onCloseRulesModal={() => setShowRulesModal(false)}
        redirectModalCardIndex={redirectModalCardIndex}
        onCloseRedirectModal={() => setRedirectModalCardIndex(null)}
        onConfirmRedirectInstant={(cardIdx) => {
          setRedirectModalCardIndex(null);
          setPendingTargetAction({
            type: 'instant',
            name: 'Перенаправление',
            instantType: 'Перенаправление',
            isInstantDirect: true,
            stakedCardIndex: cardIdx,
            cost: 0
          });
        }}
        onConfirmRedirectDuelBluff={(cardIdx) => {
          setRedirectModalCardIndex(null);
          if (human) {
            targetDeclareDuel(human.id, cardIdx);
          }
        }}
      />
    </div>
  );
}
