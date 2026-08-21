import type { Player } from '../types';
import { getBotArchetype } from '../botsConfig';
import { botMemory } from './botMemory';

/**
 * Выбор наилучшей цели для роли «Вор» (кража до 2 золота).
 */
export function selectBestThiefTarget(bot: Player, opponents: Player[]): Player | null {
  const valid = opponents.filter(p => p.gold > 0);
  if (valid.length === 0) return null;

  const archetype = getBotArchetype(bot.id);

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
  const valid = opponents.filter(p => p.favor > 0);
  if (valid.length === 0) return null;

  const archetype = getBotArchetype(bot.id);

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
 * Выбор цели для инстанта «Шпион» (тайно посмотреть карты).
 * Интеллектуальный приоритет: шпионить за опасными игроками, карты которых еще НЕ известны боту!
 */
export function selectBestSpyTarget(bot: Player, opponents: Player[]): Player | null {
  if (opponents.length === 0) return null;

  const valid = [...opponents];

  valid.sort((a, b) => {
    const knownA = botMemory.getKnownCardsForBot(bot.id, a.id).length;
    const knownB = botMemory.getKnownCardsForBot(bot.id, b.id).length;

    let scoreA = (a.favor * 3.0 + a.gold * 1.0);
    let scoreB = (b.favor * 3.0 + b.gold * 1.0);

    // Бонус за неизвестность: шпионить за тем, чьих карт бот не знает
    if (knownA === 0) scoreA += 5.0;
    else if (knownA === 1) scoreA += 2.0;
    else scoreA -= 10.0; // Обе карты уже известны — нет смысла тратить шпиона

    if (knownB === 0) scoreB += 5.0;
    else if (knownB === 1) scoreB += 2.0;
    else scoreB -= 10.0;

    return scoreB - scoreA;
  });

  return valid[0] || null;
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
  allOpponents: Player[]
): Player | null {
  const possibleTargets = allOpponents.filter(p => p.id !== currentTarget.id);
  if (possibleTargets.length === 0) return null;

  possibleTargets.sort((a, b) => (b.favor * 2 + b.gold) - (a.favor * 2 + a.gold));
  return possibleTargets[0] || null;
}

/**
 * Выбор цели для интриги «Досье».
 */
export function selectBestDossierTarget(bot: Player, opponents: Player[]): Player | null {
  if (opponents.length === 0) return null;
  const archetype = getBotArchetype(bot.id);

  const sorted = [...opponents].sort((a, b) => {
    const archA = getBotArchetype(a.id);
    const archB = getBotArchetype(b.id);

    // Чаще блефующие игроки (азартные, провокаторы) — отличная цель для Досье
    let scoreA = (a.favor * 2.0) + (archA.bluffRate * 4.0 * archetype.targetAggression);
    let scoreB = (b.favor * 2.0) + (archB.bluffRate * 4.0 * archetype.targetAggression);

    if (a.favor >= 4) scoreA += 3.0;
    if (b.favor >= 4) scoreB += 3.0;

    return scoreB - scoreA;
  });

  return sorted[0] || null;
}
