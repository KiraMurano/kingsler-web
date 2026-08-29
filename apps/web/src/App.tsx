import { useEffect, useMemo, useRef, useState } from 'react';
import { pickViewer } from './lib/viewer';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { startBotEngine, stopBotEngine } from '@kinglier/engine/Bot';
import { timerManager } from '@kinglier/engine/utils/timerManager';
import type { GameRules } from '@kinglier/engine/rules';
import { TopBar } from './components/TopBar';
import { SeatsRow } from './components/SeatsRow';
import { Arena } from './components/Arena';
import { CardPiles } from './components/CardPiles';
import { DuelClash } from './components/DuelClash';
import { Hand } from './components/Hand';
import { CardMenu } from './components/CardMenu';
import { PlayerCrest } from './components/PlayerCrest';
import { PhasePanel } from './components/PhasePanel';
import { ActionBar } from './components/ActionBar';
import { Chronicle } from './components/Chronicle';
import { Codex } from './components/Codex';
import { Modals } from './components/Modals';
import { OpeningSequence } from './components/OpeningSequence';
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
import { rememberFaces } from './lib/faceBook.ts';
import type { SlotBook } from './lib/handSlotBook.ts';
import type { FaceBook } from './lib/faceBook.ts';
import type { CardInteraction } from './motion/CardLayer.tsx';
import type { PlacedCard } from './motion/zones.ts';
import { onlineClient, type ConnectionStatus } from './online/OnlineGameClient';
import type { CardId, GameCard, InstantType, PlotType, Role } from '@kinglier/engine/types';
import { CARD_DESCRIPTIONS, isInstant, isPlot, type InspectableItem } from '@kinglier/engine/data/cardDescriptions';
import type { CardMenuKind } from './lib/tableView.ts';
import type { PendingTargetAction } from './components/targeting';
import type { Account } from './auth/AuthClient';
import { InspectCardContext } from './lib/inspectCardContext';
import './styles/rules.css';

