import type { Action, GameRules, GameState, Player, RevealOutcome } from '../types';
import { isRole } from '../cards';
import { byId, pluck } from '../cardInstance';
import { accOf, verbCaught, verbDoubted } from '../utils/russianText';
import { botMemory } from '../Bot';
import { triggerResourceFloat } from '../utils/visualEffects';
import { timerManager } from '../utils/timerManager';
import { ACTION_HOLD_MS } from '../timing';
import { discardProtectiveIntrigueOnBluff } from './crownLoss';
import { chargeActiveConspiracies, landPlot, applyConspiracyEffect, applyMorningPlotReward, discardMorningPlot } from './plotResolver';
import { resolveInstantEffect } from './instantResolver';
import { beginCoronationIfNeeded } from './coronation';
import { vetoAnswerRequired, vetoPollAnswered, vetoTopActorId } from './vetoChain';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

/**
 * Чем игрок может оплатить проверку «НЕ ВЕРЮ!» — и может ли вообще.
 *
 * Жетон приоритетнее золота: он восполняется в начале хода, золото — нет.
 * Золотая оплата открывается двумя правилами. «Платная проверка» разрешает её
 * любому; «Срыв масок» — только жертве текущей атаки Вора или Шантажиста, то
 * есть ровно тому, кого бьют и кому нечем ответить. Правила
 * взаимоисключающие, это гарантирует `normalizeRules`.
 */
export function doubtPayment(
  rules: GameRules,
  doubter: Player,
  pendingAction: Action
): { tokens: number; gold: number } | null {
  if (doubter.actionTokens >= 1) return { tokens: 1, gold: 0 };

  if (rules.paidDoubtEnabled) {
    return doubter.gold >= rules.paidDoubtCost ? { tokens: 0, gold: rules.paidDoubtCost } : null;
  }

  if (rules.unmaskEnabled) {
    const isAttackVictim =
      pendingAction.targetId === doubter.id &&
      (pendingAction.roleClaim === 'Вор' || pendingAction.roleClaim === 'Шантажист');
    if (!isAttackVictim) return null;
    return doubter.gold >= rules.unmaskCost ? { tokens: 0, gold: rules.unmaskCost } : null;
  }

  return null;
}

/**
 * Опрошен ли двор целиком: ответили все, кроме самого заявившего.
 *
 * Живёт здесь, а не в `passDoubt`, потому что в опрос можно войти уже с
 * готовым ответом: «Верю» жертвы нападения засчитывается в тот же момент,
 * когда окно открывается (см. `targetAcceptAttack`).
 */
export function courtAnswered(
  players: Player[],
  actorId: string,
  passedIds: string[]
): boolean {
  return !players.some(p => p.id !== actorId && !passedIds.includes(p.id));
}

