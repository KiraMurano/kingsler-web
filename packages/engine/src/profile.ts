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
  'Азартный игрок',
  'Осторожный стратег',
  'Прагматик',
  'Провокатор',
  'Оппортунист',
  'Тайный советник',
  'Серый кардинал',
  'Мастер интриг',
  'Дерзкий дуэлянт',
  'Фаворит двора'
] as const;

export type ProfileAvatar = (typeof PROFILE_AVATARS)[number];
export type ProfileTitle = (typeof PROFILE_TITLES)[number];

export const DEFAULT_PROFILE_AVATAR: ProfileAvatar = PROFILE_AVATARS[0];
export const DEFAULT_PROFILE_TITLE: ProfileTitle = PROFILE_TITLES[0];

export const isProfileAvatar = (value: unknown): value is ProfileAvatar =>
  typeof value === 'string' && PROFILE_AVATARS.includes(value as ProfileAvatar);

export const isProfileTitle = (value: unknown): value is ProfileTitle =>
  typeof value === 'string' && PROFILE_TITLES.includes(value as ProfileTitle);

/**
 * Nickname validation rules:
 * - Only Latin letters (a-z, A-Z) and digits (0-9).
 * - Maximum one space total, not at the beginning and not at the end.
 * - Length between 3 and 12 characters.
 */
export const NICKNAME_REGEX = /^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)?$/;

export function isValidNickname(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 3 &&
    value.length <= 12 &&
    NICKNAME_REGEX.test(value)
  );
}

export function sanitizeNicknameInput(input: string): string {
  // 1. Keep only Latin letters, numbers, and spaces
  let cleaned = input.replace(/[^a-zA-Z0-9 ]/g, '');
  // 2. Remove leading spaces
  cleaned = cleaned.replace(/^ +/, '');
  // 3. Keep at most one space in the whole string
  const spaceIndex = cleaned.indexOf(' ');
  if (spaceIndex !== -1) {
    const beforeSpace = cleaned.slice(0, spaceIndex + 1);
    const afterSpace = cleaned.slice(spaceIndex + 1).replace(/ /g, '');
    cleaned = beforeSpace + afterSpace;
  }
  // 4. Maximum length of 12 characters
  return cleaned.slice(0, 12);
}
