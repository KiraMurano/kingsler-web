const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendMagicLinkEmail(email: string, verifyUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const from = process.env.MAGIC_LINK_FROM ?? 'Kinglier <auth@send.kingsler.ru>';

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
      html: `<p>Нажмите, чтобы войти в Kinglier:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Ссылка действует 15 минут. Если вы не запрашивали вход — просто игнорируйте письмо.</p>`
    })
  });

  if (!response.ok) {
    throw new Error(`Resend API error ${response.status}: ${await response.text()}`);
  }
}
