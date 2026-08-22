import { useGameStore } from '../GameStore';
import type { Role, PlotType } from '../types';
import { isPlot } from '../cards';
import { getBotArchetype } from '../botsConfig';
import {
  selectBestThiefTarget,
  selectBestBlackmailerTarget,
  selectBestSpyTarget,
  selectBestRumorTarget,
  selectBestDossierTarget
} from './botTargeting';

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

  const archetype = getBotArchetype(bot.id);
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
          name: '📜 Распустить слух',
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
        name: '🍷 Устроить пир',
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
          name: '📜 Распустить слух',
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
        name: '🪙 Просить содержание',
        actorId: bot.id,
        costGold: 0,
        costTokens: 1,
        description: 'Просит содержание и берет 1 🪙.'
      });
      return;
    }

    // 5. Бесплатная смена 1 или 2 карт при наличии мертвых/неподходящих карт
    if (bot.hand.length > 0 && Math.random() < 0.25) {
      const badIndices = bot.hand
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c === 'Шпион' || c === 'Дворцовый переполох' || c === 'Право вето' || c === 'Перенаправление')
        .map(({ i }) => i);

      if (badIndices.length > 0) {
        useGameStore.getState().performAction({
          type: 'normal',
          name: badIndices.length >= 2 ? '🔄 Сменить 2 карты' : '🔄 Сменить карту',
          actorId: bot.id,
          stakedCardIndex: badIndices[0],
          stakedCardIndices: badIndices,
          costGold: 0,
          costTokens: 1,
          description: badIndices.length >= 2
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

  // Приоритет 0: Активация готового «Тайного заговора» (при 2, 3 или 4 зарядах) в свой ход (1 ⚡)
  if (bot.activePlot?.type === 'Тайный заговор' && (bot.activePlot.charges ?? 0) >= 2 && bot.actionTokens >= 1) {
    const charges = bot.activePlot.charges ?? 0;
    const target = leader || opponents[0];
    if (target) {
      const effect: 'gold' | 'crown' = (charges >= 3 && target.favor >= 1) ? 'crown' : 'gold';
      if (charges >= 3 || target.gold >= 2 || Math.random() < 0.75) {
        useGameStore.getState().activateConspiracy(bot.id, target.id, effect, false);
        return;
      }
    }
  }

  // Приоритет 1: Розыгрыш Интриги (🎴), если нет активной
  if (!bot.activePlot && !state.hasPlayedPlotThisTurn) {
    const plotIdx = bot.hand.findIndex(isPlot);
    if (plotIdx !== -1) {
      const plotCard = bot.hand[plotIdx] as PlotType;

      if (plotCard === 'Королевский приём') {
        if (bot.gold >= 2 || bot.hand.includes('Казначей') || bot.hand.includes('Рыцарь') || Math.random() < 0.7) {
          useGameStore.getState().playPlotAction('Королевский приём', plotIdx);
          return;
        }
      } else if (plotCard === 'Досье') {
        const target = selectBestDossierTarget(bot, opponents) || opponents[0];
        useGameStore.getState().playPlotAction('Досье', plotIdx, target.id);
        return;
      } else if (plotCard === 'Чёрная книга') {
        useGameStore.getState().playPlotAction('Чёрная книга', plotIdx);
        return;
      } else if (plotCard === 'Сеть информаторов') {
        useGameStore.getState().playPlotAction('Сеть информаторов', plotIdx);
        return;
      } else if (plotCard === 'Золотая булла') {
        useGameStore.getState().playPlotAction('Золотая булла', plotIdx);
        return;
      } else if (plotCard === 'Тайный заговор') {
        useGameStore.getState().playPlotAction('Тайный заговор', plotIdx);
        return;
      }
    }
  }

  // Приоритет 2: Розыгрыш Инстантов ⚡ (Обвинение в измене, Шпион, Дворцовый переполох)
  const treasonIdx = bot.hand.indexOf('Обвинение в измене');
  if (treasonIdx !== -1) {
    const target = leader && leader.favor >= 1
      ? leader
      : opponents.filter(p => p.favor >= 1).sort((a, b) => b.favor - a.favor)[0];

    if (target && (target.favor >= 2 || state.coronationCandidateId === target.id || Math.random() < 0.75)) {
      useGameStore.getState().playInstant(bot.id, 'Обвинение в измене', treasonIdx, target.id);
      return;
    }
  }

  const spyIdx = bot.hand.indexOf('Шпион');
  if (spyIdx !== -1 && Math.random() < 0.70) {
    const target = selectBestSpyTarget(bot, opponents);
    if (target) {
      useGameStore.getState().playInstant(bot.id, 'Шпион', spyIdx, target.id);
      return;
    }
  }

  const upheavalIdx = bot.hand.indexOf('Дворцовый переполох');
  if (upheavalIdx !== -1 && leader && leader.favor >= 3 && Math.random() < 0.65) {
    useGameStore.getState().playInstant(bot.id, 'Дворцовый переполох', upheavalIdx, leader.id);
    return;
  }

  // Приоритет 3: Розыгрыш Ролей
  if (!state.hasPlayedRoleThisTurn && bot.hand.length > 0) {
    const hasVaBanque = bot.hand.includes('Ва-банк') && bot.actionTokens >= 1;
    const withVB = hasVaBanque && (
      (archetype.type === 'gambler' || archetype.type === 'provocateur')
        ? Math.random() < 0.65
        : Math.random() < 0.25
    );
    const vbTokens = 1;

    // --- 1. Немедленная победа (5 -> 6 корон) ---
    if (bot.favor === 5) {
      if (bot.hand.includes('Наследник')) {
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Наследник',
          roleClaim: 'Наследник',
          actorId: bot.id,
          stakedCardIndex: bot.hand.indexOf('Наследник'),
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Наследник»${withVB ? ' под Ва-банком' : ''} и берет победную 6-ю 👑 (Круг Коронации)!`
        });
        return;
      }

      if (bot.hand.includes('Шантажист')) {
        const target = selectBestBlackmailerTarget(bot, opponents);
        if (target) {
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Шантажист',
            roleClaim: 'Шантажист',
            actorId: bot.id,
            targetId: target.id,
            stakedCardIndex: bot.hand.indexOf('Шантажист'),
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
          stakedCardIndex: 0,
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
      if (bot.hand.includes('Наследник')) {
        const handIdx = bot.hand.indexOf('Наследник');
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Наследник',
          roleClaim: 'Наследник',
          actorId: bot.id,
          stakedCardIndex: handIdx,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Наследник»${withVB ? ' под Ва-банком' : ''} и берет +1 👑.`
        });
        return;
      }

      if (bot.hand.includes('Шантажист')) {
        const target = selectBestBlackmailerTarget(bot, opponents);
        if (target) {
          const handIdx = bot.hand.indexOf('Шантажист');
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Шантажист',
            roleClaim: 'Шантажист',
            actorId: bot.id,
            targetId: target.id,
            stakedCardIndex: handIdx,
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Шантажирует ${target.name}${withVB ? ' под Ва-банком' : ''}: отнимает 1 👑!`
          });
          return;
        }
      }

      if (bot.hand.includes('Казначей')) {
        const handIdx = bot.hand.indexOf('Казначей');
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Казначей',
          roleClaim: 'Казначей',
          actorId: bot.id,
          stakedCardIndex: handIdx,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Казначей»${withVB ? ' под Ва-банком' : ''} и берет +3 🪙.`
        });
        return;
      }

      if (bot.hand.includes('Вор')) {
        const target = selectBestThiefTarget(bot, opponents);
        if (target && target.gold > 0) {
          const handIdx = bot.hand.indexOf('Вор');
          useGameStore.getState().performAction({
            type: 'role',
            name: 'Вор',
            roleClaim: 'Вор',
            actorId: bot.id,
            targetId: target.id,
            stakedCardIndex: handIdx,
            withVaBanque: withVB,
            costGold: 0,
            costTokens: vbTokens,
            description: `Заявляет «Вор»${withVB ? ' под Ва-банком' : ''} и забирает до 2 🪙 у ${target.name}.`
          });
          return;
        }
      }

      if (bot.hand.includes('Шут')) {
        const handIdx = bot.hand.indexOf('Шут');
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Шут',
          roleClaim: 'Шут',
          actorId: bot.id,
          stakedCardIndex: handIdx,
          withVaBanque: withVB,
          costGold: 0,
          costTokens: vbTokens,
          description: `Заявляет «Шут»${withVB ? ' под Ва-банком' : ''} и получает +2 🪙.`
        });
        return;
      }

      if (bot.hand.includes('Рыцарь')) {
        const handIdx = bot.hand.indexOf('Рыцарь');
        useGameStore.getState().performAction({
          type: 'role',
          name: 'Рыцарь',
          roleClaim: 'Рыцарь',
          actorId: bot.id,
          stakedCardIndex: handIdx,
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
            stakedCardIndex: 0,
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
            stakedCardIndex: 0,
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
        stakedCardIndex: 0,
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
