import type { Role } from './types';

export const ALL_ROLES: Role[] = [
  'Наследник',
  'Казначей',
  'Вор',
  'Шпион',
  'Шантажист',
  'Рыцарь',
  'Шут',
  'Интриган'
];

export interface RoleInfo {
  name: Role;
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

export const ROLE_INFO: Record<Role, RoleInfo> = {
  'Наследник': {
    name: 'Наследник',
    title: 'Право крови',
    badge: '👑',
    themeColor: '#e11d48', // Crimson red
    gradient: 'linear-gradient(180deg, #881337 0%, #4c0519 50%, #1e1b4b 100%)',
    borderColor: '#fb7185',
    artImage: '/cards/heir.jpg',
    bottomIcon: '👑',
    shortDescription: '+1 👑 Благосклонность.',
    fullDescription: 'Получите +1 👑 Благосклонность короля. Не требует золота, нельзя заблокировать. Можно только обвинить во лжи.',
    cost: 0,
    targeted: false
  },
  'Казначей': {
    name: 'Казначей',
    title: 'Королевская казна',
    badge: '🏦',
    themeColor: '#16a34a', // Emerald green
    gradient: 'linear-gradient(180deg, #14532d 0%, #052e16 50%, #0f172a 100%)',
    borderColor: '#4ade80',
    artImage: '/cards/treasurer.jpg',
    bottomIcon: '🛡️',
    shortDescription: '+3 💰. Блокирует Вора.',
    fullDescription: 'Получите 3 золотых из казны. Также Казначей может блокировать попытки Вора украсть у вас золото.',
    cost: 0,
    targeted: false,
    blocksRole: 'Вор'
  },
  'Вор': {
    name: 'Вор',
    title: 'Карманник',
    badge: '💰',
    themeColor: '#0284c7', // Sky / Azure Blue
    gradient: 'linear-gradient(180deg, #075985 0%, #0c4a6e 50%, #0f172a 100%)',
    borderColor: '#38bdf8',
    artImage: '/cards/ambassador.jpg',
    bottomIcon: '💰',
    shortDescription: 'Украсть до 2 💰 у выбранного игрока.',
    fullDescription: 'Выберите игрока и заберите у него до 2 💰 золота. Может быть заблокирован Казначеем.',
    cost: 0,
    targeted: true,
    blockableBy: 'Казначей'
  },
  'Шпион': {
    name: 'Шпион',
    title: 'Тайное расследование',
    badge: '👁️',
    themeColor: '#7c3aed', // Royal Violet / Purple
    gradient: 'linear-gradient(180deg, #581c87 0%, #3b0764 50%, #0f172a 100%)',
    borderColor: '#c084fc',
    artImage: '/cards/spy.jpg',
    bottomIcon: '👁️',
    shortDescription: 'Посмотрите 1 карту игрока. Можно заменить свою.',
    fullDescription: 'Выберите игрока и одну из его карт. Только вы увидите ее. После этого можете заменить одну свою карту на случайную из колоды.',
    cost: 0,
    targeted: true
  },
  'Шантажист': {
    name: 'Шантажист',
    title: 'Компромат',
    badge: '🗡️',
    themeColor: '#475569', // Dark Slate / Shadow
    gradient: 'linear-gradient(180deg, #334155 0%, #1e293b 50%, #0f172a 100%)',
    borderColor: '#94a3b8',
    artImage: '/cards/heir.jpg',
    bottomIcon: '🗡️',
    shortDescription: 'За 2 💰: украсть 1 👑 у игрока.',
    fullDescription: 'Заплатите 2 💰. Выберите игрока (с 1+ 👑). Если действие проходит: у него -1 👑, у вас +1 👑. Может быть заблокирован Рыцарем.',
    cost: 2,
    targeted: true,
    blockableBy: 'Рыцарь'
  },
  'Рыцарь': {
    name: 'Рыцарь',
    title: 'Королевская защита',
    badge: '🛡️',
    themeColor: '#d97706', // Amber / Bronze
    gradient: 'linear-gradient(180deg, #92400e 0%, #78350f 50%, #0f172a 100%)',
    borderColor: '#fbbf24',
    artImage: '/cards/treasurer.jpg',
    bottomIcon: '🛡️',
    shortDescription: '+2 💰. Блокирует Шантажиста.',
    fullDescription: 'На своем ходу: получите +2 💰. Кроме того, Рыцарь может заблокировать попытку Шантажиста украсть у вас корону 👑.',
    cost: 0,
    targeted: false,
    blocksRole: 'Шантажист'
  },
  'Шут': {
    name: 'Шут',
    title: 'Представление',
    badge: '🃏',
    themeColor: '#db2777', // Magenta / Pink
    gradient: 'linear-gradient(180deg, #9d174d 0%, #831843 50%, #0f172a 100%)',
    borderColor: '#f472b6',
    artImage: '/cards/spy.jpg',
    bottomIcon: '🃏',
    shortDescription: '+2 💰. При ложном обвинении: +1 👑!',
    fullDescription: 'Получите +2 💰. Особенность: если кто-то усомнится в вас, а вы действительно Шут — обвинитель теряет -1 ❤️, а вы получаете +1 👑!',
    cost: 0,
    targeted: false
  },
  'Интриган': {
    name: 'Интриган',
    title: 'Дворцовые интриги',
    badge: '🎭',
    themeColor: '#0d9488', // Teal
    gradient: 'linear-gradient(180deg, #115e59 0%, #134e4a 50%, #0f172a 100%)',
    borderColor: '#2dd4bf',
    artImage: '/cards/ambassador.jpg',
    bottomIcon: '🎭',
    shortDescription: 'Замешать и сменить ОБЕ карты у цели.',
    fullDescription: 'Выберите любого игрока. Он обязан замешать обе свои карты в колоду и взять две новые случайные карты, полностью сбрасывая подготовленные комбинации!',
    cost: 0,
    targeted: true
  }
};
