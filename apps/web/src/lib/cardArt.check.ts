import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { cardArt, TABLE_ART_WIDTH, type CardArtWidth } from './cardArt.ts';

/* --- сама подстановка ---------------------------------------------------- */
assert.equal(cardArt('/assets/cards/duelist.webp', 512), '/assets/cards/duelist-512.webp');
/* Не арт карты — не трогаем: у аватаров и картинок интерфейса копий нет. */
assert.equal(cardArt('/avatars/anton.webp', 512), '/avatars/anton.webp');
assert.equal(cardArt('/assets/ui/coin-500.webp', 512), '/assets/ui/coin-500.webp');
assert.equal(cardArt(undefined, 512), undefined);

/* --- копии обязаны существовать ------------------------------------------
 *
 * Ради этого проверка и написана. Ссылка на копию собирается из имени файла, а
 * не берётся из списка, поэтому новый арт, не прогнанный через
 * `scripts/gen-card-art.mjs`, ничего не сломает на сборке — он молча станет
 * пустым местом на столе. Здесь это выясняется до деплоя.
 */
const PUBLIC = fileURLToPath(new URL('../../public', import.meta.url));
const WIDTHS: CardArtWidth[] = [256, 512, 768];

const arts = new Set<string>(['/assets/cards/back-dual-face.webp']);
for (const info of Object.values(CARD_DESCRIPTIONS)) {
  if (info.artImage) arts.add(info.artImage);
}
assert.ok(arts.size > 10, `артов подозрительно мало: ${arts.size}`);

const missing: string[] = [];
for (const art of arts) {
  if (!existsSync(PUBLIC + art)) missing.push(`${art} (оригинал)`);
  for (const width of WIDTHS) {
    const copy = cardArt(art, width);
    if (!existsSync(PUBLIC + copy)) missing.push(copy);
  }
}
assert.deepEqual(
  missing,
  [],
  `нет файлов — прогоните scripts/gen-card-art.mjs:\n  ${missing.join('\n  ')}`
);

/* Стол берёт одну из готовых ширин, а не любое число. */
assert.ok(WIDTHS.includes(TABLE_ART_WIDTH));

console.log(`cardArt.check.ts passed (${arts.size} артов × ${WIDTHS.length} копий).`);
