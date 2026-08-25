const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendMagicLinkEmail(email: string, verifyUrl: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const from = process.env.MAGIC_LINK_FROM ?? 'Kinglier <auth@kingsler.ru>';

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Вход в Kinglier',
      html: `<div style="font-family:Georgia,serif;color:#17130b"><p>Код для входа в Kinglier:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</div><p>Или войдите одним нажатием: <a href="${verifyUrl}">${verifyUrl}</a></p><p>Код и ссылка действуют 15 минут. Если вы не запрашивали вход — просто игнорируйте письмо.</p></div>`
    })
  });

  if (!response.ok) {
    throw new Error(`Resend API error ${response.status}: ${await response.text()}`);
  }
}
