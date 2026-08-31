/**
 * Письмо с кодом входа.
 *
 * Вёрстка нарочно старомодная — таблицы, атрибуты `width`, стили строкой.
 * Почтовые клиенты не браузеры: Outlook рисует движком Word, Gmail вырезает
 * `<style>` из письма целиком. Всё, что здесь выглядит как вчерашний день, —
 * это то, что доезжает до адресата неизменным.
 *
 * Фоном лежит постер игры, и положен он тремя способами сразу, потому что ни
 * одного достаточного нет: атрибут `background` понимают старые клиенты,
 * CSS `background-image` — современные, а Outlook не понимает ни того ни
 * другого и требует VML-прямоугольник в условном комментарии. Плюс `bgcolor`
 * подложкой: картинки в письмах по умолчанию не грузятся, и без цвета светлый
 * текст лёг бы на белое.
 *
 * Отсюда же главное правило вёрстки этого письма: **ничего важного не живёт
 * внутри картинки**. Код, кнопка, срок годности и подпись — текст. Постер
 * можно не загрузить, и письмо останется рабочим, просто станет тёмным.
 *
 * Крупная надпись «КИНГСЛЕР» вписана в сам постер. В подвале — логотип
 * картинкой; имя в `alt`, чтобы письмо назвало себя и без загруженных картинок.
 *
 * Картинка — JPEG. Игра нарисована в webp, но Outlook его не показывает вовсе,
 * а PNG на живописи весит почти три мегабайта против трёхсот килобайт.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

/** Сколько живут код и ссылка. Держать в одном месте с текстом письма. */
const TTL_MINUTES = 15;

/** Постер 2:3. Блок письма ровно в его пропорциях, чтобы не обрезать. */
const WIDTH = 600;
const HEIGHT = 900;
/** Отступ сверху, отдающий панели нижнюю треть: там у постера самый спокойный
 *  фон, а надпись и лица остаются открытыми. */
const ART_ROOM = 470;

const INK_DEEP = '#05070c';
const GOLD = '#c8a04a';
const GOLD_PALE = '#f4e8c8';
const TEXT = '#e9e5db';
const TEXT_DIM = '#b3aea4';
const PANEL = 'rgba(5,7,12,0.88)';
const LINE = 'rgba(200,160,74,0.34)';

