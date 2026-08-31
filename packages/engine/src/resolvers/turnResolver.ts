import type { Action, GameState, Player } from '../types';
import { drawCardsFromDeck, HAND_SIZE } from '../cards';
import { holds } from '../cardInstance';
import { timerManager } from '../utils/timerManager';
import { plotSpent, resolveMorningPlots } from './plotResolver';
import {
  beginCoronationIfNeeded,
  isCoronationCandidate,
  resolveCoronationsAtTurnStart
} from './coronation';
import { vetoReset } from './vetoChain';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

function applyCoronationTurnStart(
  get: StateGetter,
  set: StateSetter,
  nextPlayerId: string,
  players: Player[],
  extra: Partial<GameState>
): boolean {
  const { coronations, rules } = get();
  const { verdict, rest } = resolveCoronationsAtTurnStart(
    nextPlayerId,
    players,
    coronations,
    rules.crownsToWin
  );
  switch (verdict.kind) {
    case 'win':
      set(state => ({
        ...extra,
        winnerId: verdict.winnerId,
        turnPhase: 'GAME_OVER',
        history: [
          `👑 КОРОНАЦИЯ СОСТОЯЛАСЬ! ${verdict.winnerName} удержал(а) ${verdict.favor} 👑 целый круг и становится полноправным Королём Kinglier!`,
          ...state.history
        ].slice(0, 50)
      }));
      return true;
    case 'abort':
      /* Снимаются только закрывшиеся круги. Чужие идут дальше: они привязаны
         к своим зачинателям, и до их срока ещё далеко. */
      set({ coronations: rest });
      return false;
    case 'continue':
      return false;
    default: {
      const _exhaustive: never = verdict;
      return _exhaustive;
    }
  }
}

export function checkEndgameAndAdvanceTurn(
  get: StateGetter,
  set: StateSetter
): void {
  const { players, coronations, activePlayerId, hasPlayedRoleThisTurn, hasPlayedPlotThisTurn } = get();
  const actor = players.find(p => p.id === activePlayerId);

  /* Круг заводится каждому, кто стоит на пороге и ещё без круга: их может быть
     несколько разом, и обойтись первым найденным значит оставить остальных
     удерживать победные короны без надежды на победу. */
  for (const favorite of players.filter(p => p.favor >= get().rules.crownsToWin)) {
    if (!isCoronationCandidate(coronations, favorite.id)) {
      beginCoronationIfNeeded(get, set, favorite.id);
    }
  }

  /*
   * Ход человека не заканчивается сам.
   *
   * Раньше он заканчивался: истратил последний жетон — и стол, не спрашивая,
   * передавал ход дальше. Между действием и чужим ходом не оставалось ни кадра,
   * чтобы посмотреть, чем всё кончилось, а «Завершить ход» была кнопкой, которую
   * игра нажимала за игрока чаще, чем он сам. Теперь стол возвращается в IDLE
   * и ждёт: передать ход — это решение, и принимает его игрок.
   *
   * Бот — другое дело: его «решение» это тот же расчёт, и лишняя пауза на него
   * ничего не добавляет, а к каждому ходу двора прибавляет секунду ожидания.
   * Исчерпав ход, он завершает его сам.
   */
  const spent =
    !actor ||
    actor.actionTokens <= 0 ||
    (hasPlayedRoleThisTurn && hasPlayedPlotThisTurn && actor.hand.length === 0);

  if (!actor || (actor.isBot && spent)) {
    get().endTurn();
    return;
  }

  // Return to IDLE in Phase 3 so active player can take a 2nd action or finish turn
  set({
    turnPhase: 'IDLE',
    turnSubPhase: 'CARD_PLAY_PHASE',
    pendingAction: null,
    overlayInstant: null,
    isVaBanqueActive: false,
    ...vetoReset(),
    isPendingActionAfterTruthChallenge: false,
    /* Вспышки к этому моменту давно доиграны: сюда приходят через
       `ACTION_HOLD_MS`, а удар на карте длится доли секунды. */
    plotPulses: []
  });
}

