/**
 * Run: npx tsx apps/server/src/auth/email.check.ts
 */
import assert from 'node:assert/strict';

process.env.RESEND_API_KEY = 'test-key';
process.env.MAGIC_LINK_FROM = 'Kinglier <auth@send.kingsler.ru>';

const originalFetch = globalThis.fetch;
let capturedRequest: { url: string; init: RequestInit } | null = null;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  capturedRequest = { url: String(url), init: init! };
  return new Response('{}', { status: 200 });
}) as typeof fetch;

const { sendMagicLinkEmail } = await import('./email.ts');

await sendMagicLinkEmail(
  'ivan@example.com',
  'https://kingsler.ru/api/auth/verify?token=abc',
  '042731'
);

assert.ok(capturedRequest, 'sendMagicLinkEmail must call fetch');
assert.equal(capturedRequest!.url, 'https://api.resend.com/emails');
assert.equal(capturedRequest!.init.method, 'POST');
const headers = capturedRequest!.init.headers as Record<string, string>;
assert.equal(headers.Authorization, 'Bearer test-key');
const body = JSON.parse(capturedRequest!.init.body as string);
assert.equal(body.from, 'Kinglier <auth@send.kingsler.ru>');
assert.equal(body.to, 'ivan@example.com');
assert.match(body.html, /https:\/\/kingsler\.ru\/api\/auth\/verify\?token=abc/);
assert.match(body.html, />042731</);

/* Тема письма начинается с кода: списки писем и всплывающие уведомления
   обрезают её, и код должен пережить обрезку. */
assert.match(body.subject, /^042731\b/);

/* Текстовая версия обязана быть: часть клиентов и почти все голосовые
   помощники читают именно её, а не HTML. */
assert.ok(typeof body.text === 'string' && body.text.includes('042731'));
assert.ok(body.text.includes('https://kingsler.ru/api/auth/verify?token=abc'));

/*
 * Постер-фон положен тремя способами, и ни один не лишний: атрибут понимают
 * старые клиенты, CSS — современные, VML — Outlook, который не понимает
 * первых двух. Пропажа любого из трёх — это тихо почерневшее письмо у целого
 * класса адресатов, поэтому проверяются все три.
 */
const ART = 'https://kingsler.ru/assets/email/hero-poster.jpg';
assert.ok(body.html.includes(`background="${ART}"`), 'нет атрибута background');
assert.ok(body.html.includes(`background-image:url('${ART}')`), 'нет CSS-фона');
assert.ok(body.html.includes(`<v:fill type="frame" src="${ART}"`), 'нет VML-фона для Outlook');
/* Пространство имён VML объявляется на <html>, иначе Outlook разметку не поймёт. */
assert.match(body.html, /<html[^>]+xmlns:v="urn:schemas-microsoft-com:vml"/);

/* Цвет-подложка обязателен: картинки в письмах по умолчанию не грузятся, и без
   него светлый текст лёг бы на белое. */
assert.match(body.html, /bgcolor="#05070c"/);
assert.ok(body.html.includes('color="#05070c"'), 'у VML-заливки нет цвета-подложки');

/* webp в письме недопустим: Outlook его не показывает. */
assert.doesNotMatch(body.html, /\.webp/);

/* Ничего важного не должно жить только внутри картинки. */
for (const must of ['Войти в игру', '15 минут', 'КИНГСЛЕР']) {
  assert.ok(body.html.includes(must), `в письме нет текста: ${must}`);
}
assert.ok(body.html.includes('/assets/email/logo.png'), 'в письме нет логотипа');

// Failure path: a non-OK response must throw, not swallow the error.
globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
await assert.rejects(() => sendMagicLinkEmail('ivan@example.com', 'https://x/y', '123456'));

globalThis.fetch = originalFetch;
console.log('email.check.ts passed.');