export function doubtAction(
  get: StateGetter,
  set: StateSetter,
  doubterId: string
): void {
  const {
    pendingAction,
    turnPhase,
    players,
    pendingDoubtDoubterId,
    pendingDoubtPassedIds,
    pendingDoubtActionId
  } = get();
  if ((turnPhase !== 'DOUBT_WINDOW' && turnPhase !== 'TARGET_REACTION_WINDOW') || !pendingAction || !pendingAction.roleClaim) return;

  /* Сказавший «Верю» ответ уже дал: переиграть его на «Не верю» нельзя.
     Иначе жертва, поверившая нападению, добирала бы себе вторую попытку в том
     же окне — ровно та лишняя фаза, которой здесь больше нет.

     Но именно в ЭТОМ опросе: список принадлежит своей заявке, и ответ, данный
     по прошлому действию, запрещать ничего не должен. Без этой сверки жертва
     не могла проверить нападающего, если минуту назад сказала «Верю» кому-то
     другому — и не могла понять, почему кнопка не работает. */
  if (pendingDoubtActionId === pendingAction.id && pendingDoubtPassedIds.includes(doubterId)) {
    return;
  }

  /* Проверяет тот, кто успел первым. Второй «Не верю» поверх заявленного
     снял бы отложенное вскрытие (`clearAll` ниже) и списал бы ещё один жетон
     за проверку, которой не будет. */
  if (pendingDoubtDoubterId) return;
  timerManager.clearAll();

  const actor = players.find(p => p.id === pendingAction.actorId);
  const doubter = players.find(p => p.id === doubterId);
  if (!actor || !doubter) return;

  /* Чем платят за проверку.
   *
   * Жетон — всегда первый выбор: он восполнится в начале хода, а золото нет.
   * Золото включается только когда жетона нет и правила это разрешают. Выбор
   * не предлагается игроку: диалог «чем платите?» — это лишний клик в каждом
   * споре и лишняя ветка в ботах, а выигрыша в решениях он не даёт. */
  const payment = doubtPayment(get().rules, doubter, pendingAction);
  if (!payment) return;

  let newPlayers = players.map(p =>
    p.id === doubter.id
      ? {
          ...p,
          actionTokens: p.actionTokens - payment.tokens,
          gold: p.gold - payment.gold
        }
      : p
  );
  triggerResourceFloat(
    set,
    doubter.id,
    payment.tokens > 0 ? '-1 ⚡' : `-${payment.gold} 🪙 проверка`,
    false
  );

  // Informant Network trigger: all OTHER holders (not the doubter) receive +1 🪙 for checks by other players!
  const informantHolders = newPlayers.filter(p => p.activePlot?.type === 'Сеть информаторов' && p.id !== doubter.id);
  if (informantHolders.length > 0) {
    newPlayers = newPlayers.map(p => (p.activePlot?.type === 'Сеть информаторов' && p.id !== doubter.id) ? { ...p, gold: p.gold + 1 } : p);
    informantHolders.forEach(p => {
      triggerResourceFloat(set, p.id, '+1 🪙 Информаторы', true);
    });
  }

  const informantLogs = informantHolders.map(p => `👁️ «Сеть информаторов» приносит +1 🪙 для ${p.name} за проверку при дворе от ${doubter.name}!`);

  set(state => ({
    players: newPlayers,
    pendingDoubtDoubterId: doubter.id,
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [doubter.id]: '«Не верю! Проверяю!»'
    },
    history: [
      ...informantLogs,
      `⚡ ${doubter.name} сомневается в «${pendingAction.roleClaim}» от ${actor.name} и кричит: «НЕ ВЕРЮ!» (потрачен 1 ⚡).`,
      ...state.history
    ].slice(0, 50)
  }));

  // Charge active conspiracies
  chargeActiveConspiracies(get, set, `проверку от ${doubter.name}`);

  timerManager.scheduleDelay(() => {
    get()._executeRevealOutcome(doubter.id);
  }, ACTION_HOLD_MS);
}

export function passDoubt(
  get: StateGetter,
  set: StateSetter,
  playerId: string
): void {
  const {
    turnPhase,
    pendingAction,
    players,
    pendingDoubtPassedIds,
    pendingDoubtDoubterId
  } = get();
  if (turnPhase !== 'DOUBT_WINDOW' || !pendingAction || !pendingAction.roleClaim) return;

  /*
   * Окно сомнения одноразовое: заявленную проверку «Верю» уже не отменяет.
   *
   * Без этой проверки поздний клик снимал отложенное вскрытие своим
   * `clearAll()` и уводил действие по ветке «двор не оспорил». Проверка при
   * этом уже состоялась — жетон потрачен, заговоры заряжены, — а
   * `pendingDoubtDoubterId` гасится ровно в одном месте, во вскрытии,
   * которого после этого не будет. Флаг оставался поднятым навсегда: боты
   * переставали и сомневаться, и пропускать, правая колонка застревала на
   * виде `reveal`, и партия вставала намертво.
   */
  if (pendingDoubtDoubterId) return;
  timerManager.clearAll();

  const actor = players.find(p => p.id === pendingAction.actorId);
  if (!actor) return;

  /* Заявивший в опросе не участвует: сомневаются в НЁМ. Раньше его «Верю»
     проходило и служило кнопкой «продолжить», из-за чего опрос двора мог
     закрыться, не спросив никого. */
  if (playerId === actor.id) return;

  const passer = players.find(p => p.id === playerId);
  if (!passer || pendingDoubtPassedIds.includes(playerId)) return;

  const passedIds = [...pendingDoubtPassedIds, playerId];
  set(state => ({
    pendingDoubtPassedIds: passedIds,
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [passer.id]: '«Верю»'
    }
  }));

  /*
   * Двор считается опрошенным, когда ответил КАЖДЫЙ, кроме заявившего, —
   * и боты в том числе: они отвечают своими таймерами (см.
   * `bot/botReactions.handleDoubtPhase`).
   *
   * Раньше ждали только живых, а ботов переспрашивали здесь же, синхронно,
   * уже после чужого клика — и тогда бот мог усомниться «задним числом»,
   * не сказав до этого ничего. Одно решение принималось в двух местах, и в
   * обоих бот молчал, если верил.
   */
  if (!courtAnswered(players, actor.id, passedIds)) return;

  get()._proceedAfterDoubtPassed(pendingAction);
}