function buildHtml(code: string, verifyUrl: string, origin: string): string {
  const art = `${origin}/assets/email/hero-poster.jpg`;
  const serif = "Georgia,'Times New Roman',serif";

  return `<!doctype html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>Вход в Кингслер</title>
</head>
<body style="margin:0;padding:0;background:${INK_DEEP};">
<!-- Строка предпросмотра в списке писем. Кода в ней нет намеренно: список
     писем видно через плечо, а сам код всегда на виду внутри. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Код для входа в Кингслер действует ${TTL_MINUTES} минут.</div>

<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${INK_DEEP};padding:20px 10px;">
<tr><td align="center">

<table role="presentation" width="${WIDTH}" border="0" cellpadding="0" cellspacing="0" style="width:${WIDTH}px;max-width:100%;">
<tr>
<td
  background="${art}"
  bgcolor="${INK_DEEP}"
  width="${WIDTH}"
  height="${HEIGHT}"
  valign="top"
  style="width:${WIDTH}px;height:${HEIGHT}px;background-color:${INK_DEEP};background-image:url('${art}');background-repeat:no-repeat;background-position:top center;background-size:cover;border-radius:14px;"
>

<!--[if gte mso 9]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${WIDTH}px;height:${HEIGHT}px;">
<v:fill type="frame" src="${art}" color="${INK_DEEP}" />
<v:textbox inset="0,0,0,0">
<![endif]-->

  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">

    <!-- Постеру отдана верхняя часть: там надпись и лица, класть на них
         текст нечитаемо. -->
    <tr><td height="${ART_ROOM}" style="height:${ART_ROOM}px;font-size:0;line-height:0;">&nbsp;</td></tr>

    <tr><td align="center" style="padding:0 26px;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${PANEL};border:1px solid ${LINE};border-radius:12px;">

        <tr><td align="center" style="padding:24px 24px 0 24px;font-family:${serif};font-size:16px;line-height:24px;color:${TEXT};">
          Двор собрался и ждёт вас. Вот код для входа:
        </td></tr>

        <tr><td align="center" style="padding:16px 24px 0 24px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
            <td align="center" bgcolor="${INK_DEEP}" style="border:1px solid ${LINE};border-radius:10px;padding:14px 24px;">
              <div style="font-family:${serif};font-size:32px;font-weight:bold;letter-spacing:11px;text-indent:11px;color:${GOLD_PALE};white-space:nowrap;">${code}</div>
            </td>
          </tr></table>
        </td></tr>

        <tr><td align="center" style="padding:18px 24px 0 24px;font-family:${serif};font-size:13px;line-height:20px;color:${TEXT_DIM};">
          Или войдите одним нажатием:
        </td></tr>

        <!-- Кнопка — ячейка с фоном, а не фон на ссылке: Outlook фон у ссылки
             игнорирует, и кнопка превратилась бы в голый текст. -->
        <tr><td align="center" style="padding:12px 24px 0 24px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
            <td align="center" bgcolor="${GOLD}" style="border-radius:10px;">
              <a href="${verifyUrl}" style="display:inline-block;padding:13px 30px;font-family:${serif};font-size:16px;font-weight:bold;color:${INK_DEEP};text-decoration:none;border-radius:10px;">Войти в игру</a>
            </td>
          </tr></table>
        </td></tr>

        <tr><td align="center" style="padding:18px 24px 22px 24px;font-family:${serif};font-size:12px;line-height:19px;color:${TEXT_DIM};">
          Код и ссылка действуют ${TTL_MINUTES} минут.<br>
          Если вы не запрашивали вход — просто не отвечайте на это письмо.
        </td></tr>

      </table>
    </td></tr>

    <!-- Подпись вне панели: она нужна прежде всего тогда, когда постер не
         загрузился и назвать письмо больше нечем. -->
    <tr><td align="center" style="padding:18px 26px 24px 26px;">
      <img src="${origin}/assets/email/logo.png" width="280" alt="КИНГСЛЕР · БИТВА ЗА ПРЕСТОЛ" style="display:block;width:280px;max-width:70%;height:auto;border:0;" />
    </td></tr>

  </table>

<!--[if gte mso 9]>
</v:textbox>
</v:rect>
<![endif]-->

</td>
</tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}

/** Версия для клиентов без HTML — и для тех, кто читает письма голосом. */
function buildText(code: string, verifyUrl: string): string {
  return [
    'КИНГСЛЕР — битва за престол',
    '',
    'Двор собрался и ждёт вас. Код для входа:',
    '',
    `    ${code}`,
    '',
    'Или войдите по ссылке:',
    verifyUrl,
    '',
    `Код и ссылка действуют ${TTL_MINUTES} минут.`,
    'Если вы не запрашивали вход — просто не отвечайте на это письмо.'
  ].join('\n');
}

export async function sendMagicLinkEmail(email: string, verifyUrl: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const from = process.env.MAGIC_LINK_FROM ?? 'Kinglier <auth@kingsler.ru>';
  /* Тот же сайт, что прислал ссылку, отдаёт и картинку: отдельная переменная
     окружения под домен разошлась бы с этой при первом же переезде. */
  const origin = new URL(verifyUrl).origin;

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: `${code} — код для входа в Кингслер`,
      html: buildHtml(code, verifyUrl, origin),
      text: buildText(code, verifyUrl)
    })
  });

  if (!response.ok) {
    throw new Error(`Resend API error ${response.status}: ${await response.text()}`);
  }
}
