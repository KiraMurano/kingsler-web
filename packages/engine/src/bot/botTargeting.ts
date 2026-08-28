import type { Player, Role } from '../types';
import { isRole } from '../cards';
import { faces, holds } from '../cardInstance';
import { getBotArchetype } from '../botsConfig';
import { botMemory } from './botMemory';
import { canBeTargetedBy } from '../targeting';
import { CONSPIRACY_FULL_CHARGE, CONSPIRACY_GOLD_HIT } from '../resolvers/plotResolver';

/**
 * Выбор наилучшей цели для роли «Вор» (кража до 2 золота).
 */
export function selectBestThiefTarget(bot: Player, opponents: Player[]): Player | null {
  const valid = opponents.filter(p => canBeTargetedBy(p, 'Вор'));
  if (valid.length === 0) return null;

  const archetype = getBotArchetype(bot);

  valid.sort((a, b) => {
    // Базовый счет золота с учетом жадности архетипа
    let scoreA = (a.gold * (1.2 + archetype.greed * 0.8)) + (a.favor * 1.5 * archetype.targetAggression);
    let scoreB = (b.gold * (1.2 + archetype.greed * 0.8)) + (b.favor * 1.5 * archetype.targetAggression);

    // Память ботов: если бот знает, что у цели есть «Казначей» (щит против Вора), снижаем приоритет цели
    if (botMemory.isCounterCardKnown(bot.id, a.id, 'Казначей')) {
      scoreA -= 6.0;
    }
    if (botMemory.isCounterCardKnown(bot.id, b.id, 'Казначей')) {
      scoreB -= 6.0;
    }

    // Бонус атаки на лидера по коронам
    if (a.favor >= 4) scoreA += 2.0;
    if (b.favor >= 4) scoreB += 2.0;

    return scoreB - scoreA;
  });

  return valid[0] || null;
}

/**
 * Выбор наилучшей цели для роли «Шантажист» (кража 1 короны).
 */
export function selectBestBlackmailerTarget(bot: Player, opponents: Player[]): Player | null {
  const valid = opponents.filter(p => canBeTargetedBy(p, 'Шантажист'));
  if (valid.length === 0) return null;

  const archetype = getBotArchetype(bot);

  valid.sort((a, b) => {
    let scoreA = (a.favor * 3.0 * archetype.targetAggression) + (a.gold * 0.5);
    let scoreB = (b.favor * 3.0 * archetype.targetAggression) + (b.gold * 0.5);

    // Память ботов: если известно, что у цели есть «Рыцарь» (щит против Шантажиста), избегаем блокировки
    if (botMemory.isCounterCardKnown(bot.id, a.id, 'Рыцарь')) {
      scoreA -= 8.0;
    }
    if (botMemory.isCounterCardKnown(bot.id, b.id, 'Рыцарь')) {
      scoreB -= 8.0;
    }

    // Критический приоритет: если цель имеет 5+ корон (близка к победе)
    if (a.favor >= 5) scoreA += 10.0;
    if (b.favor >= 5) scoreB += 10.0;

    return scoreB - scoreA;
  });

  return valid[0] || null;
}

/**
 * Выбор цели для инстанта «Обыск покоев» (сброс активной интриги).
 */
export function selectBestSearchTarget(_bot: Player, opponents: Player[]): Player | null {
  const valid = opponents.filter(p => p.activePlot);
  if (valid.length === 0) return null;

  valid.sort((a, b) => {
    const score = (p: Player) => {
      const plot = p.activePlot!;
      let s = p.favor * 2;
      if (plot.type === 'Тайный заговор') s += 8 + (plot.charges ?? 0) * 3;
      else if (plot.type === 'Королевский приём') s += 6;
      else if (plot.type === 'Золотая булла') s += 5;
      else s += 3;
      return s;
    };
    return score(b) - score(a);
  });

  return valid[0] ?? null;
}

function nextPlayerId(players: Player[], activePlayerId: string): string | undefined {
  const seated = [...players].sort((a, b) => a.seatNumber - b.seatNumber);
  if (seated.length === 0) return undefined;
  const idx = seated.findIndex(p => p.id === activePlayerId);
  if (idx < 0) return seated[0]?.id;
  return seated[(idx + 1) % seated.length].id;
}

/**
 * Играть «Обыск покоев» сейчас или оставить карту на роль / блеф.
 * Срочно: заговор 2+, утренний триггер следующего игрока, лидер на 5 👑 / в круге коронации.
 */
export function shouldPlaySearchNow(
  bot: Player,
  target: Player,
  ctx: {
    players: Player[];
    activePlayerId: string;
    coronationCandidateId: string | null;
  },
  rng: () => number = Math.random
): boolean {
  const plot = target.activePlot;
  if (!plot) return false;

  // Свой ход на 5 👑 важнее: обыск заканчивает ход, коронацию не взять.
  if (bot.favor >= 5) return false;

  const nextId = nextPlayerId(ctx.players, ctx.activePlayerId);
  const morningPlot = plot.type === 'Королевский приём' || plot.type === 'Золотая булла';
  const urgent =
    (plot.type === 'Тайный заговор' && (plot.charges ?? 0) >= 2) ||
    target.favor >= 5 ||
    ctx.coronationCandidateId === target.id ||
    (target.id === nextId && morningPlot);
  if (urgent) return true;

  const hasWinRole = holds(bot.hand, 'Наследник') || holds(bot.hand, 'Шантажист');
  if (hasWinRole) return false;

  const weakPlot =
    plot.type === 'Досье' ||
    plot.type === 'Чёрная книга' ||
    plot.type === 'Сеть информаторов';
  if (weakPlot && target.favor < 4 && faces(bot.hand).some(isRole)) return false;

  const arch = getBotArchetype(bot);
  let chance = 0.22 + arch.targetAggression * 0.28 - arch.bluffRate * 0.25;
  if (morningPlot) chance += 0.2;
  if (plot.type === 'Тайный заговор') chance += 0.12 + (plot.charges ?? 0) * 0.08;
  if (faces(bot.hand).some(isRole)) chance -= 0.2;
  return rng() < chance;
}

