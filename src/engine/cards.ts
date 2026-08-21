export type Role = 
  | 'Наследник' 
  | 'Казначей' 
  | 'Вор' 
  | 'Шантажист' 
  | 'Рыцарь' 
  | 'Шут';

export type PlotType = 
  | 'Королевский приём' 
  | 'Чёрная книга' 
  | 'Сеть информаторов' 
  | 'Досье'
  | 'Королевская грамота'
  | 'Тайный заговор';

export type InstantType = 
  | 'Право вето' 
  | 'Перенаправление' 
  | 'Ва-банк' 
  | 'Дворцовый переполох'
  | 'Шпион';

export type GameCard = Role | PlotType | InstantType;

export type CardCategory = 'role' | 'plot' | 'instant';

export interface CardInfo {
  name: GameCard;
  category: CardCategory;
  title: string;
  badge: string;
  themeColor: string;
  gradient: string;
  borderColor: string;
  artImage: string;
  bottomIcon: string;
  shortDescription: string;
  fullDescription: string;
  cost: number;
  targeted: boolean;
  blockableBy?: Role;
  blocksRole?: Role;
}

export const ALL_ROLES: Role[] = [
  'Наследник',
  'Казначей',
  'Вор',
  'Шантажист',
  'Рыцарь',
  'Шут'
];

export const ALL_PLOTS: PlotType[] = [
  'Королевский приём',
  'Чёрная книга',
  'Сеть информаторов',
  'Досье',
  'Королевская грамота',
  'Тайный заговор'
];

export const ALL_INSTANTS: InstantType[] = [
  'Право вето',
  'Перенаправление',
  'Ва-банк',
  'Дворцовый переполох',
  'Шпион'
];

