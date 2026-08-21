import type { GameCard, Role } from '../types';
import { isRole } from '../cards';

export interface KnownCardRecord {
  playerId: string;
  cardIndex: number;
  role: GameCard;
  knownByBotIds: string[];
}

export class BotMemoryEngine {
  private knownCards: KnownCardRecord[] = [];
  private consecutiveRoleClaims: Record<string, { role: Role; count: number }> = {};

  /**
   * Записывает результат просмотра карты через инстант «Шпион».
   */
  public recordSpyPeek(botId: string, targetId: string, cardIndex: number, seenRole: GameCard): void {
    this.knownCards = this.knownCards.filter(
      k => !(k.playerId === targetId && k.cardIndex === cardIndex)
    );
    this.knownCards.push({
      playerId: targetId,
      cardIndex,
      role: seenRole,
      knownByBotIds: [botId]
    });
  }

  /**
   * Записывает карту в конкретном слоте оппонента для наблюдателя.
   */
  public recordCardInSlot(targetId: string, cardIndex: number, role: GameCard, observerId: string): void {
    const existing = this.knownCards.find(k => k.playerId === targetId && k.cardIndex === cardIndex);
    if (existing && existing.role === role) {
      if (!existing.knownByBotIds.includes(observerId)) {
        existing.knownByBotIds.push(observerId);
      }
      return;
    }

    this.knownCards = this.knownCards.filter(
      k => !(k.playerId === targetId && k.cardIndex === cardIndex)
    );
    this.knownCards.push({
      playerId: targetId,
      cardIndex,
      role,
      knownByBotIds: [observerId]
    });
  }

  /**
   * Записывает просмотр через интригу «Сеть информаторов» или другие источники.
   */
  public recordInformantPeek(observerId: string, targetId: string, seenRole: GameCard): void {
    const existing = this.knownCards.find(
      k => k.playerId === targetId && k.role === seenRole
    );
    if (existing) {
      if (!existing.knownByBotIds.includes(observerId)) {
        existing.knownByBotIds.push(observerId);
      }
    } else {
      this.knownCards.push({
        playerId: targetId,
        cardIndex: 0,
        role: seenRole,
        knownByBotIds: [observerId]
      });
    }
  }

  /**
   * Отслеживает последовательные заявления одной и той же роли игроком.
   */
  public recordRoleClaim(playerId: string, role: Role): void {
    const current = this.consecutiveRoleClaims[playerId];
    if (current && current.role === role) {
      this.consecutiveRoleClaims[playerId] = { role, count: current.count + 1 };
    } else {
      this.consecutiveRoleClaims[playerId] = { role, count: 1 };
    }
  }

  /**
   * Возвращает количество последовательных ходов, в которых игрок заявлял эту роль.
   */
  public getConsecutiveRoleClaims(playerId: string, role: Role): number {
    const current = this.consecutiveRoleClaims[playerId];
    if (current && current.role === role) {
      return current.count;
    }
    return 0;
  }

  /**
   * Удаляет раскрытую или сброшенную карту из памяти руки игрока.
   */
  public recordRevealedCard(targetId: string, role: GameCard): void {
    const idx = this.knownCards.findIndex(k => k.playerId === targetId && k.role === role);
    if (idx !== -1) {
      this.knownCards.splice(idx, 1);
    }
    if (isRole(role) && this.consecutiveRoleClaims[targetId]?.role === role) {
      this.consecutiveRoleClaims[targetId] = { role, count: 0 };
    }
  }

  /**
   * Сбрасывает память о руке игрока при смене карт (например, «Дворцовый переполох» или смена карты).
   */
  public invalidatePlayerHand(playerId: string): void {
    this.knownCards = this.knownCards.filter(k => k.playerId !== playerId);
    delete this.consecutiveRoleClaims[playerId];
  }

  /**
   * Возвращает список карт цели, известных конкретному боту.
   */
  public getKnownCardsForBot(botId: string, targetId: string): GameCard[] {
    return this.knownCards
      .filter(k => k.playerId === targetId && k.knownByBotIds.includes(botId))
      .map(k => k.role);
  }

  /**
   * Возвращает все известные боту карты у ВСЕХ оппонентов (для точного подсчета копий в игре).
   */
  public getAllKnownRoleCardsForBot(botId: string, excludePlayerId?: string): Role[] {
    return this.knownCards
      .filter(k => k.playerId !== excludePlayerId && k.knownByBotIds.includes(botId) && isRole(k.role))
      .map(k => k.role as Role);
  }

  /**
   * Проверяет, знает ли бот о наличии карты-блокера у цели (например, «Казначей» или «Рыцарь»).
   */
  public isCounterCardKnown(botId: string, targetId: string, counterRole: Role): boolean {
    return this.knownCards.some(
      k => k.playerId === targetId && k.knownByBotIds.includes(botId) && k.role === counterRole
    );
  }

  /**
   * Проверяет, есть ли у бота информация хотя бы об одной карте цели.
   */
  public hasKnownCards(botId: string, targetId: string): boolean {
    return this.knownCards.some(
      k => k.playerId === targetId && k.knownByBotIds.includes(botId)
    );
  }

  /**
   * Полный сброс памяти при новой партии.
   */
  public clear(): void {
    this.knownCards = [];
    this.consecutiveRoleClaims = {};
  }
}

export const botMemory = new BotMemoryEngine();
