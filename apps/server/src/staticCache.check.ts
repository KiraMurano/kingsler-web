/**
 * Сколько браузеру держать статику.
 *
 * Дефект, ради которого написан этот файл: `express.static` по умолчанию ставит
 * `max-age=0`, и браузер переспрашивал КАЖДУЮ картинку при каждом показе.
 * Байты возвращались как `304`, но круг по сети всё равно приходилось ждать —
 * ровно в тот момент, когда карту кладут на стол, и арт проявлялся уже после
 * неё. Локально этого не видно: файл берётся с диска.
 *
 * Run: npx tsx apps/server/src/staticCache.check.ts
 */
import assert from 'node:assert/strict';
import type express from 'express';
import { cacheHeaders } from './staticCache.ts';

/** Подставная `res`: нас интересует единственный заголовок, который она получит. */
function headerFor(filePath: string): string | undefined {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    }
  } as unknown as express.Response;
  cacheHeaders(res, filePath);
  return headers['Cache-Control'];
}

// Разметка не кэшируется вовсе: в ней записаны имена собранных бандлов, и
// закэшированная она увела бы игрока на прошлую версию после деплоя.
assert.equal(headerFor('/repo/apps/web/dist/index.html'), 'no-cache');

// Бандлы названы по хэшу содержимого — их содержимое не меняется никогда,
// меняется имя. Значит год и `immutable`.
for (const file of [
  '/repo/apps/web/dist/assets/index-DCUlyr6Z.js',
  '/repo/apps/web/dist/assets/index-DnrCiYn7.css',
  'C:\\repo\\apps\\web\\dist\\assets\\index-DCUlyr6Z.js'
]) {
  assert.equal(
    headerFor(file),
    'public, max-age=31536000, immutable',
    `бандл с хэшем в имени кэшируется навсегда: ${file}`
  );
}

// Арты, аватары и шрифт имена имеют постоянные — сутки, а не год: свежий арт
// доедет до игрока на следующий день, а не через год.
for (const file of [
  '/repo/apps/web/dist/assets/cards/heir.webp',
  '/repo/apps/web/dist/assets/common-actions/action-feast.webp',
  '/repo/apps/web/dist/avatars/dima.webp',
  '/repo/apps/web/dist/assets/Vinque Rg.otf'
]) {
  assert.equal(headerFor(file), 'public, max-age=86400', `постоянное имя — сутки: ${file}`);
}

/* Файл с «index-» в имени, но не собранный бандл, за бандл не выдаётся:
   правило смотрит на всю дорожку целиком, а не на одно слово в имени. */
assert.equal(
  headerFor('/repo/apps/web/dist/assets/cards/index-card.webp'),
  'public, max-age=86400',
  'картинка не становится вечной оттого, что её назвали index-*'
);

console.log('staticCache.check: ok');
