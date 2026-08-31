import { ALL_ROLES, CARD_INFO, type Role, type CardInfo } from './cards';

export { ALL_ROLES, type Role };
export type RoleInfo = CardInfo;
export const ROLE_INFO = CARD_INFO;

/**
 * Кто выходит на дуэль против атакующей роли.
 *
 * Раньше щитов было два — Казначей против Вора, Рыцарь против Шантажиста, —
 * и эта развилка жила отдельной строкой в движке дуэли и в реакциях ботов.
 * Двор остался с одним фехтовальщиком, и развилка выродилась в константу; но
 * объявлена она здесь, а не подставлена в оба места руками, потому что именно
 * так эти две копии однажды и разошлись бы.
 *
 * `null` — атака, от которой на дуэли не защищаются вовсе.
 */
export function duelShieldFor(attack: Role): Role | null {
  return attack === 'Вор' || attack === 'Шантажист' ? 'Дуэлянт' : null;
}
