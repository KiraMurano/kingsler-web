/**
 * KINGLIER - BOT AI ENGINE (MAIN FACADE)
 *
 * Модульная архитектура искусственного интеллекта ботов:
 * - ./bot/botMemory.ts       : Память ботов, учет карт оппонентов и истории ходов
 * - ./bot/botTargeting.ts    : Интеллектуальный выбор целей с учетом архетипов и контр-карт
 * - ./bot/botEvaluator.ts    : Математическая и психологическая оценка блефа («НЕ ВЕРЮ!»)
 * - ./bot/botTurnPlanner.ts  : Планирование активного хода (Обычные действия, Интриги, Роли, Ва-банк)
 * - ./bot/botReactions.ts    : Реактивные ответы в окнах сомнений, дуэлей и права вето
 * - ./bot/botEngine.ts       : Реактивный контроллер Zustand со сборщиком таймеров
 */

// 1. Конфигурация архетипов
export { getBotArchetype } from './botsConfig';

// 2. Память ботов и учет карт
export { botMemory, BotMemoryEngine, type KnownCardRecord } from './bot/botMemory';

// 3. Выбор целей
export {
  selectBestThiefTarget,
  selectBestBlackmailerTarget,
  selectBestSearchTarget,
  selectBestConspiracyTarget,
  selectBestRumorTarget,
  selectBestRedirectionTarget,
  selectBestDossierTarget
} from './bot/botTargeting';

// 4. Оценка сомнений
export { evaluateBotDoubt, type DoubtDecision } from './bot/botEvaluator';

// 5. Планирование хода
export { makeBotMove } from './bot/botTurnPlanner';

// 6. Реактивные окна
export {
  handleDoubtPhase,
  handleTargetReactionPhase,
  handleDuelAttackerPhase,
  handleVetoPhase,
  type BotScheduler
} from './bot/botReactions';

// 7. Реактивный слушатель стора и жизненный цикл движка
export { startBotEngine, stopBotEngine, clearBotTimer } from './bot/botEngine';
