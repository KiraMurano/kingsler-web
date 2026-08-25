import type { BotArchetype, Player } from './types';

export interface BotCandidate {
  name: string;
  avatar: string;
  archetype: BotArchetype;
}

export const ALL_BOT_CANDIDATES: BotCandidate[] = [
  {
    name: 'Барон Дима',
    avatar: '/avatars/sasha.webp',
    archetype: {
      type: 'gambler',
      title: 'Азартный игрок',
      description: 'Часто рискует и блефует. Удваивает ставки.',
      bluffRate: 0.52,
      doubtAggression: 1.15,
      blockBluffRate: 0.50,
      greed: 0.7,
      targetAggression: 0.75
    }
  },
  {
    name: 'Графиня Елена',
    avatar: '/avatars/bot2.webp',
    archetype: {
      type: 'cautious',
      title: 'Осторожный стратег',
      description: 'Редко блефует. Проверяет только при высокой уверенности.',
      bluffRate: 0.15,
      doubtAggression: 0.70,
      blockBluffRate: 0.20,
      greed: 0.3,
      targetAggression: 0.4
    }
  },
  {
    name: 'Герцог Виктор',
    avatar: '/avatars/bot1.webp',
    archetype: {
      type: 'pragmatic',
      title: 'Прагматик',
      description: 'Атакует только лидеров. Оценивает шансы математически.',
      bluffRate: 0.30,
      doubtAggression: 1.00,
      blockBluffRate: 0.35,
      greed: 0.5,
      targetAggression: 0.9
    }
  },
  {
    name: 'Маркиз Вадим',
    avatar: '/avatars/bot3.webp',
    archetype: {
      type: 'provocateur',
      title: 'Провокатор',
      description: 'Ставит ловушки Шутом, плетет Интриги и провоцирует соперников.',
      bluffRate: 0.48,
      doubtAggression: 1.20,
      blockBluffRate: 0.50,
      greed: 0.65,
      targetAggression: 0.8
    }
  },
  {
    name: 'Княгиня Анна',
    avatar: '/avatars/masha.webp',
    archetype: {
      type: 'opportunist',
      title: 'Оппортунист',
      description: 'Крадет ресурсы в самый уязвимый момент.',
      bluffRate: 0.38,
      doubtAggression: 1.05,
      blockBluffRate: 0.40,
      greed: 0.9,
      targetAggression: 0.85
    }
  }
];

export const BOT_ARCHETYPES: Record<string, BotArchetype> = {
  b1: ALL_BOT_CANDIDATES[0].archetype,
  b2: ALL_BOT_CANDIDATES[1].archetype,
  b3: ALL_BOT_CANDIDATES[2].archetype,
  b4: ALL_BOT_CANDIDATES[3].archetype,
  b5: ALL_BOT_CANDIDATES[4].archetype
};

export function getBotArchetype(botOrId: Player | string): BotArchetype {
  if (typeof botOrId !== 'string' && botOrId.archetype) {
    return botOrId.archetype;
  }
  const id = typeof botOrId === 'string' ? botOrId : botOrId.id;
  return BOT_ARCHETYPES[id] || {
    type: 'pragmatic',
    title: 'Придворный',
    description: 'Обычный придворный.',
    bluffRate: 0.35,
    doubtAggression: 1.0,
    blockBluffRate: 0.35,
    greed: 0.5,
    targetAggression: 0.6
  };
}
