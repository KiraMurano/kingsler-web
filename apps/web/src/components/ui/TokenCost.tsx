/**
 * Значок стоимости действия: молния, а поверх неё — красный запрет, когда
 * жетона нет.
 *
 * Раньше об этом сообщала подпись под текстом кнопки («1 ⚡», «нет ⚡»), из-за
 * чего кнопка обзаводилась второй строкой и ряд подпрыгивал. Значок стоит в
 * одной строке с названием и высоты не меняет — ни когда действие доступно,
 * ни когда запрещено.
 */
import React from 'react';
import { Ban } from 'lucide-react';
import { UiIcon } from './Icon';

export const TokenCost: React.FC<{ blocked?: boolean; size?: 'xs' | 'sm' }> = ({
  blocked,
  size = 'sm'
}) => (
  <span
    className={`tokencost ${blocked ? 'tokencost--blocked' : ''}`}
    aria-label={blocked ? 'нет жетона действия' : 'стоит один жетон действия'}
  >
    <UiIcon kind="move" size={size} />
    {blocked && <Ban className="tokencost__ban" size={18} strokeWidth={2.25} aria-hidden />}
  </span>
);
