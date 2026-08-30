/**
 * Картинка для письма с кодом входа.
 *
 * Исходник — постер `apps/web/public/art/main.webp` в том же формате и размере,
 * что и арты карт. В письмо он идёт JPEG'ом: игра нарисована в webp, но Outlook
 * webp не показывает вовсе, и фон письма стал бы чёрным прямоугольником у
 * заметной части адресатов.
 *
 * Показывается он в 600×900, отдаём 900×1350 — полторы плотности. Двойная
 * (1200) была бы дорисованной: исходник сам 1024 в ширину. Вес важен отдельно:
 * письмо с картинкой в полмегабайта часть ящиков обрезает.
 *
 * Запуск (sharp намеренно НЕ в зависимостях проекта — нативный пакет в
 * lock-файле ломает сборку образа на сервере, см. deploy-to-vps):
 *
 *   mkdir -p /tmp/imgtool && cd /tmp/imgtool \
 *     && npm init -y >/dev/null && npm i sharp >/dev/null \
 *     && cd - >/dev/null \
 *     && NODE_PATH=/tmp/imgtool/node_modules node scripts/gen-email-art.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('Нужен sharp. Как его дать скрипту — в комментарии сверху.');
  process.exit(1);
}

const SRC = 'apps/web/public/art/main.webp';
const OUT = 'apps/web/public/assets/email/hero-poster.jpg';

const info = await sharp(SRC)
  .resize({ width: 900 })
  .jpeg({ quality: 80, progressive: true, chromaSubsampling: '4:2:0' })
  .toFile(OUT);

console.log(`${OUT} — ${info.width}×${info.height}, ${Math.round(info.size / 1024)}K`);