/**
 * Кого бить «Тайным заговором»: с 3+ — лидера по коронам, иначе богатого.
 */
export function selectBestConspiracyTarget(
  opponents: Player[],
  charges: number
): Player | null {
  const valid = charges >= 3
    ? opponents.filter(p => p.favor > 0 || p.gold > 0)
    : opponents.filter(p => p.gold > 0);
  if (valid.length === 0) return null;

  valid.sort((a, b) => {
    const score = (p: Player) => {
      let s = p.favor * 3 + p.gold;
      if (p.favor >= 5) s += 12;
      else if (p.favor >= 4) s += 4;
      if (charges >= 3 && p.favor > 0) s += 6;
      return s;
    };
    return score(b) - score(a);
  });
  return valid[0] ?? null;
}

/**
 * Слить заговор сейчас или копить / отдать ход роли.
 * Срочно: 4 заряда (пока не обыскали), корона с лидера 5 👑 / круга коронации.
 */
export function shouldActivateConspiracyNow(
  bot: Player,
  target: Player,
  charges: number,
  coronationCandidateId: string | null,
  rng: () => number = Math.random
): boolean {
  /* Копить больше нечего: Заговор разряжается только на 4 зарядах, частичных
     ударов в правилах нет. Остался один вопрос — бить сейчас или подождать
     цель получше, рискуя «Обыском покоев». */
  if (charges < CONSPIRACY_FULL_CHARGE) return false;
  if (bot.favor >= 5) return false;

  const canCrown = target.favor >= 1 || target.activePlot?.type === 'Охранная грамота';
  const goldHit = Math.min(CONSPIRACY_GOLD_HIT, target.gold);
  const hasWinRole = holds(bot.hand, 'Наследник') || holds(bot.hand, 'Шантажист');
  const hasAnyRole = faces(bot.hand).some(isRole);

  // Срыв коронации и снос лидера — бить немедленно.
  if (canCrown && (target.favor >= 5 || coronationCandidateId === target.id)) return true;

  // Заряженный Заговор — приз для чужого «Обыска покоев». Держать его дольше
  // нужного невыгодно, поэтому бьём, как только удар осмыслен.
  if (canCrown || goldHit >= 2) return true;

  if (hasWinRole || hasAnyRole) return false;

  const arch = getBotArchetype(bot);
  return rng() < 0.12 + arch.greed * 0.4;
}

/**
 * Выбор цели для обычного действия «📜 Распустить слух» (-1 корона за 5 золота).
 */
export function selectBestRumorTarget(opponents: Player[]): Player | null {
  const valid = opponents.filter(p => p.favor > 0);
  if (valid.length === 0) return null;

  // Атакуем лидера по коронам, особенно 4+ короны
  valid.sort((a, b) => {
    let scoreA = a.favor * 3 + a.gold;
    let scoreB = b.favor * 3 + b.gold;
    if (a.favor >= 5) scoreA += 10;
    if (b.favor >= 5) scoreB += 10;
    return scoreB - scoreA;
  });

  return valid[0] || null;
}

/**
 * Выбор цели для инстанта «Перенаправление».
 */
export function selectBestRedirectionTarget(
  _attacker: Player,
  currentTarget: Player,
  allOpponents: Player[],
  roleClaim?: Role
): Player | null {
  const possibleTargets = allOpponents.filter(p => {
    if (p.id === currentTarget.id) return false;
    if (!roleClaim) return true;
    return canBeTargetedBy(p, roleClaim);
  });
  if (possibleTargets.length === 0) return null;

  possibleTargets.sort((a, b) => (b.favor * 2 + b.gold) - (a.favor * 2 + a.gold));
  return possibleTargets[0] || null;
}

/**
 * Выбор цели для интриги «Досье».
 */
export function selectBestDossierTarget(bot: Player, opponents: Player[]): Player | null {
  if (opponents.length === 0) return null;
  const archetype = getBotArchetype(bot);

  const sorted = [...opponents].sort((a, b) => {
    const archA = getBotArchetype(a);
    const archB = getBotArchetype(b);

    // Чаще блефующие игроки (азартные, провокаторы) — отличная цель для Досье
    let scoreA = (a.favor * 2.0) + (archA.bluffRate * 4.0 * archetype.targetAggression);
    let scoreB = (b.favor * 2.0) + (archB.bluffRate * 4.0 * archetype.targetAggression);

    if (a.favor >= 4) scoreA += 3.0;
    if (b.favor >= 4) scoreB += 3.0;

    return scoreB - scoreA;
  });

  return sorted[0] || null;
}
