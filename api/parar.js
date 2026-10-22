// Link "não quero mais lembretes" dos e-mails de recuperação.
import { cmd } from './_lib/redis.js';
import { tokenParar } from './_lib/email.js';
import { chaveParar } from './_lib/recuperacao.js';

export default async function handler(req, res) {
  const email = String(req.query?.e || '').trim().toLowerCase();
  const ok = email && String(req.query?.t || '') === tokenParar(email);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!ok) return res.status(400).send('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;padding:28px;font-size:18px">Link inválido.</body>');
  await cmd(['SET', chaveParar(email), '1', 'EX', String(60 * 60 * 24 * 365)]).catch(() => {});
  res.status(200).send('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;padding:28px;font-size:18px;line-height:1.5"><b>Pronto!</b> Você não receberá mais lembretes por e-mail.</body>');
}
