import { useGameStore } from '../GameStore';
import type { CardId, CardInstance, Role, PlotType } from '../types';
import { isPlot } from '../cards';
import { faces, holds, idOf } from '../cardInstance';
import { getBotArchetype } from '../botsConfig';
import {
  selectBestThiefTarget,
  selectBestBlackmailerTarget,
  selectBestSearchTarget,
  shouldPlaySearchNow,
  selectBestConspiracyTarget,
  shouldActivateConspiracyNow,
  selectBestRumorTarget,
  selectBestDossierTarget
} from './botTargeting';

/** Which card a bluffing bot puts on the table: the most useless one it holds. */
function bluffStakeId(hand: CardInstance[]): CardId | undefined {
  return idOf(hand, 'Обыск покоев') ?? hand[0]?.id;
}

/**
 * Планирует и выполняет ход активного бота.
 */
export function makeBotMove(botId: string): void {
  let state = useGameStore.getState();
  if (state.turnPhase !== 'IDLE' || state.activePlayerId !== botId || state.pendingAction) return;

  const bot = state.players.find(p => p.id === botId);
  if (!bot || !bot.isBot) return;

  if (bot.actionTokens <= 0) {
    state.endTurn();
    return;
  }

  const opponents = state.players.filter(p => p.id !== bot.id);
  if (opponents.length === 0) return;

  const archetype = getBotArchetype(bot);
  const leader = [...opponents].sort((a, b) => b.favor - a.favor)[0];

  // ==========================================================================
  // ШАГ 1: ФАЗА ОБЫЧНЫХ ДЕЙСТВИЙ (ФАЗА 2)
  // ==========================================================================
  if (state.turnSubPhase === 'NORMAL_ACTION_PHASE' && !state.hasUsedNormalActionThisTurn) {
    // 1. Критический слух по лидеру с 5+ коронами
    if (leader && leader.favor >= 5 && bot.gold >= 5) {
      const rumorTarget = selectBestRumorTarget(opponents);
      if (rumorTarget) {
        useGameStore.getState().performAction({
          type: 'normal',
          name: 'Распустить слух',
          actorId: bot.id,
          targetId: rumorTarget.id,
          costGold: 5,
          costTokens: 1,
          description: `Заплатил 5 🪙: ${rumorTarget.name} теряет 1 👑.`
        });
        return;
      }
    }

    // 2. Пир при высоком золоте для набора темпа (до 5 корон)
    const feastChance = bot.favor >= 4 ? 0.75 : 0.40;
    if (bot.favor < 5 && bot.gold >= 3 && Math.random() < feastChance) {
      useGameStore.getState().performAction({
        type: 'normal',
        name: 'Устроить пир',
        actorId: bot.id,
        costGold: 3,
        costTokens: 1,
        description: 'Заплатил 3 🪙 и получил +1 👑.'
      });
      return;
    }

    // 3. Тактический слух при избытке золота
    if (bot.gold >= 5 && leader && leader.favor >= 3 && Math.random() < 0.60) {
      const rumorTarget = selectBestRumorTarget(opponents);
      if (rumorTarget) {
        useGameStore.getState().performAction({
          type: 'normal',
          name: 'Распустить слух',
          actorId: bot.id,
          targetId: rumorTarget.id,
          costGold: 5,
          costTokens: 1,
          description: `Заплатил 5 🪙: ${rumorTarget.name} теряет 1 👑.`
        });
        return;
      }
    }

    // 4. Просить содержание при нехватке средств
    if (bot.gold < 1 && Math.random() < 0.35) {
      useGameStore.getState().performAction({
        type: 'normal',
        name: 'Просить содержание',
        actorId: bot.id,
        costGold: 0,
        costTokens: 1,
        description: 'Просит содержание и берет 1 🪙.'
      });
      return;
    }

    // 5. Бесплатная смена 1 или 2 карт при наличии мертвых/неподходящих карт
    if (bot.hand.length > 0 && Math.random() < 0.25) {
      const badIds = bot.hand
        .filter(c => c.card === 'Дворцовый переполох' || c.card === 'Право вето' || c.card === 'Перенаправление')
        .map(c => c.id);

      if (badIds.length > 0) {
        useGameStore.getState().performAction({
          type: 'normal',
          name: badIds.length >= 2 ? 'Сменить 2 карты' : 'Сменить карту',
          actorId: bot.id,
          stakedCardId: badIds[0],
          stakedCardIds: badIds,
          costGold: 0,
          costTokens: 1,
          description: badIds.length >= 2
            ? 'Сбросил 2 карты и бесплатно взял новые из колоды.'
            : 'Сбросил карту и бесплатно взял новую из колоды.'
        });
        return;
      }
    }

    // Если обычное действие не выбрано — пропускаем Фазу 2 и переходим к Фазе 3
    useGameStore.getState().skipNormalActionPhase();
    state = useGameStore.getState();
  }

  // ==========================================================================
  // ШАГ 2: ФАЗА РОЗЫГРЫША КАРТ (ФАЗА 3)
  // ==========================================================================

  // Приоритет 0: «Тайный заговор» — только сильный удар, иначе копить / роль
  if (bot.activePlot?.type === 'Тайный заговор' && bot.actionTokens >= 1) {
    const charges = bot.activePlot.charges ?? 0;
    const target = selectBestConspiracyTarget(opponents, charges);
    if (
      target &&
      shouldActivateConspiracyNow(bot, target, charges, state.coronationCandidateId)
    ) {
      const effect: 'gold' | 'crown' =
        charges >= 3 && target.favor >= 1 ? 'crown' : 'gold';
      useGameStore.getState().activateConspiracy(bot.id, target.id, effect, false);
      return;
    }
  }

  // Приоритет 1: Розыгрыш Интриги (🎴), если нет активной
  if (!bot.activePlot && !state.hasPlayedPlotThisTurn) {
    const plotIdx = faces(bot.hand).findIndex(isPlot);
    if (plotIdx !== -1) {
      const plotCard = bot.hand[plotIdx].card as PlotType;
      const plotId = bot.hand[plotIdx].id;

      if (plotCard === 'Королевский приём') {
        if (bot.gold >= 2 || holds(bot.hand, 'Казначей') || holds(bot.hand, 'Рыцарь') || Math.random() < 0.7) {
          useGameStore.getState().playPlotAction('Королевский приём', plotId);
          return;
        }
      } else if (plotCard === 'Досье') {
        const target = selectBestDossierTarget(bot, opponents) || opponents[0];
        useGameStore.getState().playPlotAction('Досье', plotId, target.id);
        return;
      } else if (plotCard === 'Чёрная книга') {
        useGameStore.getState().playPlotAction('Чёрная книга', plotId);
        return;
      } else if (plotCard === 'Сеть информаторов') {
        useGameStore.getState().playPlotAction('Сеть информаторов', plotId);
        return;
      } else if (plotCard === 'Золотая булла') {
        useGameStore.getState().playPlotAction('Золотая булла', plotId);
        return;
      } else if (plotCard === 'Тайный заговор') {
        useGameStore.getState().playPlotAction('Тайный заговор', plotId);
        return;
      }
    }
  }

  // Приоритет 2: Розыгрыш Инстантов ⚡ (Обвинение в измене, Обыск покоев, Дворцовый переполох)
  const treasonId = idOf(bot.hand, 'Обвинение в измене');
  if (treasonId) {
    const target = leader && leader.favor >= 1
      ? leader
      : opponents.filter(p => p.favor >= 1).sort((a, b) => b.favor - a.favor)[0];

    if (target && (target.favor >= 2 || state.coronationCandidateId === target.id || Math.random() < 0.75)) {
      useGameStore.getState().playInstant(bot.id, 'Обвинение в измене', treasonId, target.id);
      return;
    }
  }

  const searchId = idOf(bot.hand, 'Обыск покоев');
  if (searchId) {
    const target = selectBestSearchTarget(bot, opponents);
    if (
      target &&
      shouldPlaySearchNow(bot, target, {
        players: state.players,
        activePlayerId: state.activePlayerId,
        coronationCandidateId: state.coronationCandidateId
      })
    ) {
      useGameStore.getState().playInstant(bot.id, 'Обыск покоев', searchId, target.id);
      return;
    }
  }

  const upheavalId = idOf(bot.hand, 'Дворцовый переполох');
  if (upheavalId && leader && leader.favor >= 3 && Math.random() < 0.65) {
    useGameStore.getState().playInstant(bot.id, 'Дворцовый переполох', upheavalId, leader.id);
    return;
  }

  // Приоритет 3: Розыгрыш Ролей
  if (!state.hasPlayedRoleThisTurn && bot.hand.length > 0) {
    const hasVaBanque = holds(bot.hand, 'Ва-банк') && bot.actionTokens >= 1;
    const withVB = hasVaBanque && (
      (archetype.type === 'gambler' || archetype.type === 'provocateur')
        ? Math.random() < 0.65
        : Math.random() < 0.25
    );
    const vbTokens = 1;

    // --- 1. Немедленная победа (5 -> 6 корон) ---
    if (bot.favor === 5) {
      if (holds(bot.hand, 'Наследник')) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Наследник',
          roleClaim: 'Наследник',
          actorId: bot.id,
          stakedCardId: idOf(bot.hand, 'Наследник') ?? undefined,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Наследник»${withVB ? ' под Ва-банком' : ''} и берет победную 6-ю 👑 (Круг Коронации)!`
        });
        return;
      }

      if (holds(bot.hand, 'Шантажист')) {
        const target = selectBestBlackmailerTarget(bot, opponents);
        if (target) {
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Шантажист',
            roleClaim: 'Шантажист',
            actorId: bot.id,
            targetId: target.id,
            stakedCardId: idOf(bot.hand, 'Шантажист') ?? undefined,
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Шантажирует ${target.name}${withVB ? ' под Ва-банком' : ''} и крадет победную 6-ю 👑!`
          });
          return;
        }
      }

      // Финальный победный блеф
      const closingBluffChance = 0.70;
      if (Math.random() < closingBluffChance) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Наследник',
          roleClaim: 'Наследник',
          actorId: bot.id,
          stakedCardId: bluffStakeId(bot.hand),
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Наследник»${withVB ? ' под Ва-банком' : ''} на победную 6-ю 👑!`
        });
        return;
      }
    }

    // --- 2. Разыгрывание честной роли с руки ---
    const playFromHandRate = 1.0 - archetype.bluffRate * 0.6;
    if (Math.random() < playFromHandRate) {
      if (holds(bot.hand, 'Наследник')) {
        const handId = idOf(bot.hand, 'Наследник') ?? undefined;
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Наследник',
          roleClaim: 'Наследник',
          actorId: bot.id,
          stakedCardId: handId,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Наследник»${withVB ? ' под Ва-банком' : ''} и берет +1 👑.`
        });
        return;
      }

      if (holds(bot.hand, 'Шантажист')) {
        const target = selectBestBlackmailerTarget(bot, opponents);
        if (target) {
          const handId = idOf(bot.hand, 'Шантажист') ?? undefined;
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Шантажист',
            roleClaim: 'Шантажист',
            actorId: bot.id,
            targetId: target.id,
            stakedCardId: handId,
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Шантажирует ${target.name}${withVB ? ' под Ва-банком' : ''}: отнимает 1 👑!`
          });
          return;
        }
      }

      if (holds(bot.hand, 'Казначей')) {
        const handId = idOf(bot.hand, 'Казначей') ?? undefined;
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Казначей',
          roleClaim: 'Казначей',
          actorId: bot.id,
          stakedCardId: handId,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Казначей»${withVB ? ' под Ва-банком' : ''} и берет +3 🪙.`
        });
        return;
      }

      if (holds(bot.hand, 'Вор')) {
        const target = selectBestThiefTarget(bot, opponents);
        if (target && target.gold > 0) {
          const handId = idOf(bot.hand, 'Вор') ?? undefined;
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Вор',
            roleClaim: 'Вор',
            actorId: bot.id,
            targetId: target.id,
            stakedCardId: handId,
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Заявляет «Вор»${withVB ? ' под Ва-банком' : ''} и забирает до 2 🪙 у ${target.name}.`
          });
          return;
        }
      }

      if (holds(bot.hand, 'Шут')) {
        const handId = idOf(bot.hand, 'Шут') ?? undefined;
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Шут',
          roleClaim: 'Шут',
          actorId: bot.id,
          stakedCardId: handId,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Шут»${withVB ? ' под Ва-банком' : ''} и получает +2 🪙.`
        });
        return;
      }

      if (holds(bot.hand, 'Рыцарь')) {
        const handId = idOf(bot.hand, 'Рыцарь') ?? undefined;
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Рыцарь',
          roleClaim: 'Рыцарь',
          actorId: bot.id,
          stakedCardId: handId,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Рыцарь»${withVB ? ' под Ва-банком' : ''} и получает +2 🪙.`
        });
        return;
      }
    }

    // --- 3. Блеф или обязательное действие при наличии 2 жетонов ---
    const mustAct = bot.actionTokens >= 2 && !state.hasUsedNormalActionThisTurn && !state.hasPlayedPlotThisTurn;
    if (mustAct || Math.random() < archetype.bluffRate) {
      const possibleBluffs: Role[] = [];
      if (bot.favor >= 3) possibleBluffs.push('Наследник');
      if (bot.gold < 3) possibleBluffs.push('Казначей', 'Рыцарь', 'Шут');
      if (leader && leader.favor > 0) possibleBluffs.push('Шантажист');

      const richest = selectBestThiefTarget(bot, opponents);
      if (richest && richest.gold >= 2) possibleBluffs.push('Вор');

      const chosenBluff = possibleBluffs.length > 0
        ? possibleBluffs[Math.floor(Math.random() * possibleBluffs.length)]
        : 'Казначей';

      if (chosenBluff === 'Вор') {
        const target = selectBestThiefTarget(bot, opponents);
        if (target && target.gold > 0) {
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Вор',
            roleClaim: 'Вор',
            actorId: bot.id,
            targetId: target.id,
            stakedCardId: bluffStakeId(bot.hand),
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Блефует: заявляет «Вор»${withVB ? ' под Ва-банком' : ''} на ${target.name}.`
          });
          return;
        }
      }

      if (chosenBluff === 'Шантажист') {
        const target = selectBestBlackmailerTarget(bot, opponents);
        if (target && target.favor > 0) {
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Шантажист',
            roleClaim: 'Шантажист',
            actorId: bot.id,
            targetId: target.id,
            stakedCardId: bluffStakeId(bot.hand),
            costGold: 0,
            costTokens: 1,
            description: `Заявляет «Шантажист» против ${target.name}.`
          });
          return;
        }
      }

      const safeClaim = (chosenBluff === 'Вор' || chosenBluff === 'Шантажист') ? 'Казначей' : chosenBluff;

      useGameStore.getState().performAction({
        type: 'role',
        name: safeClaim,
        roleClaim: safeClaim,
        actorId: bot.id,
        stakedCardId: bluffStakeId(bot.hand),
        costGold: 0,
        costTokens: 1,
        description: `Заявляет «${safeClaim}».`
      });
      return;
    }
  }

  // Завершение хода для сохранения жетона на защиту в чужие ходы
  useGameStore.getState().endTurnManually();
}
