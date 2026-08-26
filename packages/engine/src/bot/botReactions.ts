import { useGameStore } from '../GameStore';
import type { GameState, Role } from '../types';
import { getBotArchetype } from '../botsConfig';
import { evaluateBotDoubt } from './botEvaluator';
import { selectBestRedirectionTarget } from './botTargeting';
import { faces, holds } from '../cardInstance';
import {
  ACTION_HOLD_MS,
  BOT_REACTION_MS,
  BOT_REACTION_JITTER_MS,
  BOT_VETO_MS,
  BOT_VETO_JITTER_MS
} from '../timing';

export type BotScheduler = (timerKey: string, callback: () => void, delayMs: number) => void;

/**
 * Реакция ботов в окне сомнения («НЕ ВЕРЮ!»).
 */
export function handleDoubtPhase(state: GameState, schedule: BotScheduler): void {
  const { pendingAction, players, discardPile, coronationCandidateId } = state;
  if (!pendingAction || !pendingAction.roleClaim) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  if (!actor) return;

  const observingBots = players.filter(
    p => p.isBot && p.id !== pendingAction.actorId && p.actionTokens >= 1
  );

  let botWillDoubt = false;

  for (const bot of observingBots) {
    const decision = evaluateBotDoubt(
      bot,
      actor,
      pendingAction.roleClaim,
      false,
      coronationCandidateId,
      pendingAction.targetId,
      discardPile,
      players
    );

    if (decision.shouldDoubt) {
      botWillDoubt = true;
      const delay = BOT_REACTION_MS + Math.random() * BOT_REACTION_JITTER_MS;
      schedule('doubt', () => {
        const curState = useGameStore.getState();
        if (curState.turnPhase === 'DOUBT_WINDOW' && !curState.pendingDoubtDoubterId) {
          curState.doubtAction(bot.id);
        }
      }, delay);
      break;
    }
  }

  // Auto-proceed only when every other seat is a bot (offline: the sole
  // human just claimed something and all bots passed, so nobody is left to
  // click "Верю"). With a second real human observer online, they must get
  // to explicitly pass/doubt via the UI — auto-continuing here used to race
  // ahead of their click, resolving the claim before they could react.
  const hasOtherHumanObserver = players.some(p => !p.isBot && p.id !== pendingAction.actorId);
  if (!botWillDoubt && !hasOtherHumanObserver) {
    schedule('doubt', () => {
      const curState = useGameStore.getState();
      if (curState.turnPhase === 'DOUBT_WINDOW' && !curState.pendingDoubtDoubterId && curState.pendingAction) {
        curState._proceedAfterDoubtPassed(curState.pendingAction);
      }
    }, ACTION_HOLD_MS);
  }
}

/**
 * Реакция бота-цели атаки (Принять / Сомневаться / Дуэль / Перенаправление).
 */
