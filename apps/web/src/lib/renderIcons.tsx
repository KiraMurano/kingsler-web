import React from 'react';
import { UiIcon, type UiIconKind, type UiIconSize } from '../components/ui/Icon';

const EMOJI_TO_KIND: Record<string, UiIconKind> = {
  '🪙': 'coin',
  '👑': 'crown',
  '⚜️': 'bulla',
  '⚜': 'bulla',
  '⚡': 'move'
};

const ICON_SPLIT_REGEX = /(🪙|👑|⚜️|⚜|⚡)/g;

/**
 * Replaces game resource emojis in text with crisp inline WebP icons.
 */
export function renderWithIcons(text: React.ReactNode, size: UiIconSize = 'sm'): React.ReactNode {
  if (typeof text !== 'string') return text;
  if (!ICON_SPLIT_REGEX.test(text)) return text;

  ICON_SPLIT_REGEX.lastIndex = 0;
  const parts = text.split(ICON_SPLIT_REGEX);

  return parts.map((part, index) => {
    const kind = EMOJI_TO_KIND[part];
    if (kind) {
      return <UiIcon key={index} kind={kind} size={size} />;
    }
    return part;
  });
}
