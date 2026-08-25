export const PROFILE_AVATARS = [
  '/avatars/anton.webp',
  '/avatars/yulia.webp',
  '/avatars/sasha.webp',
  '/avatars/masha.webp',
  '/avatars/dima.webp',
  '/avatars/bot1.webp',
  '/avatars/bot2.webp',
  '/avatars/bot3.webp'
] as const;

export const PROFILE_TITLES = [
  'Претендент',
  'Азартный игрок',
  'Осторожный стратег',
  'Прагматик',
  'Провокатор',
  'Оппортунист'
] as const;

export type ProfileAvatar = (typeof PROFILE_AVATARS)[number];
export type ProfileTitle = (typeof PROFILE_TITLES)[number];

export const DEFAULT_PROFILE_AVATAR: ProfileAvatar = PROFILE_AVATARS[0];
export const DEFAULT_PROFILE_TITLE: ProfileTitle = PROFILE_TITLES[0];

export const isProfileAvatar = (value: unknown): value is ProfileAvatar =>
  typeof value === 'string' && PROFILE_AVATARS.includes(value as ProfileAvatar);

export const isProfileTitle = (value: unknown): value is ProfileTitle =>
  typeof value === 'string' && PROFILE_TITLES.includes(value as ProfileTitle);
