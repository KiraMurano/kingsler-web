import { useEffect, useMemo, useRef, useState } from 'react';
import { pickViewer } from './lib/viewer';
import { idOf } from '@kinglier/engine/cardInstance';
import { useToast } from './lib/toast';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { startBotEngine, stopBotEngine } from '@kinglier/engine/Bot';
import { timerManager } from '@kinglier/engine/utils/timerManager';
import { TopBar } from './components/TopBar';
import { SeatsRow } from './components/SeatsRow';
import { Arena } from './components/Arena';
import { CardPiles } from './components/CardPiles';
import { Hand } from './components/Hand';
import { PlayerCrest } from './components/PlayerCrest';
import { ActionControls } from './components/ActionControls';
import { Chronicle } from './components/Chronicle';
import { Codex } from './components/Codex';
import { Modals } from './components/Modals';
import { CardDetailModal } from './components/CardDetailModal';
import { RoleClaimPopup } from './components/RoleClaimPopup';
import { NormalActionsPopup } from './components/NormalActionsPopup';
import { Button } from './components/ui/Button';
import { AnchorProvider } from './motion/AnchorRegistry.tsx';
import { CardInteractionProvider, CardLayer } from './motion/CardLayer.tsx';
import { deriveCardZones } from './lib/cardZones.ts';
import { reconcileSlots } from './lib/handSlotBook.ts';
import type { SlotBook } from './lib/handSlotBook.ts';
import type { CardInteraction } from './motion/CardLayer.tsx';
import type { PlacedCard } from './motion/zones.ts';
import { onlineClient, type ConnectionStatus } from './online/OnlineGameClient';
import type { CardId, GameCard } from '@kinglier/engine/types';
import type { PendingTargetAction } from './components/targeting';
import type { Account } from './auth/AuthClient';

interface Status {
  text: string;
  tone: 'idle' | 'mine' | 'alarm';
  hint?: string;
}