export function endTurn(
  get: StateGetter,
  set: StateSetter
): void {
  timerManager.clearAll();
  const { players, activePlayerId, deck, discardPile } = get();

  // 1. Refill any players who have < 2 cards in hand (deferred card draw)
  let curDeck = deck;
  let curDiscard = discardPile;
  const refilledPlayers = players.map(p => {
    if (p.hand.length < HAND_SIZE) {
      const needed = HAND_SIZE - p.hand.length;
      const { drawn, deck: newD, discardPile: newDisc } = drawCardsFromDeck(needed, curDeck, curDiscard);
      curDeck = newD;
      curDiscard = newDisc;
      return { ...p, hand: [...p.hand, ...drawn] };
    }
    return p;
  });

  const currentIndex = refilledPlayers.findIndex(p => p.id === activePlayerId);
  const nextIndex = (currentIndex + 1) % refilledPlayers.length;
  const nextPlayer = refilledPlayers[nextIndex];

  // 2. Восполнение жетонов в начале хода — до значения из правил партии.
  const updatedPlayers = refilledPlayers.map(p => {
    if (p.id === nextPlayer.id) {
      return { ...p, actionTokens: get().rules.actionTokens };
    }
    return p;
  });

  const boardPatch = {
    players: updatedPlayers,
    deck: curDeck,
    discardPile: curDiscard
  };

  // Win is checked at the start of the origin player's next turn, before morning plots.
  if (applyCoronationTurnStart(get, set, nextPlayer.id, updatedPlayers, boardPatch)) {
    return;
  }

  // 3. Phase 1 Morning Triggers
  const nextFromUpdated = updatedPlayers[nextIndex];
  const morningType = nextFromUpdated.activePlot?.type;
  const morningNeedsVeto =
    morningType === 'Королевский приём' &&
    updatedPlayers.some(p => p.id !== nextFromUpdated.id && holds(p.hand, 'Право вето'));

  if (morningNeedsVeto && morningType) {
    const morningAction: Action = {
      id: Math.random().toString(36).slice(2, 9),
      type: 'plot',
      name: morningType,
      plotType: morningType,
      actorId: nextPlayer.id,
      costGold: 0,
      costTokens: 0,
      isMorningTrigger: true,
      description: ''
    };

    set({
      players: updatedPlayers,
      deck: curDeck,
      discardPile: curDiscard,
      activePlayerId: nextPlayer.id,
      turnPhase: 'IDLE',
      turnSubPhase: 'NORMAL_ACTION_PHASE',
      hasUsedNormalActionThisTurn: false,
      hasPlayedRoleThisTurn: false,
      hasPlayedPlotThisTurn: false,
      pendingAction: morningAction,
      overlayInstant: null,
      isVaBanqueActive: false,
      ...vetoReset(),
      isPendingActionAfterTruthChallenge: false,
      pendingDuelDefenderCardId: null,
      pendingDuelDefenderRoleClaim: null,
      duelOutcome: null,
      activeSpeechReactions: {},
      timerSeconds: 0,
      revealOutcome: null,
      informantPeekData: null,
      plotPulses: []
    });
    get()._triggerVetoWindowOrResolveEffect(morningAction, false);
    return;
  }

  const {
    updatedPlayers: morningPlayers,
    curDiscard: morningDiscard,
    coronationTriggeredByReception,
    nextPlayerUpdated,
    spentPlotId: morningSpent
  } = resolveMorningPlots(
    updatedPlayers,
    nextIndex,
    curDiscard,
    get().coronations,
    set,
    get().rules.crownsToWin
  );

  set({
    players: morningPlayers,
    deck: curDeck,
    discardPile: morningDiscard,
    activePlayerId: nextPlayer.id,
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE',
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
    pendingAction: null,
    overlayInstant: null,
    isVaBanqueActive: false,
    ...vetoReset(),
    isPendingActionAfterTruthChallenge: false,
    pendingDuelDefenderCardId: null,
    pendingDuelDefenderRoleClaim: null,
    duelOutcome: null,
    activeSpeechReactions: {},
    timerSeconds: 0,
    revealOutcome: null,
    informantPeekData: null,
    /* Утренний «Приём» срабатывает уже на новом ходу, поэтому список не
       гасится, а перезаписывается его картой: общий сброс здесь затёр бы
       само событие. */
    ...(morningSpent ? plotSpent(morningSpent) : { plotPulses: [] })
  });

  if (coronationTriggeredByReception) {
    beginCoronationIfNeeded(get, set, nextPlayerUpdated.id, nextPlayer.id);
  }
}