export const CARD_INFO: Record<GameCard, CardInfo> = {
  // --- 6 РОЛЕЙ ---
  'Наследник': {
    name: 'Наследник',
    category: 'role',
    title: 'Право крови',
    badge: '👑',
    themeColor: '#e11d48',
    gradient: 'linear-gradient(180deg, #881337 0%, #4c0519 50%, #1e1b4b 100%)',
    borderColor: '#fb7185',
    artImage: '/cards/heir.jpg',
    bottomIcon: '👑',
    shortDescription: '+1 👑 Благосклонность.',
    fullDescription: 'Получите +1 👑 Благосклонность короля. Не требует золота, нельзя заблокировать. Можно только проверить («Не верю!»).',
    cost: 0,
    targeted: false
  },
  'Казначей': {
    name: 'Казначей',
    category: 'role',
    title: 'Королевская казна',
    badge: '🏦',
    themeColor: '#16a34a',
    gradient: 'linear-gradient(180deg, #14532d 0%, #052e16 50%, #0f172a 100%)',
    borderColor: '#4ade80',
    artImage: '/cards/treasurer.jpg',
    bottomIcon: '🛡️',
    shortDescription: '+3 💰. Блокирует Вора.',
    fullDescription: 'Получите +3 💰 золота из казны. Также Казначей защищает от Вора, выставляясь щитом на Дуэль.',
    cost: 0,
    targeted: false,
    blocksRole: 'Вор'
  },
  'Вор': {
    name: 'Вор',
    category: 'role',
    title: 'Ловкие пальцы',
    badge: '💰',
    themeColor: '#ca8a04',
    gradient: 'linear-gradient(180deg, #854d0e 0%, #713f12 50%, #0f172a 100%)',
    borderColor: '#eab308',
    artImage: '/cards/spy.jpg',
    bottomIcon: '💰',
    shortDescription: 'Украсть до 2 💰 у выбранного игрока.',
    fullDescription: 'Выберите цель: заберите до 2 💰 монет у игрока. Может быть заблокирован Казначеем на Дуэли.',
    cost: 0,
    targeted: true,
    blockableBy: 'Казначей'
  },
  'Шантажист': {
    name: 'Шантажист',
    category: 'role',
    title: 'Компромат',
    badge: '🗡️',
    themeColor: '#475569',
    gradient: 'linear-gradient(180deg, #334155 0%, #1e293b 50%, #0f172a 100%)',
    borderColor: '#94a3b8',
    artImage: '/cards/heir.jpg',
    bottomIcon: '🗡️',
    shortDescription: 'Украсть 1 👑 у выбранного игрока.',
    fullDescription: 'Выберите игрока с 1+ 👑. Если действие проходит: у него -1 👑, у вас +1 👑. Может быть заблокирован Рыцарем на Дуэли.',
    cost: 0,
    targeted: true,
    blockableBy: 'Рыцарь'
  },
  'Рыцарь': {
    name: 'Рыцарь',
    category: 'role',
    title: 'Королевская защита',
    badge: '🛡️',
    themeColor: '#d97706',
    gradient: 'linear-gradient(180deg, #92400e 0%, #78350f 50%, #0f172a 100%)',
    borderColor: '#fbbf24',
    artImage: '/cards/treasurer.jpg',
    bottomIcon: '🛡️',
    shortDescription: '+2 💰. Блокирует Шантажиста.',
    fullDescription: 'На своем ходу: получите +2 💰 жалования. На защите: Рыцарь блокирует попытку Шантажиста украсть у вас корону 👑 на Дуэли.',
    cost: 0,
    targeted: false,
    blocksRole: 'Шантажист'
  },
  'Шут': {
    name: 'Шут',
    category: 'role',
    title: 'Представление',
    badge: '🃏',
    themeColor: '#db2777',
    gradient: 'linear-gradient(180deg, #9d174d 0%, #831843 50%, #0f172a 100%)',
    borderColor: '#f472b6',
    artImage: '/cards/spy.jpg',
    bottomIcon: '🃏',
    shortDescription: '+2 💰. Если проверили: +1 👑 (ловушка)!',
    fullDescription: 'Если не проверили: получите +2 💰 золота. ЛОВУШКА: если настоящего Шута проверили («Не верю!») — он получает +1 👑 вместо обычной печати +1 ⚜️, а его +2 💰 не срабатывают!',
    cost: 0,
    targeted: false
  },

  // --- 4 ИНТРИГИ 🎴 ---
  'Королевский приём': {
    name: 'Королевский приём',
    category: 'plot',
    title: 'Празднество влияния',
    badge: '👑',
    themeColor: '#ca8a04',
    gradient: 'linear-gradient(180deg, #854d0e 0%, #713f12 50%, #0f172a 100%)',
    borderColor: '#facc15',
    artImage: '/cards/heir.jpg',
    bottomIcon: '👑',
    shortDescription: 'Продержитесь круг → получите +1 👑.',
    fullDescription: 'Выложите перед собой (стоит 1 ⚡). Если карта доживет до начала вашего следующего хода — получите +1 👑 и сбросьте её. Любая потеря монет или короны сжигает приём!',
    cost: 0,
    targeted: false
  },
  'Чёрная книга': {
    name: 'Чёрная книга',
    category: 'plot',
    title: 'Компромат на двор',
    badge: '📕',
    themeColor: '#dc2626',
    gradient: 'linear-gradient(180deg, #991b1b 0%, #7f1d1d 50%, #0f172a 100%)',
    borderColor: '#f87171',
    artImage: '/cards/spy.jpg',
    bottomIcon: '⚜️',
    shortDescription: 'Успешное «Не верю!» дает +1 👑 сразу (без печатей).',
    fullDescription: 'Выложите перед собой (стоит 1 ⚡). Ваше следующее успешное разоблачение блефа («Не верю!») приносит вам сразу +1 👑 напрямую (без печатей), после чего книга сбрасывается. Если проверка ошиблась — сгорает без награды.',
    cost: 0,
    targeted: false
  },
  'Сеть информаторов': {
    name: 'Сеть информаторов',
    category: 'plot',
    title: 'Глаза во дворце',
    badge: '👁',
    themeColor: '#2563eb',
    gradient: 'linear-gradient(180deg, #1e3a8a 0%, #172554 50%, #0f172a 100%)',
    borderColor: '#60a5fa',
    artImage: '/cards/spy.jpg',
    bottomIcon: '💰',
    shortDescription: 'Получаете +1 💰, когда другой игрок объявляет проверку при дворе.',
    fullDescription: 'Выложите перед собой (стоит 1 ⚡). В течение полного круга (до вашего следующего хода) каждый раз, когда ДРУГОЙ игрок объявляет проверку («НЕ ВЕРЮ!») — вы немедленно получаете +1 💰 из казны за перехват дворцовых сведений.',
    cost: 0,
    targeted: false
  },
  'Досье': {
    name: 'Досье',
    category: 'plot',
    title: 'Слежка за врагом',
    badge: '📜',
    themeColor: '#059669',
    gradient: 'linear-gradient(180deg, #065f46 0%, #064e3b 50%, #0f172a 100%)',
    borderColor: '#34d399',
    artImage: '/cards/heir.jpg',
    bottomIcon: '👑',
    shortDescription: 'Цель поймана на блефе → вы получаете +1 👑 напрямую.',
    fullDescription: 'Выложите перед собой (стоит 1 ⚡) и выберите игрока. Когда выбранного игрока ловят на лжи при проверке (кем угодно), вы получаете +1 👑 напрямую, после чего Досье сбрасывается.',
    cost: 0,
    targeted: true
  },
  'Королевская грамота': {
    name: 'Королевская грамота',
    category: 'plot',
    title: 'Золотая печать',
    badge: '📜',
    themeColor: '#d97706',
    gradient: 'linear-gradient(180deg, #b45309 0%, #78350f 50%, #0f172a 100%)',
    borderColor: '#fbbf24',
    artImage: '/cards/treasurer.jpg',
    bottomIcon: '⚜️',
    shortDescription: '+1 💰 за каждую полученную печать ⚜️, а через круг даёт +1 ⚜️.',
    fullDescription: 'Выложите перед собой (стоит 1 ⚡). Действует 1 полный круг. Каждый раз, когда вы получаете королевскую печать (⚜️) за спор или дуэль — вы дополнительно получаете +1 💰 из казны. В начале вашего следующего хода приносит +1 ⚜️ и сбрасывается.',
    cost: 0,
    targeted: false
  },
  'Тайный заговор': {
    name: 'Тайный заговор',
    category: 'plot',
    title: 'Кулуарный бунт',
    badge: '⚔️',
    themeColor: '#7c3aed',
    gradient: 'linear-gradient(180deg, #5b21b6 0%, #3b0764 50%, #0f172a 100%)',
    borderColor: '#a855f7',
    artImage: '/cards/thief.jpg',
    bottomIcon: '💥',
    shortDescription: 'Копит до 4 зарядов. За 2: сброс до 3 💰; за 3: -1 👑; за 4: выбор без Вето!',
    fullDescription: 'Выложите перед собой (стоит 1 ⚡). Накапливает заряды (макс 4) при любых проверках («НЕ ВЕРЮ!»), Дуэлях и кражах Вора/Шантажиста. Можно активировать СРАЗУ при получении заряда (0 ⚡) или в свой ход (1 ⚡). При активации карта сбрасывается: за 2 заряда — сброс до 3 💰 у цели; за 3 заряда — лишить цель 1 👑; за 4 заряда — сброс 3 💰 или 1 👑 БЕЗ возможности Вето.',
    cost: 0,
    targeted: false
  },

  // --- 5 ИНСТАНТОВ ⚡ ---
  'Право вето': {
    name: 'Право вето',
    category: 'instant',
    title: 'Запрет двора',
    badge: '🚫',
    themeColor: '#e11d48',
    gradient: 'linear-gradient(180deg, #9f1239 0%, #4c0519 50%, #18181b 100%)',
    borderColor: '#f43f5e',
    artImage: '/cards/heir.jpg',
    bottomIcon: '🚫',
    shortDescription: 'Отменяет эффект роли или интриги (бесплатно, 0 ⚡).',
    fullDescription: 'Реактивный инстант ⚡ (бесплатно, 0 ⚡). Играется непосредственно перед применением эффекта Роли или Интриги. Полностью отменяет этот эффект (печати за спор при этом остаются). В колоде 5 таких карт.',
    cost: 0,
    targeted: false
  },
  'Перенаправление': {
    name: 'Перенаправление',
    category: 'instant',
    title: 'Ложный след',
    badge: '🔀',
    themeColor: '#d97706',
    gradient: 'linear-gradient(180deg, #b45309 0%, #78350f 50%, #18181b 100%)',
    borderColor: '#f59e0b',
    artImage: '/cards/spy.jpg',
    bottomIcon: '🔀',
    shortDescription: 'Переключает цель атаки на другого игрока (бесплатно, 0 ⚡).',
    fullDescription: 'Реактивный инстант ⚡ (бесплатно, 0 ⚡). Играется сразу после объявления целевой атаки (Вор, Шантажист). Меняет цель атаки на другого допустимого игрока.',
    cost: 0,
    targeted: true
  },
  'Ва-банк': {
    name: 'Ва-банк',
    category: 'instant',
    title: 'Высшая ставка',
    badge: '🎲',
    themeColor: '#9333ea',
    gradient: 'linear-gradient(180deg, #6b21a8 0%, #3b0764 50%, #18181b 100%)',
    borderColor: '#c084fc',
    artImage: '/cards/spy.jpg',
    bottomIcon: '⚜️',
    shortDescription: 'Модификатор x2 к роли при проверке.',
    fullDescription: 'Инстант-модификатор ⚡. Играется только в свой ход вместе с картой Роли как единое действие (стоит 1 ⚡). Если вас проверят и там правда — вы получаете удвоенный эффект роли (+2 👑/+6 💰/+4 💰/кража x2, Шут: +4 💰 и +1 👑), а печати отменяются. Если блеф — сомневавшийся получает +2 ⚜️. На дуэли крадет x2, ничья дает по 1 ⚜️, а при проигрыше дуэли победитель берет +2 ⚜️. Без проверки срабатывает обычный эффект x1.',
    cost: 0,
    targeted: false
  },
  'Дворцовый переполох': {
    name: 'Дворцовый переполох',
    category: 'instant',
    title: 'Суматоха во дворце',
    badge: '⚡',
    themeColor: '#0284c7',
    gradient: 'linear-gradient(180deg, #0369a1 0%, #082f49 50%, #18181b 100%)',
    borderColor: '#38bdf8',
    artImage: '/cards/treasurer.jpg',
    bottomIcon: '🔄',
    shortDescription: 'Цель сбрасывает руку и берет 2 новые.',
    fullDescription: 'Инстант ⚡ (1 жетон действия). Играется в свой ход или между действиями. Выбранный игрок сбрасывает обе карты из руки и берет 2 новые из колоды. Нельзя играть во время активного действия/спора.',
    cost: 0,
    targeted: true
  },
  'Шпион': {
    name: 'Шпион',
    category: 'instant',
    title: 'Тайный надзор',
    badge: '👁️',
    themeColor: '#6366f1',
    gradient: 'linear-gradient(180deg, #3730a3 0%, #1e1b4b 50%, #0f172a 100%)',
    borderColor: '#818cf8',
    artImage: '/cards/spy.jpg',
    bottomIcon: '👁️',
    shortDescription: 'Посмотреть обе карты выбранного игрока.',
    fullDescription: 'Инстант ⚡ (1 жетон действия). Выберите игрока: вы тайно смотрите обе карты из его руки. Себе ничего не забираете. Дает стратегическую информацию для будущих споров.',
    cost: 0,
    targeted: true
  }
};

