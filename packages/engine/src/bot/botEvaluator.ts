import type { CardInstance, Player, Role } from '../types';
import { getBotArchetype } from '../botsConfig';
import { botMemory } from './botMemory';

export interface DoubtDecision {
  shouldDoubt: boolean;
  score: number;
  reason: string;
}

/**
 * Интеллектуальный математический и психологический движок оценки блефа («НЕ ВЕРЮ!»).
 */
export function evaluateBotDoubt(
  bot: Player,
  actor: Player,
  claimedRole: Role,
  _isTargetedDirectDoubt: boolean,
  coronationCandidateId: string | null,
  targetId: string | undefined,
  discardPile: CardInstance[],
  _allPlayers: Player[]
): DoubtDecision {
  // Без жетонов действия бот не может сомневаться
  if (bot.actionTokens < 1) {
    return { shouldDoubt: false, score: 0, reason: 'Нет жетонов действия' };
  }

  const archetype = getBotArchetype(bot.id);

  // 1. Точный подсчет исключенных копий карты:
  // - В сбросе
  // - В собственной руке бота
  // - В известных боту картах других игроков из памяти
  const copiesInDiscard = discardPile.filter(c => c.card === claimedRole).length;
  const copiesInBotHand = bot.hand.filter(c => c.card === claimedRole).length;
  const knownInOthers = botMemory.getAllKnownRoleCardsForBot(bot.id, actor.id).filter(c => c === claimedRole).length;

  const totalKnownExcluded = copiesInDiscard + copiesInBotHand + knownInOthers;

  // В колоде ровно 3 копии каждой роли
  if (totalKnownExcluded >= 3) {
    return {
      shouldDoubt: true,
      score: 1.0,
      reason: `Математически невозможно: все 3 копии «${claimedRole}» на виду!`
    };
  }

  // 2. Базовая оценка вероятности блефа по числу исключенных копий
  let baseBluffProb = 0.35;
  if (totalKnownExcluded === 2) {
    baseBluffProb = 0.85;
  } else if (totalKnownExcluded === 1) {
    baseBluffProb = 0.55;
  }

  let score = baseBluffProb * archetype.doubtAggression;

  // 3. Отслеживание спама одной и той же ролью подряд
  const consecutiveUsage = botMemory.getConsecutiveRoleClaims(actor.id, claimedRole);
  if (consecutiveUsage >= 2) {
    score += 0.22 * (consecutiveUsage - 1);
  }

  // 4. Тактические и ситуационные модификаторы
  let tacticalBonus = 0;

  // Лидер пытается взять решающую корону Наследником
  if (claimedRole === 'Наследник' && actor.favor >= 4) {
    tacticalBonus += 0.45;
  }

  // Актёр находится на Круге Коронации
  if (coronationCandidateId === actor.id) {
    tacticalBonus += 0.55;
  }

  // Самозащита от Шантажиста при высоких коронах
  if (claimedRole === 'Шантажист' && targetId === bot.id && bot.favor >= 3) {
    tacticalBonus += 0.30;
  }

  // Синергия с активной интригой «Чёрная книга» (+1 корона за пойманный блеф)
  if (bot.activePlot && bot.activePlot.type === 'Чёрная книга') {
    tacticalBonus += 0.25;
  }

  // Синергия с «Досье», если оно нацелено на этого актёра
  if (bot.activePlot && bot.activePlot.type === 'Досье' && bot.activePlot.targetPlayerId === actor.id) {
    tacticalBonus += 0.35;
  }

  // 5. Осторожность при проверке Шута (Ловушка Шута даёт актеру +1 корону!)
  if (claimedRole === 'Шут') {
    if (totalKnownExcluded < 2) {
      if (archetype.type === 'cautious' || archetype.type === 'pragmatic') {
        tacticalBonus -= 0.18;
      } else {
        tacticalBonus -= 0.08;
      }
    }
  }

  // 6. Модификатор архетипа бота
  let archetypeMod = 1.0;
  if (archetype.type === 'gambler') archetypeMod = 1.25;
  else if (archetype.type === 'cautious') archetypeMod = 0.78;
  else if (archetype.type === 'provocateur') archetypeMod = 1.15;
  else if (archetype.type === 'opportunist') archetypeMod = 1.08;

  score = (score + tacticalBonus) * archetypeMod;

  // 7. Легкая стохастическая дисперсия (живой характер решений)
  score += (Math.random() - 0.5) * 0.06;

  const threshold = 0.44;
  const clampedScore = Math.min(1.0, Math.max(0.0, score));
  const shouldDoubt = clampedScore >= threshold;

  return {
    shouldDoubt,
    score: clampedScore,
    reason: `Оценка сомнения: ${Math.round(clampedScore * 100)}% (порог: ${Math.round(threshold * 100)}%)`
  };
}
