import { useEffect, useMemo, useRef, useState } from 'react';
import { pickViewer } from './lib/viewer';
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
import { BluffDialog } from './components/BluffDialog';
import { CourtActionsDialog } from './components/CourtActionsDialog';
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
import type { CardId, GameCard, InstantType, PlotType, Role } from '@kinglier/engine/types';
import { CARD_DESCRIPTIONS, isInstant, isPlot } from '@kinglier/engine/data/cardDescriptions';
import type { CardMenuKind } from './lib/tableView.ts';
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
      endTurnManually: s.endTurnManually,
      openConspiracyDialog: s.openConspiracyDialog
    }))
  );

  const [courtActionsOpen, setCourtActionsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [inspectedCard, setInspectedCard] = useState<GameCard | null>(null);
  const [pendingTarget, setPendingTarget] = useState<PendingTargetAction | null>(null);
  const [openMenuCardId, setOpenMenuCardId] = useState<CardId | null>(null);
  const [bluffCardId, setBluffCardId] = useState<CardId | null>(null);
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
          revealOutcome,
          duelOutcome
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
      revealOutcome,
      duelOutcome,
      human
    ]
  );

  /** Одна кнопка панели над картами — одно действие движка. */
  const runBarAction = (kind: BarActionKind) => {
    if (!human) return;
    switch (kind) {
      case 'court-actions':
        setCourtActionsOpen(true);
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

  /* Клик по своей карте только раскрывает меню — играет уже пункт меню.
     Повторный клик по той же карте закрывает: карта сама себе переключатель. */
  const handleCardClick = (cardId: CardId) => {
    setOpenMenuCardId(current => (current === cardId ? null : cardId));
  };

  /** «Разыграть» — карта играется тем, что она есть, без заявки чужой роли. */
  const playAtFaceValue = (cardId: CardId, card: GameCard) => {
    if (!human) return;

    if (view.phase === 'under-attack' && card === 'Перенаправление') {
      setPendingTarget({
        type: 'instant',
        name: 'Перенаправление',
        instantType: 'Перенаправление',
        isInstantDirect: true,
        stakedCardId: cardId,
        cost: 0
      });
      return;
    }
    if (isPlot(card)) {
      if (card === 'Досье') {
        setPendingTarget({
          type: 'plot',
          name: 'Досье',
          cost: 0,
          isPlotDirect: true,
          plotType: 'Досье',
          stakedCardId: cardId
        });
      } else {
        playPlotAction(card as PlotType, cardId);
      }
      return;
    }
    if (isInstant(card)) {
      setPendingTarget({
        type: 'instant',
        name: card,
        cost: 0,
        isInstantDirect: true,
        instantType: card as InstantType,
        stakedCardId: cardId
      });
      return;
    }

    const info = CARD_DESCRIPTIONS[card];
    if (info.targeted) {
      setPendingTarget({
        type: 'role',
        name: card,
        roleClaim: card as Role,
        stakedCardId: cardId,
        cost: info.cost
      });
      return;
    }
    performAction({
      type: 'role',
      name: card,
      roleClaim: card as Role,
      stakedCardId: cardId,
      actorId: human.id,
      withVaBanque: false,
      costGold: info.cost,
      costTokens: 1,
      description: info.fullDescription
    });
  };

  const pickCardAction = (cardId: CardId, kind: CardMenuKind) => {
    if (!human) return;
    const card = human.hand.find(held => held.id === cardId)?.card;
    setOpenMenuCardId(null);
    if (!card) return;

    switch (kind) {
      case 'inspect':
        setInspectedCard(card);
        break;
      case 'bluff':
        setBluffCardId(cardId);
        break;
      case 'veto':
        playInstant(human.id, 'Право вето', cardId);
        break;
      case 'duel-shield':
      case 'duel-bluff':
        targetDeclareDuel(human.id, cardId);
        break;
      case 'play':
        playAtFaceValue(cardId, card);
        break;
    }
  };

  /* Единственная клавиша, которую знает игра. Всё остальное делается мышью:
     подсказки клавиш занимали место на каждой кнопке и не использовались. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      setCourtActionsOpen(false);
      setOpenMenuCardId(null);
      setBluffCardId(null);
      setRulesOpen(false);
      setCodexOpen(false);
      setChronicleOpen(false);
      setInspectedCard(null);
      setPendingTarget(null);
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
    isSelected: placed => openMenuCardId === placed.id,
    isPlayable: placed =>
      isOwnHandCard(placed) && (isMyTurn || isTargetReaction || vetoReady(placed.face.known)),
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
          <main className="app__stage" onPointerDown={() => setOpenMenuCardId(null)}>
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

              {/* Внутри `.table` намеренно: стопки встают над панелью правого
                  соседа и держатся её опоры — правого края стола. */}
              <CardPiles />
            </div>

            <div className="hero">
              <PlayerCrest
                player={human}
                isActive={activePlayerId === human.id}
                onInspectCard={setInspectedCard}
              />

              <Hand
                player={human}
                slotBook={slotBook.current}
                openCardId={openMenuCardId}
                menus={view.menus}
                onPick={pickCardAction}
              />

              <div className="sidecol">
                <ActionBar view={view} onAct={runBarAction} />
                <PhasePanel view={view} />
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

      {bluffCardId && (
        <BluffDialog stakedCardId={bluffCardId} onClose={() => setBluffCardId(null)} />
      )}
      {courtActionsOpen && (
        <CourtActionsDialog onClose={() => setCourtActionsOpen(false)} />
      )}

      <Modals
        showRules={rulesOpen}
        onCloseRules={() => setRulesOpen(false)}
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
