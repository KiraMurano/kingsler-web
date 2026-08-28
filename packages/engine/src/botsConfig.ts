import type { BotArchetype, Player } from './types';

export interface BotCandidate {
  name: string;
  avatar: string;
  archetype: BotArchetype;
}

/**
 * Двор ботов: восемь персонажей на восемь портретов в `/avatars`.
 *
 * `startGame` перемешивает этот список и сажает столько первых, сколько мест
 * осталось после живых игроков, — поэтому состав двора меняется от партии к
 * партии, а не только имена на чипах.
 *
 * Аватар бота может совпасть с аватаром живого игрока: пул портретов у нас
 * один, и у двух живых игроков они точно так же могут совпасть.
 *
 * Тип характера (`type`) переиспользует пять существующих веток поведения — их
 * читают `botEvaluator`, `botReactions` и `botTurnPlanner`. Два бота одного
 * типа расходятся числами, а не новой веткой в ядре: осторожный Тихон бьёт
 * только по лидеру, осторожная Елена почти не выбирает цель вовсе.
 */
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
  },
  {
    name: 'Аббат Тихон',
    avatar: '/avatars/anton.webp',
    archetype: {
      type: 'cautious',
      title: 'Серый кардинал',
      description: 'Почти не блефует и почти не спорит. Бьет молча и только по лидеру.',
      bluffRate: 0.10,
      doubtAggression: 0.55,
      blockBluffRate: 0.14,
      greed: 0.25,
      targetAggression: 0.95
    }
  },
  {
    name: 'Боярыня Ждана',
    avatar: '/avatars/yulia.webp',
    archetype: {
      type: 'gambler',
      title: 'Мастер интриг',
      description: 'Блефует чаще, чем говорит правду, и хватается за любое золото.',
      bluffRate: 0.60,
      doubtAggression: 1.35,
      blockBluffRate: 0.62,
      greed: 0.85,
      targetAggression: 0.55
    }
  },
  {
    name: 'Кондотьер Ратмир',
    avatar: '/avatars/dima.webp',
    archetype: {
      type: 'provocateur',
      title: 'Дерзкий дуэлянт',
      description: 'Охотно принимает вызов и почти никогда не отступает от барьера.',
      bluffRate: 0.42,
      doubtAggression: 1.30,
      blockBluffRate: 0.66,
      greed: 0.40,
      targetAggression: 0.70
    }
  }
];

/** Тот, чей архетип потерялся: ровная середина по всем шкалам. */
const DEFAULT_ARCHETYPE: BotArchetype = {
  type: 'pragmatic',
  title: 'Придворный',
  description: 'Обычный придворный.',
  bluffRate: 0.35,
  doubtAggression: 1.0,
  blockBluffRate: 0.35,
  greed: 0.5,
  targetAggression: 0.6
};

/**
 * Характер бота берётся с него самого.
 *
 * Раньше сюда можно было передать голый id, и все вызовы в `bot/*` так и
 * делали: `getBotArchetype(bot.id)`. Id раздаются по позиции (`b1`, `b2`, …),
 * а карта id → архетип была построена по порядку `ALL_BOT_CANDIDATES` — то
 * есть за столом всегда думали первые три характера списка, под чужими
 * именами. Перебор кандидатов работал, но виден был только в именах.
 * Поэтому здесь теперь принимается игрок, а не строка.
 */
export function getBotArchetype(bot: Player): BotArchetype {
  return bot.archetype ?? DEFAULT_ARCHETYPE;
}
