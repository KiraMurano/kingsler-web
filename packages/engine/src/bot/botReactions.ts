import { useGameStore } from '../GameStore';
import type { GameState } from '../types';
import { getBotArchetype } from '../botsConfig';
import { evaluateBotDoubt } from './botEvaluator';
import { selectBestRedirectionTarget } from './botTargeting';
import { holds, idOf } from '../cardInstance';
import { vetoAnswerRequired, vetoTopActorId } from '../resolvers/vetoChain';
import { duelPayment } from '../resolvers/duelResolver';
import { duelShieldFor } from '../roles';
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
  const { pendingAction, players, discardPile, coronations, pendingDoubtPassedIds } = state;
  if (!pendingAction || !pendingAction.roleClaim) return;

  const actor = players.find(p => p.id === pendingAction.actorId);
  if (!actor) return;

  /* Жертва нападения входит в окно с уже сказанным «Верю» — переспрашивать её
     значит задавать один вопрос дважды, ровно то, от чего мы и ушли. */
  const observingBots = players.filter(
    p => p.isBot && p.id !== pendingAction.actorId && !pendingDoubtPassedIds.includes(p.id)
  );

  observingBots.forEach((bot, idx) => {
    const decision =
      bot.actionTokens >= 1
        ? evaluateBotDoubt(
            bot,
            actor,
            pendingAction.roleClaim!,
            false,
            coronations,
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
 * Ответ бота-жертвы — один и окончательный: Верю / Не верю / Дуэль
 * (или «Перенаправление» за 1 ⚡, если оно есть на руках).
 *
 * Второго вопроса не будет: сказанное здесь «Верю» засчитывается как ответ
 * бота в опросе двора, а выставленный щит сразу разыгрывает дуэль.
 */
export function handleTargetReactionPhase(state: GameState, schedule: BotScheduler): void {
  const { pendingAction, discardPile, players } = state;
  if (!pendingAction || !pendingAction.targetId) return;

  const target = players.find(p => p.id === pendingAction.targetId);
  const attacker = players.find(p => p.id === pendingAction.actorId);
  if (!target || !target.isBot || !attacker) return;

  // 1. Возможность сыграть инстант ⚡ «Перенаправление» (1 ⚡)
  const redirectId = idOf(target.hand, 'Перенаправление');
  if (redirectId && target.actionTokens >= 1 && Math.random() < 0.70) {
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

  const { rules } = useGameStore.getState();
  const blockingRole = pendingAction.roleClaim ? duelShieldFor(pendingAction.roleClaim) : null;
  if (!blockingRole) return;
  const hasCard = holds(target.hand, blockingRole);
  const archetype = getBotArchetype(target);
  const shieldId = (hasCard ? idOf(target.hand, blockingRole) : null) ?? target.hand[0]?.id;

  const doubtEval = evaluateBotDoubt(
    target,
    attacker,
    pendingAction.roleClaim!,
    false,
    useGameStore.getState().coronations,
    pendingAction.targetId,
    discardPile,
    players
  );

  /* Дуэль у ботов стоит столько же, сколько у человека: цену считает та же
     функция, что и для движка с интерфейсом. Своя мерка здесь уже приводила к
     тому, что бот выбирал ход, который движок отвергал молча. */
  const canDuel = duelPayment(rules, target) !== null;

  let chosenAction: 'accept' | 'doubt' | 'duel' = 'accept';

  if (hasCard) {
    if (doubtEval.shouldDoubt && doubtEval.score >= 0.98 && target.actionTokens >= 1) {
      chosenAction = 'doubt';
    } else if (canDuel) {
      chosenAction = 'duel';
    }
  } else {
    if (doubtEval.shouldDoubt && doubtEval.score >= 0.98 && target.actionTokens >= 1) {
      chosenAction = 'doubt';
    } else {
      let fakeDuelChance = 0.25 * archetype.blockBluffRate;
      if (pendingAction.roleClaim === 'Шантажист' && target.favor >= Math.max(1, rules.crownsToWin - 2)) {
        fakeDuelChance = 0.65;
      }

      if (canDuel && Math.random() < fakeDuelChance) {
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
 * Ответ ботов в окне «Право вето»: наложить вето или пропустить.
 *
 * Окно держится ответами, а не часами, — значит ответить обязан каждый, кого
 * спрашивают, и бот без «Права вето» в том числе: для него «Пропустить» —
 * единственный законный ответ, но не ответить он не может, иначе стол будет
 * ждать того, кто никогда не ответит. Это ровно устройство окна сомнения (см.
 * `handleDoubtPhase`), и разъезжаться им нельзя.
 */
export function handleVetoPhase(state: GameState, schedule: BotScheduler): void {
  const { pendingAction, players, isVetoed, rules, vetoChain, pendingVetoPassedIds } = state;
  if (!pendingAction) return;

  /* Чья карта наверху — тот в этом круге не отвечает: ни своё действие, ни
     своё же вето отменять незачем. Именно из-за пропуска этого правила бот,
     положивший вето, тут же говорил «Не накладываю Вето». */
  const topActorId = vetoTopActorId(pendingAction.actorId, state.overlayInstant);

  /* Вето на вето запрещено правилами партии, а вето уже лежит: круг закрылся
     сам, отвечать не на что. */
  if (isVetoed && !rules.vetoOnVeto) return;

  const actor = players.find(p => p.id === pendingAction.actorId);

  /* Круг, на который отвечают. Пока бот думает, кто-то может положить вето —
     и тогда это уже другой вопрос, а заготовленный ответ к нему не относится. */
  const round = vetoChain;

  const responders = players.filter(
    p =>
      p.isBot &&
      vetoAnswerRequired(p.id, topActorId) &&
      !pendingVetoPassedIds.includes(p.id)
  );

  responders.forEach((bot, idx) => {
    const vetoId = idOf(bot.hand, 'Право вето');
    let shouldVeto = false;

    if (vetoId) {
      if (isVetoed) {
        /* Встречное вето снимает чужую отмену — значит осмысленно оно только
           тому, чьё действие отменили. Остальным оно вернуло бы к жизни чужой
           ход, поэтому в цепочке кандидат ровно один: автор действия. */
        shouldVeto = bot.id === pendingAction.actorId;
      } else {
        // Защита себя от прямой атаки (Вор или Шантажист)
        if (pendingAction.targetId === bot.id) shouldVeto = true;

        // Блокировка Наследника, берущего решающую корону
        if (
          pendingAction.roleClaim === 'Наследник' &&
          actor &&
          actor.favor >= Math.max(1, rules.crownsToWin - 2)
        ) {
          shouldVeto = true;
        }

        // Блокировка опасных действий под Ва-банком
        if (state.isVaBanqueActive) shouldVeto = true;

        if (!shouldVeto) shouldVeto = Math.random() < 0.40;
      }
    }

    const delay =
      BOT_VETO_MS + Math.random() * BOT_VETO_JITTER_MS + idx * DOUBT_STAGGER_MS;

    schedule(
      `veto_${bot.id}`,
      () => {
        const cur = useGameStore.getState();
        /* Круг мог смениться, пока бот думал: поверх легло вето, и вопрос
           теперь другой. Свой ответ бот даст заново — движок пересобирает
           опрос на каждое сыгранное вето. */
        if (cur.turnPhase !== 'VETO_WINDOW' || cur.vetoChain !== round) return;
        if (cur.pendingVetoPassedIds.includes(bot.id)) return;
        if (!shouldVeto || !vetoId) {
          cur.passVeto(bot.id);
          return;
        }

        cur.playInstant(bot.id, 'Право вето', vetoId);

        /* Окно держится ответами — значит промолчать бот не имеет права ни при
           каком исходе. Движок вправе отвергнуть ход молча (карты уже нет на
           руках, ход не тот), и тогда «наложить вето» ответом не стало: без
           этого отката бот просто исчезает из опроса, а стол ждёт его вечно.
           Признак того, что вето легло, — сдвинувшаяся цепочка. */
        if (useGameStore.getState().vetoChain === round) cur.passVeto(bot.id);
        // ЗАМЕТКА: см. `bot/botVeto.check.ts` — оба зависания окна вето пришли
        // отсюда и из перезапуска круга в `instantResolver`.
      },
      delay
    );
  });
}