export default function App({
  mode,
  account,
  onExit,
  offlineRules
}: {
  mode: 'offline' | 'online';
  account: Account;
  onExit: () => void;
  /** Правила партии с ботами, выбранные на экране перед стартом. */
  offlineRules?: GameRules;
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
    opening,
    viewerId,
    startGame,
    performAction,
    playPlotAction,
    playInstant,
    doubtAction,
    passDoubt,
    passVeto,
    targetAcceptAttack,
    targetDoubtAttack,
    targetDeclareDuel,
    turnSubPhase,
    pendingDoubtDoubterId,
    pendingDoubtPassedIds,
    hasUsedNormalActionThisTurn,
    hasPlayedRoleThisTurn,
    hasPlayedPlotThisTurn,
    isVetoed,
    vetoChain,
    pendingVetoPassedIds,
    rules,
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
      opening: s.opening,
      viewerId: s.viewerId,
      startGame: s.startGame,
      performAction: s.performAction,
      playPlotAction: s.playPlotAction,
      playInstant: s.playInstant,
      doubtAction: s.doubtAction,
      passDoubt: s.passDoubt,
      passVeto: s.passVeto,
      targetAcceptAttack: s.targetAcceptAttack,
      targetDoubtAttack: s.targetDoubtAttack,
      targetDeclareDuel: s.targetDeclareDuel,
      turnSubPhase: s.turnSubPhase,
      pendingDoubtDoubterId: s.pendingDoubtDoubterId,
      pendingDoubtPassedIds: s.pendingDoubtPassedIds,
      hasUsedNormalActionThisTurn: s.hasUsedNormalActionThisTurn,
      hasPlayedRoleThisTurn: s.hasPlayedRoleThisTurn,
      hasPlayedPlotThisTurn: s.hasPlayedPlotThisTurn,
      isVetoed: s.isVetoed,
      vetoChain: s.vetoChain,
      pendingVetoPassedIds: s.pendingVetoPassedIds,
      rules: s.rules,
      endTurnManually: s.endTurnManually,
      openConspiracyDialog: s.openConspiracyDialog
    }))
  );

  const [courtActionsOpen, setCourtActionsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [inspectedStack, setInspectedStack] = useState<InspectableItem[]>([]);
  const inspectedCard = inspectedStack.length > 0 ? inspectedStack[inspectedStack.length - 1] : null;

  const handleInspectCard = (card: InspectableItem | null) => {
    if (!card) {
      setInspectedStack([]);
    } else {
      setInspectedStack(prev => {
        if (prev.length === 0) return [card];
        if (prev[prev.length - 1] === card) return prev;
        return [...prev, card];
      });
    }
  };

  const handleBackInspect = () => {
    setInspectedStack(prev => prev.slice(0, -1));
  };

  const [pendingTarget, setPendingTarget] = useState<PendingTargetAction | null>(null);
  const [openMenuCardId, setOpenMenuCardId] = useState<CardId | null>(null);

  /* Карты, отмеченные к обмену. `null` — выбор не открыт, `[]` — открыт и
     пока пуст. Живёт здесь, а не в сторе: движок про черновик выбора ничего
     не знает и знать не должен, он получает готовое действие. */
  const [exchangePick, setExchangePick] = useState<CardId[] | null>(null);
  /* Идёт ли выбор карты под щит дуэли. Кнопка «Дуэль» только открывает выбор:
     объявляет дуэль уже нажатие на карту руки. */
  const [duelPick, setDuelPick] = useState(false);
  const [bluffCardId, setBluffCardId] = useState<CardId | null>(null);
  /* Взведён ли «Ва-банк». Состояние интерфейса, а не партии: пока карта не
     сыграна, в движке ничего не происходит. Снимается при каждом розыгрыше —
     оставленный взведённым, он молча удвоил бы следующий ход. */
  const [vaBanqueArmed, setVaBanqueArmed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');

  useEffect(() => {
    (window as unknown as { __startTargeting: (a: PendingTargetAction) => void }).__startTargeting =
      setPendingTarget;
    if (mode !== 'offline') return;
    startBotEngine();
    startGame(
      [{ id: 'p1', name: account.nickname, avatar: account.avatar, title: account.title }],
      offlineRules
    );
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

  /* Взведённый «Ва-банк» не переживает свой ход. Оставленный включённым, он
     молча удвоил бы следующий розыгрыш — а игрок про него уже забыл. */
  useEffect(() => {
    if (!isMyTurn) setVaBanqueArmed(false);
  }, [isMyTurn]);

  /* Which hand slot each held card owns. The engine keeps `hand` compact, so
     the array index is not a slot: `reconcileSlots` remembers instead, and a
     card that nobody touched keeps the slot it was dealt into. Kept in a ref
     because it is genuinely carried state, not derived — but the function is
     pure and idempotent, so reconciling inside the memo below (twice, under
     StrictMode) lands in the same place either way. */
  const slotBook = useRef<SlotBook>({});

  /* С каким лицом каждую карту показывали в последний раз. Сброс закрыт, и
     лицо карты в нём видно только в полёте: без этой памяти чужая карта,
     ушедшая в сброс невскрытой, переворачивалась по дороге и выдавала себя.
     Как и книга слотов — это несомая память, а не производное; `rememberFaces` чистая
     и идемпотентная, поэтому обновление внутри мемо безопасно. */
  const faceBook = useRef<FaceBook>({});

  /* Every card at the table, placed by state alone. Memoised on the exact
     slice placement depends on, so opening a modal does not hand `CardLayer`
     a fresh array and make it reconcile fifty nodes for nothing. */
  const placedCards = useMemo(
    () => {
      slotBook.current = reconcileSlots(slotBook.current, players);
      const placed = deriveCardZones(
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
        slotBook.current,
        faceBook.current
      );
      /* Записывается после раскладки, а не до: правило сброса обязано читать
         лицо, с которым карта уходила, а не то, которое ей только что дали. */
      faceBook.current = rememberFaces(faceBook.current, placed);
      return placed;
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
          opening,
          vetoChain,
          pendingVetoPassedIds,
          overlayInstant,
          vetoOnVeto: rules.vetoOnVeto,
          rules,
          vaBanqueArmed,
          coronationCandidateId,
          revealOutcome,
          duelOutcome,
          exchangePick,
          duelPick
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
      opening,
      vetoChain,
      pendingVetoPassedIds,
      overlayInstant,
      rules,
      vaBanqueArmed,
      coronationCandidateId,
      revealOutcome,
      duelOutcome,
      exchangePick,
      duelPick,
      human
    ]
  );

  /** Одна кнопка панели над картами — одно действие движка. */
  const runBarAction = (kind: BarActionKind) => {
    if (!human) return;
    switch (kind) {
      case 'exchange-confirm':
        confirmExchange();
        break;
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
        /* Та же пара фаз, что и у «Не верю»: под атакой «Верю» — это ответ
           жертвы, в общем окне — голос двора. Спрашивают об одном, и ответ
           засчитывается один раз. */
        if (view.phase === 'under-attack') targetAcceptAttack(human.id);
        else passDoubt(human.id);
        break;
      case 'duel':
        setDuelPick(true);
        setOpenMenuCardId(null);
        break;
      case 'veto-pass':
        passVeto(human.id);
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
    setExchangePick(null);
    setDuelPick(false);
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
    /* Выбранная под щит карта не открывает меню, а сразу выходит на дуэль:
       согласия нападающего не спрашивают, спор начинается этим нажатием. */
    if (duelPick && human) {
      setDuelPick(false);
      targetDeclareDuel(human.id, cardId);
      return;
    }

    /* Пока идёт выбор к обмену, карта — это флажок, а не меню: клик отмечает,
       повторный снимает отметку. Больше двух карт в руке не бывает, так что
       ограничивать число отмеченных нечем и незачем. */
    if (exchangePick) {
      setExchangePick(current =>
        (current ?? []).includes(cardId)
          ? (current ?? []).filter(id => id !== cardId)
          : [...(current ?? []), cardId]
      );
      return;
    }
    setOpenMenuCardId(current => (current === cardId ? null : cardId));
  };

  /** Сбросить отмеченное и тут же добрать столько же. */
  const confirmExchange = () => {
    const picked = exchangePick ?? [];
    if (!human || picked.length === 0) return;

    const named = picked
      .map(id => human.hand.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (named.length === 0) return;

    const list = named.map(c => `«${c.card}»`).join(', ');
    setExchangePick(null);
    setOpenMenuCardId(null);
    performAction({
      type: 'normal',
      name: named.length === 1 ? 'Сменить карту' : 'Сменить 2 карты',
      stakedCardId: named[0].id,
      stakedCardIds: named.map(c => c.id),
      actorId: human.id,
      costGold: 0,
      costTokens: 1,
      description:
        named.length === 1
          ? `Сбросил карту ${list} и взял новую.`
          : `Сбросил обе карты (${list}) и взял две новые.`
    });
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
        cost: info.cost,
        withVaBanque: vaBanqueArmed
      });
      setVaBanqueArmed(false);
      return;
    }
    performAction({
      type: 'role',
      name: card,
      roleClaim: card as Role,
      stakedCardId: cardId,
      actorId: human.id,
      withVaBanque: vaBanqueArmed,
      costGold: info.cost,
      costTokens: 1,
      description: info.fullDescription
    });
    setVaBanqueArmed(false);
  };

  const pickCardAction = (cardId: CardId, kind: CardMenuKind) => {
    if (!human) return;

    /* Переключатель, а не действие: меню остаётся открытым — игрок взводит
       «Ва-банк» и тут же выбирает, чем именно играть. */
    if (kind === 'vabanque') {
      setVaBanqueArmed(v => !v);
      return;
    }

    setOpenMenuCardId(null);

    /* Заряженный «Тайный заговор» лежит в слоте интриги, а не в руке: его
       карты в `hand` нет, и искать её там бессмысленно. */
    if (kind === 'conspiracy') {
      openConspiracyDialog(false);
      return;
    }

    const card = human.hand.find(held => held.id === cardId)?.card;
    if (!card) return;

    switch (kind) {
      case 'inspect':
        handleInspectCard(card);
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
      setInspectedStack([]);
      setPendingTarget(null);
      setDuelPick(false);
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

  /* Карта, у которой есть меню, — это карта, по которой можно нажать. Кроме
     руки такая ровно одна: заряженный «Тайный заговор» в своём слоте, и меню
     ему выдаёт `deriveTableView` только когда удар действительно возможен. */
  const hasMenu = (placed: PlacedCard) => !!view.menus[placed.id];
  const ownPlotMenuCardId =
    human.activePlot && view.menus[human.activePlot.cardId] ? human.activePlot.cardId : null;
  const armedVaBanqueCardId = human.hand.find(c => c.card === 'Ва-банк')?.id ?? null;
  const isOwnChargedPlot = (placed: PlacedCard) =>
    placed.zone.kind === 'plot' && placed.zone.playerId === human.id && hasMenu(placed);

  const cardInteraction: CardInteraction = {
    onActivate: handleCardClick,
    onInspect: handleInspectCard,
    claimFor: claimedRoleFor,
    isOwnHand: placed => isOwnHandCard(placed) || isOwnChargedPlot(placed),
    /* Взведённый «Ва-банк» поднимает свою карту, хотя нажимали на соседнюю:
       иначе единственный признак того, что ход пойдёт с удвоением, — точка на
       кнопке в меню, которое закроется сразу после выбора. */
    isSelected: placed =>
      openMenuCardId === placed.id ||
      !!exchangePick?.includes(placed.id) ||
      (vaBanqueArmed && placed.id === armedVaBanqueCardId),
    isPlayable: placed =>
      isOwnChargedPlot(placed) ||
      (isOwnHandCard(placed) && (isMyTurn || isTargetReaction || vetoReady(placed.face.known))),
    /* Полностью заряженный Заговор подрагивает: он ждёт своего хода, и это
       единственное, что на столе просит нажать на себя. */
    isRestless: isOwnChargedPlot
  };

  return (
    <InspectCardContext.Provider value={handleInspectCard}>
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
                onInspectCard={handleInspectCard}
              />
              <Arena
                pendingTargetAction={pendingTarget}
                onCancelTarget={() => setPendingTarget(null)}
                prompt={
                  duelPick
                    ? {
                        text: 'Выберите карту-щит для дуэли',
                        onCancel: () => setDuelPick(false)
                      }
                    : exchangePick
                      ? {
                          text: 'Выберите карты для смены',
                          onCancel: () => setExchangePick(null)
                        }
                      : null
                }
                onInspectCard={handleInspectCard}
              />

              {/* Внутри `.table` намеренно: стопки встают над панелью правого
                  соседа и держатся её опоры — правого края стола. */}
              <CardPiles />
            </div>

            <div className="hero">
              <PlayerCrest
                player={human}
                /* Пока идёт открытие, активного места нет: подсветка выдала бы
                   победителя жребия до самого броска. См. `SeatsRow`. */
                isActive={!opening && activePlayerId === human.id}
                onInspectCard={handleInspectCard}
              />

              <Hand
                player={human}
                slotBook={slotBook.current}
                openCardId={openMenuCardId}
                menus={view.menus}
                onPick={pickCardAction}
              />

              {/* Меню лежащего заряженного Заговора. Живёт здесь, а не в
                  `PlotSlot`: `CardMenu` рисуется порталом и берёт координаты из
                  реестра якорей по зоне, так что тащить пропсы сквозь герб
                  незачем. Меню есть только когда удар возможен — это решает
                  `deriveTableView`. */}
              {ownPlotMenuCardId && (
                <CardMenu
                  open={openMenuCardId === ownPlotMenuCardId}
                  zone={{ kind: 'plot', playerId: human.id }}
                  options={view.menus[ownPlotMenuCardId]}
                  onPick={kind => pickCardAction(ownPlotMenuCardId, kind)}
                />
              )}

              <div className="sidecol">
                <ActionBar
                  view={view}
                  onAct={runBarAction}
                  promptKey={`${view.phase}-${pendingAction?.id ?? ''}-${turnPhase}`}
                />
                <PhasePanel view={view} />
              </div>
            </div>

            <CardLayer cards={placedCards} />

            {/* Искры стычки. Сами себя порталят поверх карт и молчат, пока
                дуэльные карты не сойдутся. */}
            <DuelClash />
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
        onSelectCard={handleInspectCard}
      />

      {bluffCardId && (
        <BluffDialog
          stakedCardId={bluffCardId}
          armedVaBanque={vaBanqueArmed}
          onClose={() => {
            setBluffCardId(null);
            setVaBanqueArmed(false);
          }}
        />
      )}
      {courtActionsOpen && (
        <CourtActionsDialog
          onClose={() => setCourtActionsOpen(false)}
          onInspectCard={handleInspectCard}
          onStartExchange={() => {
            setOpenMenuCardId(null);
            setExchangePick([]);
          }}
        />
      )}

      {/* Стоит последней из диалогов: её открывают из «Действий двора», и при
          равном z-index кто ниже по разметке, тот и сверху. */}
      <CardDetailModal
        card={inspectedCard}
        canGoBack={inspectedStack.length > 1}
        onBack={handleBackInspect}
        onClose={() => setInspectedStack([])}
      />

      <Modals
        showRules={rulesOpen}
        onCloseRules={() => setRulesOpen(false)}
      />

      {/* Сам решает, что показывать: сбор двора, жребий, ничего (пока идёт
          раздача) или фанфару. Лежит порталом в body, так что место в разметке
          роли не играет. */}
      <OpeningSequence />

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
    </InspectCardContext.Provider>
  );
}
