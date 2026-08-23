import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from './engine/GameStore';
import { startBotEngine } from './engine/Bot';
import { TopBar } from './components/TopBar';
import { SeatsRow } from './components/SeatsRow';
import { Arena } from './components/Arena';
import { Card } from './components/Card';
import { PlayerCrest } from './components/PlayerCrest';
import { ActionControls } from './components/ActionControls';
import { Chronicle } from './components/Chronicle';
import { Codex } from './components/Codex';
import { Modals } from './components/Modals';
import { CardDetailModal } from './components/CardDetailModal';
import { RoleClaimPopup } from './components/RoleClaimPopup';
import { NormalActionsPopup } from './components/NormalActionsPopup';
import type { GameCard } from './engine/types';
import type { PendingTargetAction } from './components/targeting';

startBotEngine();

interface Status {
  text: string;
  tone: 'idle' | 'mine' | 'alarm';
  hint?: string;
}

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
    endTurn
  } = useGameStore();

  const [normalActionsOpen, setNormalActionsOpen] = useState(false);
  const [roleClaimOpen, setRoleClaimOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [inspectedCard, setInspectedCard] = useState<GameCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [vaBanqueCombo, setVaBanqueCombo] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<PendingTargetAction | null>(null);
  const [stakedCardIndex, setStakedCardIndex] = useState(0);
  const [redirectCardIndex, setRedirectCardIndex] = useState<number | null>(null);

  useEffect(() => {
    startGame();
    (window as unknown as { __startTargeting: (a: PendingTargetAction) => void }).__startTargeting =
      setPendingTarget;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const human = players.find(p => !p.isBot);
  const activePlayer = players.find(p => p.id === activePlayerId);
  const isMyTurn = activePlayerId === human?.id && turnPhase === 'IDLE';

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const confirmTarget = (targetId: string) => {
    if (!pendingTarget || !human) return;

    if (pendingTarget.isPlotDirect && pendingTarget.plotType) {
      playPlotAction(pendingTarget.plotType, pendingTarget.stakedCardIndex ?? 0, targetId);
    } else if (pendingTarget.isInstantDirect && pendingTarget.instantType) {
      playInstant(human.id, pendingTarget.instantType, pendingTarget.stakedCardIndex ?? 0, targetId);
    } else {
      performAction({
        type: pendingTarget.type,
        name: pendingTarget.name,
        roleClaim: pendingTarget.roleClaim,
        stakedCardIndex: pendingTarget.stakedCardIndex,
        actorId: human.id,
        targetId,
        targetCardIndex: 0,
        withVaBanque: !!pendingTarget.withVaBanque,
        costGold: pendingTarget.cost,
        costTokens: 1,
        description: pendingTarget.description ?? `Действие «${pendingTarget.name}» направлено на игрока.`
      });
    }
    setPendingTarget(null);
  };

  const handleCardClick = (card: GameCard, index: number) => {
    if (!human) return;

    if (turnPhase === 'VETO_WINDOW' && card === 'Право вето') {
      playInstant(human.id, 'Право вето', index);
      return;
    }

    if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === human.id) {
      if (card === 'Перенаправление') setRedirectCardIndex(index);
      else targetDeclareDuel(human.id, index);
      return;
    }

    if (isMyTurn) {
      setVaBanqueCombo(false);
      setStakedCardIndex(index);
      setRoleClaimOpen(true);
      return;
    }

    if (card === 'Право вето') {
      playInstant(human.id, 'Право вето', index);
      return;
    }
    showToast(`Сейчас распоряжается ${activePlayer?.name ?? 'другой придворный'}`);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        setNormalActionsOpen(false);
        setRoleClaimOpen(false);
        setRulesOpen(false);
        setCodexOpen(false);
        setChronicleOpen(false);
        setInspectedCard(null);
        setPendingTarget(null);
        setRedirectCardIndex(null);
        return;
      }

      const overlayOpen = normalActionsOpen || roleClaimOpen || codexOpen || chronicleOpen || !!pendingTarget;

      if (isMyTurn && !overlayOpen) {
        if (e.key === '1') setNormalActionsOpen(true);
        else if (e.key === '2') {
          setStakedCardIndex(0);
          setRoleClaimOpen(true);
        } else if (e.code === 'Space') {
          e.preventDefault();
          endTurn();
        }
      }

      if (!human) return;

      if (turnPhase === 'DOUBT_WINDOW' && pendingAction?.actorId !== human.id) {
        const key = e.key.toLowerCase();
        if (key === 'd' || key === 'в') doubtAction(human.id);
        else if (key === 'v' || key === 'м') passDoubt(human.id);
      }

      if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === human.id) {
        if (e.key === '1') targetAcceptAttack(human.id);
        else if (e.key === '2') targetDoubtAttack(human.id);
        else if (e.key === '3') {
          const shield = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
          const index = human.hand.indexOf(shield);
          targetDeclareDuel(human.id, index === -1 ? 0 : index);
        }
      }

      if (turnPhase === 'DUEL_ATTACKER_WINDOW' && pendingAction?.actorId === human.id) {
        if (e.key === '1') attackerRetreatDuel(human.id);
        else if (e.key === '2') attackerAcceptDuel(human.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isMyTurn,
    normalActionsOpen,
    roleClaimOpen,
    codexOpen,
    chronicleOpen,
    pendingTarget,
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

  if (players.length === 0 || !human) {
    return <div className="booting">СОЗЫВ ДВОРА</div>;
  }

  const status: Status = (() => {
    if (coronationCandidateId) {
      const candidate = players.find(p => p.id === coronationCandidateId);
      return {
        text: `Круг коронации: ${candidate?.name}`,
        tone: 'alarm',
        hint: 'сбейте влияние до конца круга'
      };
    }
    switch (turnPhase) {
      case 'TARGET_REACTION_WINDOW': {
        const victim = players.find(p => p.id === pendingAction?.targetId);
        return { text: 'Целевая атака', tone: 'alarm', hint: `${victim?.name} выбирает защиту` };
      }
      case 'DUEL_ATTACKER_WINDOW':
        return { text: 'Вызов на дуэль', tone: 'alarm', hint: `${activePlayer?.name} решает судьбу` };
      case 'DOUBT_WINDOW':
        return {
          text: 'Окно сомнений',
          tone: 'alarm',
          hint: `заявлено «${pendingAction?.roleClaim}»`
        };
      case 'VETO_WINDOW':
        return { text: 'Окно вето', tone: 'alarm', hint: 'последний шанс остановить эффект' };
      default:
        return isMyTurn
          ? { text: 'Ваш ход', tone: 'mine', hint: 'разыграйте карту или действие' }
          : { text: `Ход: ${activePlayer?.name ?? '—'}`, tone: 'idle', hint: 'придворный думает' };
    }
  })();

  const isTargetReaction =
    turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === human.id;
  const isVetoWindow = turnPhase === 'VETO_WINDOW';

  return (
    <div className="app">
      <TopBar
        statusText={status.text}
        statusTone={status.tone}
        hint={status.hint}
        codexOpen={codexOpen}
        chronicleOpen={chronicleOpen}
        onOpenCodex={() => setCodexOpen(true)}
        onOpenChronicle={() => setChronicleOpen(open => !open)}
        onOpenRules={() => setRulesOpen(true)}
        onRestart={restartGame}
      />

      <main className="app__stage">
        <div className="table">
          <div className="table__rim" />
          <SeatsRow
            pendingTargetAction={pendingTarget}
            onSelectTarget={confirmTarget}
            onInspectCard={setInspectedCard}
          />
          <Arena
            pendingTargetAction={pendingTarget}
            onCancelTarget={() => setPendingTarget(null)}
            onInspectCard={setInspectedCard}
          />
        </div>

        <div className="hero">
          <PlayerCrest
            player={human}
            isActive={activePlayerId === human.id}
            onInspectCard={setInspectedCard}
          />

          <div className="hand">
            {Array.from({ length: 2 }).map((_, index) => {
              const card = human.hand[index];
              if (!card) {
                return <div key={index} className="handcard handcard--empty" />;
              }

              const staked =
                pendingAction?.type === 'role' &&
                pendingAction.actorId === human.id &&
                turnPhase !== 'IDLE' &&
                pendingAction.stakedCardIndex === index;

              if (staked) {
                return (
                  <div
                    key={index}
                    className="handcard handcard--staked"
                    onClick={() => setInspectedCard((pendingAction.roleClaim ?? card) as GameCard)}
                    title="Карта выставлена на кон"
                  >
                    <span className="handcard__staked-label">на кону</span>
                    <span className="handcard__staked-claim">
                      «{pendingAction.roleClaim ?? card}»
                    </span>
                  </div>
                );
              }

              const vetoReady = isVetoWindow && card === 'Право вето';

              return (
                <Card
                  key={index}
                  card={card}
                  isPlayable={isMyTurn || isTargetReaction || vetoReady}
                  isSelected={roleClaimOpen && stakedCardIndex === index}
                  hint={vetoReady ? 'вето' : isTargetReaction ? 'на дуэль' : undefined}
                  onClick={() => handleCardClick(card, index)}
                />
              );
            })}
          </div>

          <ActionControls onOpenNormalActions={() => setNormalActionsOpen(true)} />
        </div>
      </main>

      <Chronicle
        open={chronicleOpen}
        onClose={() => setChronicleOpen(false)}
        onOpenRules={() => setRulesOpen(true)}
      />

      <Codex
        open={codexOpen}
        onClose={() => setCodexOpen(false)}
        onSelectCard={setInspectedCard}
      />

      <CardDetailModal card={inspectedCard} onClose={() => setInspectedCard(null)} />

      {roleClaimOpen && (
        <RoleClaimPopup
          stakedCardIndex={stakedCardIndex}
          initialWithVaBanque={vaBanqueCombo}
          onClose={() => {
            setRoleClaimOpen(false);
            setVaBanqueCombo(false);
          }}
        />
      )}
      {normalActionsOpen && (
        <NormalActionsPopup onClose={() => setNormalActionsOpen(false)} />
      )}

      <Modals
        showRules={rulesOpen}
        onCloseRules={() => setRulesOpen(false)}
        redirectCardIndex={redirectCardIndex}
        onCloseRedirect={() => setRedirectCardIndex(null)}
        onRedirectAsInstant={cardIndex => {
          setRedirectCardIndex(null);
          setPendingTarget({
            type: 'instant',
            name: 'Перенаправление',
            instantType: 'Перенаправление',
            isInstantDirect: true,
            stakedCardIndex: cardIndex,
            cost: 0
          });
        }}
        onRedirectAsDuelBluff={cardIndex => {
          setRedirectCardIndex(null);
          targetDeclareDuel(human.id, cardIndex);
        }}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
