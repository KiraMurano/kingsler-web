import { useGameStore } from '../GameStore';
import type { GameState, Role } from '../types';
import { getBotArchetype } from '../botsConfig';
import { evaluateBotDoubt } from './botEvaluator';
import { selectBestRedirectionTarget } from './botTargeting';

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
      const delay = 1200 + Math.random() * 800;
      schedule('doubt', () => {
        const curState = useGameStore.getState();
        if (curState.turnPhase === 'DOUBT_WINDOW') {
          curState.doubtAction(bot.id);
        }
      }, delay);
      break;
    }
  }

  // If no bot doubts and the actor is the human player (all observers are bots who passed), proceed after delay
  if (!botWillDoubt && !actor.isBot) {
    schedule('doubt', () => {
      const curState = useGameStore.getState();
      if (curState.turnPhase === 'DOUBT_WINDOW' && curState.pendingAction) {
        curState._proceedAfterDoubtPassed(curState.pendingAction);
      }
    }, 1200);
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
  const redirectIdx = target.hand.indexOf('Перенаправление');
  if (redirectIdx !== -1 && Math.random() < 0.70) {
    const otherOpponents = players.filter(p => p.id !== attacker.id && p.id !== target.id);
    const newTarget = selectBestRedirectionTarget(attacker, target, otherOpponents);
    if (newTarget) {
      schedule('target_block', () => {
        const curState = useGameStore.getState();
        if (curState.turnPhase === 'TARGET_REACTION_WINDOW') {
          curState.playInstant(target.id, 'Перенаправление', redirectIdx, newTarget.id);
        }
      }, 1200);
      return;
    }
  }

  const blockingRole: Role = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
  const hasCard = target.hand.includes(blockingRole);
  const archetype = getBotArchetype(target.id);
  const cardIndex = hasCard ? target.hand.indexOf(blockingRole) : 0;

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
    } else {
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

      if (Math.random() < fakeDuelChance) {
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
  }, 1800 + Math.random() * 800);
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
  const wasTruth = attacker.hand.includes(pendingAction.roleClaim!);

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
  }, 1600 + Math.random() * 800);
}

/**
 * Реакция ботов в окне «Право вето».
 */
export function handleVetoPhase(state: GameState, schedule: BotScheduler): void {
  const { pendingAction, players, isVetoed } = state;
  if (!pendingAction || isVetoed) return;

  const vetoBots = players.filter(
    p => p.isBot && p.id !== pendingAction.actorId && p.hand.includes('Право вето')
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
      const vetoIdx = bot.hand.indexOf('Право вето');
      schedule('veto', () => {
        const cur = useGameStore.getState();
        if (cur.turnPhase === 'VETO_WINDOW' && !cur.isVetoed) {
          cur.playInstant(bot.id, 'Право вето', vetoIdx);
        }
      }, 500 + Math.random() * 400);
      break;
    }
  }
}
