import { useEffect, useMemo, useRef, useState } from 'react';
import { pickViewer } from './lib/viewer';
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
import { PhasePanel } from './components/PhasePanel';
import { ActionBar } from './components/ActionBar';
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
import { deriveTableView } from './lib/tableView.ts';
import type { BarActionKind } from './lib/tableView.ts';
import { reconcileSlots } from './lib/handSlotBook.ts';
import type { SlotBook } from './lib/handSlotBook.ts';
import type { CardInteraction } from './motion/CardLayer.tsx';
import type { PlacedCard } from './motion/zones.ts';
import { onlineClient, type ConnectionStatus } from './online/OnlineGameClient';
import type { CardId, GameCard } from '@kinglier/engine/types';
import type { PendingTargetAction } from './components/targeting';
import type { Account } from './auth/AuthClient';

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
    turnSubPhase,
    pendingDoubtDoubterId,
    pendingDoubtPassedIds,
    hasUsedNormalActionThisTurn,
    hasPlayedRoleThisTurn,
    hasPlayedPlotThisTurn,
    isVetoed,
    vetoDeadlineAt,
    history,
    endTurnManually,
    openConspiracyDialog
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
      turnSubPhase: s.turnSubPhase,
      pendingDoubtDoubterId: s.pendingDoubtDoubterId,
      pendingDoubtPassedIds: s.pendingDoubtPassedIds,
      hasUsedNormalActionThisTurn: s.hasUsedNormalActionThisTurn,
      hasPlayedRoleThisTurn: s.hasPlayedRoleThisTurn,
      hasPlayedPlotThisTurn: s.hasPlayedPlotThisTurn,
      isVetoed: s.isVetoed,
      vetoDeadlineAt: s.vetoDeadlineAt,
      history: s.history,
      endTurnManually: s.endTurnManually,
      openConspiracyDialog: s.openConspiracyDialog
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

  /* Единственная производная правда о том, что видно: правая колонка, панель
     над картами и меню на карте читают её и потому не могут разойтись. */
  const view = useMemo(
    () =>
      deriveTableView(
        {
          players,
          activePlayerId,
          turnPhase,
          turnSubPhase,
          pendingAction,
          pendingDoubtDoubterId,
          pendingDoubtPassedIds,
          hasUsedNormalActionThisTurn,
          hasPlayedRoleThisTurn,
          hasPlayedPlotThisTurn,
          isVetoed,
          vetoDeadlineAt,
          coronationCandidateId,
          history
        },
        human?.id ?? ''
      ),
    [
      players,
      activePlayerId,
      turnPhase,
      turnSubPhase,
      pendingAction,
      pendingDoubtDoubterId,
      pendingDoubtPassedIds,
      hasUsedNormalActionThisTurn,
      hasPlayedRoleThisTurn,
      hasPlayedPlotThisTurn,
      isVetoed,
      vetoDeadlineAt,
      coronationCandidateId,
      history,
      human
    ]
  );

  /** Одна кнопка панели над картами — одно действие движка. */
  const runBarAction = (kind: BarActionKind) => {
    if (!human) return;
    switch (kind) {
      case 'court-actions':
        setNormalActionsOpen(true);
        break;
      case 'conspiracy':
        openConspiracyDialog(false);
        break;
      case 'end-turn':
        endTurnManually();
        break;
      case 'doubt':
        /* Одна кнопка на две фазы: под атакой сомнение адресное, в общем
           окне — от лица двора. */
        if (view.phase === 'under-attack') targetDoubtAttack(human.id);
        else doubtAction(human.id);
        break;
      case 'believe':
        passDoubt(human.id);
        break;
      case 'accept-attack':
        targetAcceptAttack(human.id);
        break;
      case 'duel-accept':
        attackerAcceptDuel(human.id);
        break;
      case 'duel-retreat':
        attackerRetreatDuel(human.id);
        break;
    }
  };

  /* Прицел живёт ровно столько, сколько длится фаза, в которой его открыли.
     Он — состояние интерфейса, и раньше переживал передачу хода: выбрав
     «Шантажиста» и нажав «Завершить ход», игрок оставлял висящий прицел и мог
     ткнуть в жертву посреди чужого хода. Движок такое теперь отвергает (см.
     `performAction`), но и показывать невозможный выбор незачем. */
  useEffect(() => {
    setPendingTarget(null);
  }, [view.phase, activePlayerId]);

  const confirmTarget = (targetId: string) => {
    /* Вторая застава на случай, если фаза сменилась в тот же кадр, что и клик. */
    if (view.phase !== 'turn' && view.phase !== 'under-attack') return;
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

  /* Единственная клавиша, которую знает игра. Всё остальное делается мышью:
     подсказки клавиш занимали место на каждой кнопке и не использовались. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      setNormalActionsOpen(false);
      setRoleClaimOpen(false);
      setRulesOpen(false);
      setCodexOpen(false);
      setChronicleOpen(false);
      setInspectedCard(null);
      setPendingTarget(null);
      setRedirectCardId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (players.length === 0 || !human) {
    return <div className="booting">СОЗЫВ ДВОРА</div>;
  }



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

              <div className="sidecol">
                <PhasePanel view={view} />
                <ActionBar view={view} onAct={runBarAction} />
              </div>
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
