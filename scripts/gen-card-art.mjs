/**
 * Уменьшённые копии артов карт.
 *
 * Исходники — 1024×1536, и распакованный битмап каждого весит шесть мегабайт
 * независимо от того, каким размером карту показали. Платит за это память: на
 * лендинге живьём висит полтора десятка артов, а строке кодекса шириной сорок
 * пикселей полный исходник избыточен в двадцать пять раз по площади.
 *
 * Ступени подобраны под замеры самих поверхностей (в пикселях макета — см.
 * `lib/uiScale.ts`) с запасом 4.5 физических пикселя на пиксель макета. Запас
 * не с потолка: 4K при `devicePixelRatio` 1 требует ровно 3.0, 5K Retina —
 * 4.0. Ниже 3.0 опускаться нельзя, это уже мыло на 4K.
 *
 *   256 → до  57 px макета — строка кодекса (40)
 *   512 → до 113 px макета — фон меню (115), мелкие плашки
 *   768 → до 170 px макета — рука (154), веер (165), крупный план (176)
 *
 * Оригиналы остаются на месте: их берут плитки лендинга, где арт растянут
 * по ширине 308 px макета и меньшая копия была бы шагом назад.
 *
 * Запуск (sharp намеренно НЕ в зависимостях проекта — нативный пакет в
 * lock-файле ломает сборку образа на сервере, см. deploy-to-vps):
 *
 *   mkdir -p /tmp/imgtool && cd /tmp/imgtool \
 *     && npm init -y >/dev/null && npm i sharp >/dev/null \
 *     && cd - >/dev/null \
 *     && NODE_PATH=/tmp/imgtool/node_modules node scripts/gen-card-art.mjs
 */
import { readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('Нужен sharp. Как его дать скрипту — в комментарии сверху.');
  process.exit(1);
}

const DIR = 'apps/web/public/assets/cards';
const WIDTHS = [256, 512, 768];
/** Тот же профиль, что у исходников: заметной разницы на глаз нет, вес ниже. */
const WEBP = { quality: 82, effort: 5 };

const variant = /-(\d+)\.webp$/;

const files = (await readdir(DIR))
  .filter(f => f.endsWith('.webp') && !variant.test(f))
  .sort();

let before = 0;
let after = 0;

for (const file of files) {
  const src = join(DIR, file);
  before += (await stat(src)).size;
  const name = basename(file, '.webp');
  const meta = await sharp(src).metadata();

  for (const width of WIDTHS) {
    if (meta.width <= width) {
      console.log(`${file}: исходник ${meta.width}px, копия ${width}px не нужна`);
      continue;
    }
    const out = join(DIR, `${name}-${width}.webp`);
    const info = await sharp(src).resize({ width }).webp(WEBP).toFile(out);
    after += info.size;
    console.log(`${name}-${width}.webp  ${info.width}×${info.height}  ${Math.round(info.size / 1024)}K`);
  }
}

console.log(`\nисходников: ${files.length}, ${(before / 1024 / 1024).toFixed(1)} МБ`);
console.log(`копий: ${files.length * WIDTHS.length}, ${(after / 1024 / 1024).toFixed(1)} МБ`);