export function isRole(card: GameCard): card is Role {
  return ALL_ROLES.includes(card as Role);
}

export function isPlot(card: GameCard): card is PlotType {
  return ALL_PLOTS.includes(card as PlotType);
}

export function isInstant(card: GameCard): card is InstantType {
  return ALL_INSTANTS.includes(card as InstantType);
}

/**
 * Создает полную колоду из 44 карт:
 * - 6 Ролей × 3 копии = 18 карт
 * - 6 Интриг: 5 типов × 2 + Тайный заговор × 3 = 13 карт
 * - 5 Инстантов:
 *   - Право вето × 5 копий
 *   - Перенаправление × 2 копии
 *   - Ва-банк × 2 копии
 *   - Дворцовый переполох × 2 копии
 *   - Шпион × 2 копии
 *   = 13 карт
 * Итого: 44 карты
 */
export function createInitialDeck(): GameCard[] {
  const deck: GameCard[] = [];

  // 18 ролевых карт (6 ролей × 3)
  for (const role of ALL_ROLES) {
    deck.push(role, role, role);
  }

  // 13 карт интриг (5 типов × 2 + 1 дополнительный Тайный заговор)
  for (const plot of ALL_PLOTS) {
    deck.push(plot, plot);
  }
  deck.push('Тайный заговор'); // 3-я копия Тайного заговора

  // 13 карт инстантов:
  deck.push('Право вето', 'Право вето', 'Право вето', 'Право вето', 'Право вето');
  deck.push('Перенаправление', 'Перенаправление');
  deck.push('Ва-банк', 'Ва-банк');
  deck.push('Дворцовый переполох', 'Дворцовый переполох');
  deck.push('Шпион', 'Шпион');

  // Перемешивание алгоритмом Фишера-Йетса
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

export function drawCardsFromDeck(
  count: number, 
  deck: GameCard[], 
  discardPile: GameCard[]
): { drawn: GameCard[]; deck: GameCard[]; discardPile: GameCard[]; wasReshuffled: boolean; reshuffledCount: number } {
  let curDeck = [...deck];
  let curDiscard = [...discardPile];
  const drawn: GameCard[] = [];
  let wasReshuffled = false;
  let reshuffledCount = 0;

  for (let i = 0; i < count; i++) {
    if (curDeck.length === 0) {
      if (curDiscard.length === 0) {
        drawn.push('Наследник');
        continue;
      }
      wasReshuffled = true;
      reshuffledCount = curDiscard.length;
      curDeck = [...curDiscard];
      curDiscard = [];
      for (let j = curDeck.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [curDeck[j], curDeck[k]] = [curDeck[k], curDeck[j]];
      }
    }
    const card = curDeck.pop();
    if (card) {
      drawn.push(card);
    }
  }

  return { drawn, deck: curDeck, discardPile: curDiscard, wasReshuffled, reshuffledCount };
}