export function handleTargetReactionPhase(state: GameState, schedule: BotScheduler): void {
  const { pendingAction, discardPile, players } = state;
  if (!pendingAction || !pendingAction.targetId) return;

  const target = players.find(p => p.id === pendingAction.targetId);
  const attacker = players.find(p => p.id === pendingAction.actorId);
  if (!target || !target.isBot || !attacker) return;

  // 1. Возможность сыграть инстант ⚡ «Перенаправление» (0 ⚡)
  const redirectIdx = faces(target.hand).indexOf('Перенаправление');
  if (redirectIdx !== -1 && Math.random() < 0.70) {
    const otherOpponents = players.filter(p => p.id !== attacker.id && p.id !== target.id);
    const newTarget = selectBestRedirectionTarget(attacker, target, otherOpponents, pendingAction.roleClaim);
    if (newTarget) {
      schedule('target_block', () => {
        const curState = useGameStore.getState();
        if (curState.turnPhase === 'TARGET_REACTION_WINDOW') {
          curState.playInstant(target.id, 'Перенаправление', redirectIdx, newTarget.id);
        }
      }, ACTION_HOLD_MS);
      return;
    }
  }

  const blockingRole: Role = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
  const hasCard = holds(target.hand, blockingRole);
  const archetype = getBotArchetype(target.id);
  const cardIndex = hasCard ? faces(target.hand).indexOf(blockingRole) : 0;

  const doubtEval = evaluateBotDoubt(
    target,
    attacker,
    pendingAction.roleClaim!,
    false,
    null,
    pendingAction.targetId,
    discardPile,
    players
  );

  let chosenAction: 'accept' | 'doubt' | 'duel' = 'accept';

  if (hasCard) {
    if (doubtEval.shouldDoubt && doubtEval.score >= 0.98 && target.actionTokens >= 1) {
      chosenAction = 'doubt';
    } else if (target.actionTokens >= 1) {
      chosenAction = 'duel';
    }
  } else {
    if (doubtEval.shouldDoubt && doubtEval.score >= 0.98 && target.actionTokens >= 1) {
      chosenAction = 'doubt';
    } else {
      let fakeDuelChance = 0.25 * archetype.blockBluffRate;
      if (pendingAction.roleClaim === 'Шантажист' && target.favor >= 4) {
        fakeDuelChance = 0.65;
      }

      if (target.actionTokens >= 1 && Math.random() < fakeDuelChance) {
        chosenAction = 'duel';
      } else {
        chosenAction = 'accept';
      }
    }
  }

  schedule('target_block', () => {
    const curState = useGameStore.getState();
    if (curState.turnPhase === 'TARGET_REACTION_WINDOW') {
      if (chosenAction === 'duel') {
        curState.targetDeclareDuel(target.id, cardIndex);
      } else if (chosenAction === 'doubt') {
        curState.targetDoubtAttack(target.id);
      } else {
        curState.targetAcceptAttack(target.id);
      }
    }
  }, BOT_REACTION_MS + Math.random() * BOT_REACTION_JITTER_MS);
}

/**
 * Реакция бота-атакующего при объявлении дуэли целью (Принять дуэль / Отступить).
 */
export function handleDuelAttackerPhase(state: GameState, schedule: BotScheduler): void {
  const { pendingAction } = state;
  if (!pendingAction) return;

  const attacker = state.players.find(p => p.id === pendingAction.actorId);
  const defender = state.players.find(p => p.id === pendingAction.targetId);
  if (!attacker || !attacker.isBot || !defender) return;

  const archetype = getBotArchetype(attacker.id);
  const wasTruth = holds(attacker.hand, pendingAction.roleClaim!);

  let willAccept = false;
  if (wasTruth) {
    willAccept = true;
  } else {
    const baseAccept = (archetype.type === 'gambler' || archetype.type === 'provocateur') ? 0.35 : 0.10;
    willAccept = Math.random() < baseAccept;
  }

  schedule('duel_attacker', () => {
    const curState = useGameStore.getState();
    if (curState.turnPhase === 'DUEL_ATTACKER_WINDOW') {
      if (willAccept) {
        curState.attackerAcceptDuel(attacker.id);
      } else {
        curState.attackerRetreatDuel(attacker.id);
      }
    }
  }, BOT_REACTION_MS + Math.random() * BOT_REACTION_JITTER_MS);
}

/**
 * Реакция ботов в окне «Право вето».
 */
export function handleVetoPhase(state: GameState, schedule: BotScheduler): void {
  const { pendingAction, players, isVetoed } = state;
  if (!pendingAction || isVetoed) return;

  const vetoBots = players.filter(
    p => p.isBot && p.id !== pendingAction.actorId && holds(p.hand, 'Право вето')
  );

  for (const bot of vetoBots) {
    let shouldVeto = false;

    // Защита себя от прямой атаки (Вор или Шантажист)
    if (pendingAction.targetId === bot.id) {
      shouldVeto = true;
    }

    // Блокировка Наследника, берущего решающую корону
    const actor = players.find(p => p.id === pendingAction.actorId);
    if (pendingAction.roleClaim === 'Наследник' && actor && actor.favor >= 4) {
      shouldVeto = true;
    }

    // Блокировка опасных действий под Ва-банком
    if (state.isVaBanqueActive) {
      shouldVeto = true;
    }

    if (shouldVeto || Math.random() < 0.40) {
      const vetoIdx = faces(bot.hand).indexOf('Право вето');
      schedule('veto', () => {
        const cur = useGameStore.getState();
        if (cur.turnPhase === 'VETO_WINDOW' && !cur.isVetoed) {
          cur.playInstant(bot.id, 'Право вето', vetoIdx);
        }
      }, BOT_VETO_MS + Math.random() * BOT_VETO_JITTER_MS);
      break;
    }
  }
}
