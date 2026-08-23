/** Glyphs the interface is allowed to show: coins, crowns, action tokens, seals. */
const KEEP = new Set(['👑', '🪙', '⚡', '⚜']);

const PICTOGRAPH = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

/**
 * The rules engine writes its log lines and action names with decorative
 * pictograms baked in. Strip everything that is not a resource glyph so the
 * interface stays typographic instead of a wall of icons.
 */
export function courtly(text: string): string {
  return text
    .replace(PICTOGRAPH, match => (KEEP.has(match.replace(/\uFE0F/g, '')) ? match : ''))
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\s+([,.!?;:»])/g, '$1')
    .replace(/(«)\s+/g, '$1')
    .trim();
}

export type ResourceDeltaKind = 'act' | 'crown' | 'gold' | 'seal' | 'other';

export function resourceDeltaKind(text: string): ResourceDeltaKind {
  if (text.includes('⚡')) return 'act';
  if (text.includes('👑')) return 'crown';
  if (text.includes('🪙')) return 'gold';
  if (text.includes('⚜️') || text.includes('⚜')) return 'seal';
  return 'other';
}