export function executeRevealOutcome(
  get: StateGetter,
  set: StateSetter,
  doubterId: string
): void {
  timerManager.clearAll();
  const { pendingAction, players, isVaBanqueActive } = get();
  if (!pendingAction || !pendingAction.roleClaim) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  const doubter = players.find(p => p.id === doubterId);
  if (!actor || !doubter) return;

  const claimedRole = pendingAction.roleClaim;
  const staked = byId(actor.hand, pendingAction.stakedCardId) ?? actor.hand[0];
  const revealedRole = staked?.card ?? 'Наследник';
  const wasTruth = revealedRole === claimedRole;

  const newPlayers = [...players];
  const actorIdx = newPlayers.findIndex(p => p.id === actor.id);
  const doubterIdx = newPlayers.findIndex(p => p.id === doubter.id);

  let jesterBonus = false;
  let blackBookApplied = false;
  let sealsWinnerId: string | undefined = undefined;
  let sealsCount = 0;
  let dossierBonusPlayerId: string | undefined = undefined;
  const doubterPlot = doubter.activePlot;
  const crownsToWin = get().rules.crownsToWin;

  if (wasTruth) {
    // Failed check: Black Book is discarded without reward
    if (doubterPlot && doubterPlot.type === 'Чёрная книга') {
      newPlayers[doubterIdx] = { ...newPlayers[doubterIdx], activePlot: null };
      set(state => ({ discardPile: [...state.discardPile, { id: doubterPlot.cardId, card: 'Чёрная книга' as const }] }));
    }

    if (claimedRole === 'Шут') {
      if (actor.favor < crownsToWin) {
        const nextFavor = Math.min(crownsToWin, actor.favor + 1);
        const gained = nextFavor - actor.favor;
        newPlayers[actorIdx] = { ...actor, favor: nextFavor };
        jesterBonus = true;
        triggerResourceFloat(set, actor.id, `+${gained} 👑`, true);
      }

      if (newPlayers[actorIdx].favor >= crownsToWin) {
        beginCoronationIfNeeded(get, set, actor.id);
      }
    } else {
      // Under Va-banque, truth does NOT grant seals to actor (0 seals, only x2 role effect)
      if (!isVaBanqueActive) {
        sealsWinnerId = actor.id;
        sealsCount = 1;
      }
    }
  } else {
    // Caught bluffing!
    // Check Black Book (Чёрная книга) for doubter: grants +1 👑 directly, NO seals!
    if (doubterPlot && doubterPlot.type === 'Чёрная книга') {
      blackBookApplied = true;
      if (doubter.favor < crownsToWin) {
        const nextFavor = Math.min(crownsToWin, doubter.favor + 1);
        const gained = nextFavor - doubter.favor;
        newPlayers[doubterIdx] = {
          ...newPlayers[doubterIdx],
          favor: nextFavor,
          activePlot: null
        };
        triggerResourceFloat(set, doubter.id, `+${gained} 👑 Чёрная книга!`, true);
      } else {
        newPlayers[doubterIdx] = {
          ...newPlayers[doubterIdx],
          activePlot: null
        };
      }
      set(state => ({ discardPile: [...state.discardPile, { id: doubterPlot.cardId, card: 'Чёрная книга' as const }] }));

      if (newPlayers[doubterIdx].favor >= crownsToWin) {
        beginCoronationIfNeeded(get, set, doubter.id);
      }
    } else {
      // Normal doubt / Va-banque doubt: awards seals
      sealsWinnerId = doubter.id;
      sealsCount = isVaBanqueActive ? 2 : 1;
    }

    // Check Dossier (Досье) on the accused actor: awards +1 👑 directly!
    const dossierOwner = newPlayers.find(p => p.activePlot?.type === 'Досье' && p.activePlot.targetPlayerId === actor.id);
    if (dossierOwner) {
      const dossierCardId = dossierOwner.activePlot!.cardId;
      dossierBonusPlayerId = dossierOwner.id;
      const dIdx = newPlayers.findIndex(p => p.id === dossierOwner.id);
      const dNextFavor = Math.min(crownsToWin, dossierOwner.favor + 1);
      const dGained = dNextFavor - dossierOwner.favor;
      newPlayers[dIdx] = {
        ...newPlayers[dIdx],
        favor: dNextFavor,
        activePlot: null
      };
      triggerResourceFloat(set, dossierOwner.id, `+${dGained} 👑 Досье!`, true);
      set(state => ({ discardPile: [...state.discardPile, { id: dossierCardId, card: 'Досье' as const }] }));

      if (newPlayers[dIdx].favor >= crownsToWin) {
        beginCoronationIfNeeded(get, set, dossierOwner.id);
      }
    }
  }

  // Remove the revealed card from hand to discard — addressed by id, so the
  // card that leaves is exactly the one that was staked and the neighbour in
  // hand is never touched.
  const { rest: actorHand } = staked
    ? pluck(actor.hand, staked.id)
    : { rest: [...actor.hand] };
  newPlayers[actorIdx] = { ...newPlayers[actorIdx], hand: actorHand };
  const newDiscard = staked ? [...get().discardPile, staked] : [...get().discardPile];

  if (isRole(revealedRole)) botMemory.recordRevealedCard(actor.id, revealedRole);

  const vaBanqueNotice = isVaBanqueActive ? ' 🎲 (Сыгран ВА-БАНК!)' : '';
  const blackBookNotice = (doubterPlot?.type === 'Чёрная книга' && !wasTruth) ? ' 📕 (Сработала Чёрная книга!)' : '';
  const dossierNotice = dossierBonusPlayerId ? ` 📜 (Досье принесло +1 👑 для ${players.find(p => p.id === dossierBonusPlayerId)?.name}!)` : '';

  const actorAcc = accOf(actor);
  const doubterDoubted = verbDoubted(doubter.name);
  const doubterCaught = verbCaught(doubter.name);

  let message = '';
  if (wasTruth) {
    if (claimedRole === 'Шут') {
      if (isVaBanqueActive) {
        message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «Шут»! Ловушка под Ва-банком: ${actor.name} получает +4 🪙 и +1 👑 (печати отменены)!${vaBanqueNotice}`;
      } else {
        message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «Шут»! Ловушка сработала: ${actor.name} получает +1 👑!`;
      }
    } else {
      if (isVaBanqueActive) {
        message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «${claimedRole}»! Эффект роли удваивается (печати отменены)!${vaBanqueNotice}`;
      } else {
        message = `${doubter.name} ${doubterDoubted} в ${actorAcc}, но на кону действительно «${claimedRole}»! ${actor.name} получает +1 ⚜️, и действие исполняется!`;
      }
    }
  } else {
    if (blackBookApplied) {
      message = `${doubter.name} ${doubterCaught} ${actorAcc} на лжи! На кону была карта «${revealedRole}» вместо «${claimedRole}». Сработала «Чёрная книга»: ${doubter.name} получает +1 👑 напрямую (без печатей)!${vaBanqueNotice}${dossierNotice}`;
    } else {
      message = `${doubter.name} ${doubterCaught} ${actorAcc} на лжи! На кону была карта «${revealedRole}» вместо «${claimedRole}». ${doubter.name} получает +${sealsCount} ⚜️, а действие отменяется.${vaBanqueNotice}${blackBookNotice}${dossierNotice}`;
    }
  }

  const outcome: RevealOutcome = {
    accuserId: doubter.id,
    accusedId: actor.id,
    claimedRole,
    wasTruth,
    revealedRole,
    sealsWinnerId,
    actionExecuted: wasTruth && (claimedRole !== 'Шут' || isVaBanqueActive),
    jesterBonus,
    vaBanqueBonus: isVaBanqueActive,
    dossierBonusPlayerId,
    message
  };

  set(state => ({
    players: newPlayers,
    discardPile: newDiscard,
    revealOutcome: outcome,
    turnPhase: 'REVEAL_OUTCOME',
    pendingDoubtDoubterId: null,
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [actor.id]: wasTruth ? (claimedRole === 'Шут' ? '«Ха-ха! Попались на Шута!»' : '«Вот моя карта! Чистая правда!»') : '«Увы... раскрыли блеф!»'
    },
    history: [outcome.message, ...state.history].slice(0, 50)
  }));

  /* Защита рушится вместе с репутацией: пойманного на лжи «Стража покоев» и
     «Охранная грамота» больше не прикрывают. Сжигается после `set` выше,
     потому что читает и пишет уже применённое состояние, и до наград —
     иначе `addSealsToPlayer` прочитал бы сгоревшую грамоту как живую. */
  if (!wasTruth) {
    discardProtectiveIntrigueOnBluff(get, set, actor.id);
  }

  if (sealsWinnerId && sealsCount > 0) {
    get().addSealsToPlayer(sealsWinnerId, sealsCount);
  }

  timerManager.scheduleDelay(() => {
    get().closeRevealOutcome();
  }, 2800);
}

export function closeRevealOutcome(
  get: StateGetter,
  set: StateSetter
): void {
  const { revealOutcome, pendingAction } = get();
  if (!revealOutcome) return;

  const goesToVeto =
    revealOutcome.wasTruth &&
    (revealOutcome.claimedRole !== 'Шут' || revealOutcome.vaBanqueBonus) &&
    !!pendingAction;

  if (goesToVeto) {
    set({
      revealOutcome: null,
      isPendingActionAfterTruthChallenge: true
    });
    get()._triggerVetoWindowOrResolveEffect(pendingAction, true);
    return;
  }

  set({ revealOutcome: null });
  timerManager.scheduleDelay(() => {
    get()._checkEndgameAndAdvanceTurn();
  }, 800);
}

export function proceedAfterDoubtPassed(
  get: StateGetter,
  set: StateSetter,
  action: Action
): void {
  timerManager.clearAll();

  set(state => ({
    history: [`🂠 Действие «${action.roleClaim}» от ${state.players.find(p => p.id === action.actorId)?.name || 'игрока'} не оспорено двором (карта остаётся в руке).`, ...state.history].slice(0, 50)
  }));

  get()._triggerVetoWindowOrResolveEffect(action, false);
}

export function triggerVetoWindowOrResolveEffect(
  get: StateGetter,
  set: StateSetter,
  action: Action,
  isAfterTruthChallenge = false
): void {
  timerManager.clearAll();
  const { isVetoed, rules } = get();

  if (action.cannotBeVetoed) {
    get()._resolvePendingActionEffect(action, isAfterTruthChallenge);
    return;
  }

  /* Вето, сыгранное ещё до окна (в окне реакции жертвы), обычно закрывает
     вопрос сразу. Но при правиле «вето на вето» двор должен успеть ответить и
     на него — поэтому окно всё равно открывается, а решает уже чётность
     цепочки. */
  if (isVetoed && !rules.vetoOnVeto) {
    set(state => ({
      overlayInstant: null,
      history: [`🚫 Действие «${action.roleClaim || action.name}» отменено Правом вето!`, ...state.history].slice(0, 50)
    }));
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
    return;
  }

  /*
   * Окно открывается на каждое ветируемое действие, независимо от того,
   * держит ли кто-то «Право вето» и держит ли вообще: длина паузы, зависящая
   * от рук, читалась бы как подсказка о них.
   *
   * Держится оно ответами, а не часами. Раньше здесь висел таймер на пять
   * секунд — самая дорогая пауза партии, при том что за ней почти всегда
   * стояло одно и то же «никто не вмешался», а игрок, решивший вмешаться, мог
   * банально не успеть. Теперь это опрос, как и окно сомнения: каждый либо
   * кладёт вето, либо жмёт «Пропустить», и ход идёт дальше, когда ответили
   * все. Отвалившийся онлайн-игрок опрос не держит — его место перехватывает
   * бот и отвечает сам.
   */
  set({
    turnPhase: 'VETO_WINDOW',
    pendingVetoPassedIds: [],
    pendingVetoActionId: action.id,
    timerSeconds: 0,
    timerMaxSeconds: 0,
    isPendingActionAfterTruthChallenge: isAfterTruthChallenge
  });

  /* Спрашивать может быть некого: за столом двое, и единственный отвечающий —
     тот, чья карта сейчас наверху, а его не спрашивают. */
  const { players, overlayInstant } = get();
  if (vetoPollAnswered(players, vetoTopActorId(action.actorId, overlayInstant), [])) {
    proceedAfterVetoWindow(get, set);
  }
}

/**
 * «Пропустить» в окне вето — ответ за себя, а не за стол.
 *
 * Зеркало `passDoubt`: чужие ответы не отменяются и не подразумеваются, и
 * окно закрывается ровно тогда, когда ответил каждый, кого спрашивали.
 */
export function passVeto(
  get: StateGetter,
  set: StateSetter,
  playerId: string
): void {
  const { turnPhase, pendingAction, players, pendingVetoPassedIds, overlayInstant } = get();
  if (turnPhase !== 'VETO_WINDOW' || !pendingAction) return;

  const passer = players.find(p => p.id === playerId);
  if (!passer || pendingVetoPassedIds.includes(playerId)) return;

  /* Того, чья карта наверху, не спрашивают — и засчитывать его «Пропустить»
     нельзя: иначе один клик закрыл бы окно за весь двор. */
  const topActorId = vetoTopActorId(pendingAction.actorId, overlayInstant);
  if (!vetoAnswerRequired(playerId, topActorId)) return;

  const passedIds = [...pendingVetoPassedIds, playerId];
  set(state => ({
    pendingVetoPassedIds: passedIds,
    activeSpeechReactions: {
      ...state.activeSpeechReactions,
      [playerId]: '«Не накладываю Вето»'
    }
  }));

  if (!vetoPollAnswered(players, topActorId, passedIds)) return;

  proceedAfterVetoWindow(get, set);
}

export function resolvePendingActionEffect(
  get: StateGetter,
  set: StateSetter,
  action: Action,
  isAfterTruthChallenge = false
): void {
  if (action.isMorningTrigger) {
    applyMorningPlotReward(get, set, action);
    return;
  }
  if (action.conspiracyEffect) {
    applyConspiracyEffect(get, set, action);
    return;
  }
  if (action.type === 'instant') {
    resolveInstantEffect(get, set, action);
    return;
  }
  if (action.type === 'plot') {
    landPlot(get, set, action);
    return;
  }
  get()._resolveRoleActionEffect(action, isAfterTruthChallenge);
}

export function proceedAfterVetoWindow(
  get: StateGetter,
  set: StateSetter
): void {
  timerManager.clearAll();
  const { turnPhase, pendingAction, isVetoed, isPendingActionAfterTruthChallenge } = get();
  if (!pendingAction) {
    get()._checkEndgameAndAdvanceTurn();
    return;
  }

  // The veto window is single-entry. `turnPhase` is the window itself, so it
  // is consumed synchronously here — before the effect lands and before the
  // ACTION_HOLD_MS hold that follows it. Otherwise the phase stayed
  // 'VETO_WINDOW' for that whole hold and a bot's veto timer (which only
  // checks `turnPhase === 'VETO_WINDOW' && !isVetoed`) could still fire after
  // everyone had already passed: it spent a «Право вето» for nothing and
  // re-entered here, pushing an already-landed plot card into the discard
  // while its instance also sat in the plot slot.
  if (turnPhase !== 'VETO_WINDOW') return;
  set({ turnPhase: 'IDLE' });

  if (isVetoed) {
    set(state => ({
      overlayInstant: null,
      history: [`🚫 Действие «${pendingAction.roleClaim || pendingAction.name}» отменено Правом вето!`, ...state.history].slice(0, 50)
    }));
    if (pendingAction.isMorningTrigger) {
      discardMorningPlot(get, set, pendingAction.actorId);
      return;
    }
    if (pendingAction.type === 'plot' && !pendingAction.conspiracyEffect && pendingAction.plotType && pendingAction.stakedCardId) {
      set(state => ({
        discardPile: [...state.discardPile, { id: pendingAction.stakedCardId!, card: pendingAction.plotType! }]
      }));
    }
    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
    return;
  }

  get()._resolvePendingActionEffect(pendingAction, isPendingActionAfterTruthChallenge ?? false);
}