export default function App({
  mode,
  account,
  onExit
}: {
  mode: 'offline' | 'online';
  account: Account;
  onExit: () => void;
}) {
  const {
    players,
    deck,
    discardPile,
    activePlayerId,
    turnPhase,
    pendingAction,
    pendingDuelDefenderCardId,
    pendingDuelDefenderRoleClaim,
    overlayInstant,
    revealOutcome,
    duelOutcome,
    coronationCandidateId,
    coronationOriginId,
    viewerId,
    startGame,
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
  } = useGameStore(
    useShallow(s => ({
      players: s.players,
      deck: s.deck,
      discardPile: s.discardPile,
      activePlayerId: s.activePlayerId,
      turnPhase: s.turnPhase,
      pendingAction: s.pendingAction,
      pendingDuelDefenderCardId: s.pendingDuelDefenderCardId,
      pendingDuelDefenderRoleClaim: s.pendingDuelDefenderRoleClaim,
      overlayInstant: s.overlayInstant,
      revealOutcome: s.revealOutcome,
      duelOutcome: s.duelOutcome,
      coronationCandidateId: s.coronationCandidateId,
      coronationOriginId: s.coronationOriginId,
      viewerId: s.viewerId,
      startGame: s.startGame,
      performAction: s.performAction,
      playPlotAction: s.playPlotAction,
      playInstant: s.playInstant,
      doubtAction: s.doubtAction,
      passDoubt: s.passDoubt,
      targetAcceptAttack: s.targetAcceptAttack,
      targetDoubtAttack: s.targetDoubtAttack,
      targetDeclareDuel: s.targetDeclareDuel,
      attackerRetreatDuel: s.attackerRetreatDuel,
      attackerAcceptDuel: s.attackerAcceptDuel,
      endTurn: s.endTurn
    }))
  );

  const [normalActionsOpen, setNormalActionsOpen] = useState(false);
  const [roleClaimOpen, setRoleClaimOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [inspectedCard, setInspectedCard] = useState<GameCard | null>(null);
  const [vaBanqueCombo, setVaBanqueCombo] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<PendingTargetAction | null>(null);
  const [stakedCardId, setStakedCardId] = useState<CardId | null>(null);
  const [redirectCardId, setRedirectCardId] = useState<CardId | null>(null);
  const showToast = useToast();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');

  useEffect(() => {
    (window as unknown as { __startTargeting: (a: PendingTargetAction) => void }).__startTargeting =
      setPendingTarget;
    if (mode !== 'offline') return;
    startBotEngine();
    startGame([{ id: 'p1', name: account.nickname, avatar: account.avatar, title: account.title }]);
    return () => {
      stopBotEngine();
      timerManager.clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== 'online') return;
    return onlineClient.onStatusChange(setConnectionStatus);
  }, [mode]);

  const human = pickViewer(players, mode === 'online' ? viewerId : undefined);
  const activePlayer = players.find(p => p.id === activePlayerId);
  const isMyTurn = activePlayerId === human?.id && turnPhase === 'IDLE' && !pendingAction;

  /* Which hand slot each held card owns. The engine keeps `hand` compact, so
     the array index is not a slot: `reconcileSlots` remembers instead, and a
     card that nobody touched keeps the slot it was dealt into. Kept in a ref
     because it is genuinely carried state, not derived — but the function is
     pure and idempotent, so reconciling inside the memo below (twice, under
     StrictMode) lands in the same place either way. */
  const slotBook = useRef<SlotBook>({});

  /* Every card at the table, placed by state alone. Memoised on the exact
     slice placement depends on, so opening a modal does not hand `CardLayer`
     a fresh array and make it reconcile fifty nodes for nothing. */
  const placedCards = useMemo(
    () => {
      slotBook.current = reconcileSlots(slotBook.current, players);
      return deriveCardZones(
        {
          players,
          deck,
          discardPile,
          pendingAction,
          pendingDuelDefenderCardId,
          overlayInstant,
          revealOutcome,
          duelOutcome,
          turnPhase
        },
        human?.id ?? '',
        slotBook.current
      );
    },
    [
      players,
      deck,
      discardPile,
      pendingAction,
      pendingDuelDefenderCardId,
      overlayInstant,
      revealOutcome,
      duelOutcome,
      turnPhase,
      human
    ]
  );

  const confirmTarget = (targetId: string) => {
    if (!pendingTarget || !human) return;

    const cardId = pendingTarget.stakedCardId ?? human.hand[0]?.id;

    if (pendingTarget.isPlotDirect && pendingTarget.plotType && cardId) {
      playPlotAction(pendingTarget.plotType, cardId, targetId);
    } else if (pendingTarget.isInstantDirect && pendingTarget.instantType && cardId) {
      playInstant(human.id, pendingTarget.instantType, cardId, targetId);
    } else {
      performAction({
        type: pendingTarget.type,
        name: pendingTarget.name,
        roleClaim: pendingTarget.roleClaim,
        stakedCardId: pendingTarget.stakedCardId,
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

  const handleCardClick = (cardId: CardId) => {
    if (!human) return;
    const card = human.hand.find(held => held.id === cardId)?.card;
    if (!card) return;

    if (turnPhase === 'VETO_WINDOW' && card === 'Право вето') {
      playInstant(human.id, 'Право вето', cardId);
      return;
    }

    if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === human.id) {
      if (card === 'Перенаправление') setRedirectCardId(cardId);
      else targetDeclareDuel(human.id, cardId);
      return;
    }

    if (isMyTurn) {
      setVaBanqueCombo(false);
      setStakedCardId(cardId);
      setRoleClaimOpen(true);
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
        setRedirectCardId(null);
        return;
      }

      const overlayOpen = normalActionsOpen || roleClaimOpen || codexOpen || chronicleOpen || !!pendingTarget;

      if (isMyTurn && !overlayOpen) {
        if (e.key === '1') setNormalActionsOpen(true);
        else if (e.key === '2') {
          setStakedCardId(human?.hand[0]?.id ?? null);
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
          const shieldId = idOf(human.hand, shield) ?? human.hand[0]?.id;
          if (shieldId) targetDeclareDuel(human.id, shieldId);
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
      const origin = players.find(p => p.id === coronationOriginId);
      return {
        text: `Круг коронации: ${candidate?.name}`,
        tone: 'alarm',
        hint: origin ? `до хода ${origin.name}` : 'сбейте влияние до конца круга'
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

  /* What a card in the layer may do. Only the viewer's own hand cards are
     ever playable; everything else is inspectable at most. */
  const vetoReady = (card: GameCard | null) => isVetoWindow && card === 'Право вето';
  const isOwnHandCard = (placed: PlacedCard) =>
    placed.zone.kind === 'hand' && placed.zone.playerId === human.id;

  /**
   * What a face-down card on the table is claiming to be.
   *
   * A staked card lies face-down for everyone, its own owner included, so the
   * card layer has no face to inspect and clicking it used to do nothing. The
   * *claim*, though, is public — it is the word printed on the badge right
   * under the card — and it is the thing a player actually wants the rule for
   * when they are deciding whether to shout «не верю». So the claim is what
   * the description opens on. Never the real face: the reveal is the only
   * thing allowed to turn a card over.
   */
  const claimedRoleFor = (placed: PlacedCard): GameCard | undefined => {
    switch (placed.zone.kind) {
      case 'stake':
        return (pendingAction?.roleClaim ??
          pendingAction?.plotType ??
          pendingAction?.instantType) as GameCard | undefined;
      case 'duel':
        return placed.zone.side === 'attacker'
          ? ((pendingAction?.roleClaim ?? duelOutcome?.attackerClaim) as GameCard | undefined)
          : ((pendingDuelDefenderRoleClaim ?? duelOutcome?.defenderClaim) as GameCard | undefined);
      default:
        return undefined;
    }
  };

  const cardInteraction: CardInteraction = {
    onActivate: handleCardClick,
    onInspect: setInspectedCard,
    claimFor: claimedRoleFor,
    isOwnHand: isOwnHandCard,
    isSelected: placed => roleClaimOpen && stakedCardId === placed.id,
    isPlayable: placed =>
      isOwnHandCard(placed) && (isMyTurn || isTargetReaction || vetoReady(placed.face.known)),
    hintFor: placed => {
      if (!isOwnHandCard(placed)) return undefined;
      if (vetoReady(placed.face.known)) return 'вето';
      if (isTargetReaction) return 'на дуэль';
      return undefined;
    }
  };

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
        onExit={onExit}
      />

      <AnchorProvider>
        <CardInteractionProvider value={cardInteraction}>
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

            {/* Outside `.table` on purpose: the piles stand beside the felt,
                clear of every seat panel. */}
            <CardPiles />

            <div className="hero">
              <PlayerCrest
                player={human}
                isActive={activePlayerId === human.id}
                onInspectCard={setInspectedCard}
              />

              <Hand player={human} />

              <ActionControls onOpenNormalActions={() => setNormalActionsOpen(true)} />
            </div>

            <CardLayer cards={placedCards} />
          </main>
        </CardInteractionProvider>
      </AnchorProvider>

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

      {roleClaimOpen && stakedCardId && (
        <RoleClaimPopup
          stakedCardId={stakedCardId}
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
        redirectCardId={redirectCardId}
        onCloseRedirect={() => setRedirectCardId(null)}
        onRedirectAsInstant={cardId => {
          setRedirectCardId(null);
          setPendingTarget({
            type: 'instant',
            name: 'Перенаправление',
            instantType: 'Перенаправление',
            isInstantDirect: true,
            stakedCardId: cardId,
            cost: 0
          });
        }}
        onRedirectAsDuelBluff={cardId => {
          setRedirectCardId(null);
          targetDeclareDuel(human.id, cardId);
        }}
      />

      {mode === 'online' && connectionStatus !== 'connected' && (
        <div className="reconnect-overlay">
          <div className="reconnect-overlay__panel">
            {connectionStatus === 'reconnecting' ? (
              <div className="lobby__waiting">
                <span className="lobby__waiting-dot" />
                Переподключение…
              </div>
            ) : (
              <>
                <p>Соединение потеряно.</p>
                <Button tone="gold" onClick={onExit}>
                  В главное меню
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
