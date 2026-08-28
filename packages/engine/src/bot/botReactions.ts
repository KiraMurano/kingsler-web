import { useGameStore } from '../GameStore';
import type { GameState, Role } from '../types';
import { getBotArchetype } from '../botsConfig';
import { evaluateBotDoubt } from './botEvaluator';
import { selectBestRedirectionTarget } from './botTargeting';
import { holds, idOf } from '../cardInstance';
import {
  ACTION_HOLD_MS,
  BOT_REACTION_MS,
  BOT_REACTION_JITTER_MS,
  BOT_VETO_MS,
  BOT_VETO_JITTER_MS
} from '../timing';

export type BotScheduler = (timerKey: string, callback: () => void, delayMs: number) => void;

/**
 * Разлёт ответов ботов в окне сомнения.
 *
 * Каждому боту добавляется свой шаг задержки поверх общей паузы: иначе трое
 * отвечают в один кадр, и стол читается как одно движение вместо трёх решений.
 */
const DOUBT_STAGGER_MS = 260;

/**
 * Ответ ботов в окне сомнения: «Верю» или «Не верю».
 *
 * Каждый наблюдающий бот отвечает сам и своим таймером. Раньше отвечал только
 * тот, кто решил усомниться, а остальные молчали: окно проматывалось само,
 * если за столом не было второго живого наблюдателя, а если был — ботов
 * переспрашивали заново прямо внутри `passDoubt`, уже после его клика. Два
 * механизма на одно решение, и ни в одном боты не говорили «Верю» вслух.
 *
 * Бот без жетона действия проверить не может — для него «Верю» единственный
 * законный ответ, но ответить он всё равно обязан: иначе окно ждёт того, кто
 * никогда не ответит.
 */
export function handleDoubtPhase(state: GameState, schedule: BotScheduler): void {
  const { pendingAction, players, discardPile, coronationCandidateId } = state;
  if (!pendingAction || !pendingAction.roleClaim) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  if (!actor) return;

  const observingBots = players.filter(p => p.isBot && p.id !== pendingAction.actorId);

  observingBots.forEach((bot, idx) => {
    const decision =
      bot.actionTokens >= 1
        ? evaluateBotDoubt(
            bot,
            actor,
            pendingAction.roleClaim!,
            false,
            coronationCandidateId,
            pendingAction.targetId,
            discardPile,
            players
          )
        : { shouldDoubt: false };

    const delay =
      BOT_REACTION_MS + Math.random() * BOT_REACTION_JITTER_MS + idx * DOUBT_STAGGER_MS;

    schedule(
      `doubt_${bot.id}`,
      () => {
        const cur = useGameStore.getState();
        /* Окно могло закрыться, пока бот думал: кто-то усомнился раньше, и
           тогда отвечать уже не на что. Обе ветки это и так отбивают, но
           лучше не звать их вовсе. */
        if (cur.turnPhase !== 'DOUBT_WINDOW' || cur.pendingDoubtDoubterId) return;
        if (decision.shouldDoubt) cur.doubtAction(bot.id);
        else cur.passDoubt(bot.id);
      },
      delay
    );
  });
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
  const redirectId = idOf(target.hand, 'Перенаправление');
  if (redirectId && Math.random() < 0.70) {
    const otherOpponents = players.filter(p => p.id !== attacker.id && p.id !== target.id);
    const newTarget = selectBestRedirectionTarget(attacker, target, otherOpponents, pendingAction.roleClaim);
    if (newTarget) {
      schedule('target_block', () => {
        const curState = useGameStore.getState();
        if (curState.turnPhase === 'TARGET_REACTION_WINDOW') {
          curState.playInstant(target.id, 'Перенаправление', redirectId, newTarget.id);
        }
      }, ACTION_HOLD_MS);
      return;
    }
  }

  const blockingRole: Role = pendingAction.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
  const hasCard = holds(target.hand, blockingRole);
  const archetype = getBotArchetype(target);
  const shieldId = (hasCard ? idOf(target.hand, blockingRole) : null) ?? target.hand[0]?.id;

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

  /* Дуэль у ботов стоит столько же, сколько у человека: правило одно на всех. */
  const duelTokenCost = useGameStore.getState().rules.duelCostsToken ? 1 : 0;

  let chosenAction: 'accept' | 'doubt' | 'duel' = 'accept';

  if (hasCard) {
    if (doubtEval.shouldDoubt && doubtEval.score >= 0.98 && target.actionTokens >= 1) {
      chosenAction = 'doubt';
    } else if (target.actionTokens >= duelTokenCost) {
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

      if (target.actionTokens >= duelTokenCost && Math.random() < fakeDuelChance) {
        chosenAction = 'duel';
      } else {
        chosenAction = 'accept';
      }
    }
  }

  schedule('target_block', () => {
    const curState = useGameStore.getState();
    if (curState.turnPhase === 'TARGET_REACTION_WINDOW') {
      if (chosenAction === 'duel' && shieldId) {
        curState.targetDeclareDuel(target.id, shieldId);
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

  const archetype = getBotArchetype(attacker);
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
      const vetoId = idOf(bot.hand, 'Право вето');
      if (!vetoId) continue;
      schedule('veto', () => {
        const cur = useGameStore.getState();
        if (cur.turnPhase === 'VETO_WINDOW' && !cur.isVetoed) {
          cur.playInstant(bot.id, 'Право вето', vetoId);
        }
      }, BOT_VETO_MS + Math.random() * BOT_VETO_JITTER_MS);
      break;
    }
  }
}
