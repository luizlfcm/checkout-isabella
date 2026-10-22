// Repassa eventos do navegador (PageView, ViewContent, InitiateCheckout, AddPaymentInfo) ao Meta pela
// API de Conversões, com o MESMO event_id do pixel do navegador (o Meta deduplica).
// O Purchase é enviado em outro ponto (pedido.js), quando o pagamento é confirmado.
import { createHash } from 'crypto';
import { PRODUTOS, envId } from './_lib/produtos.js';

const PERMITIDOS = new Set(['PageView', 'ViewContent', 'InitiateCheckout', 'AddPaymentInfo']);
const sha = (v) => createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = String(b.produto || '');
    const p = PRODUTOS[id];
    const evento = String(b.evento || '');
    const eid = String(b.id || '');
    if (!p || !PERMITIDOS.has(evento) || !/^[A-Za-z0-9_-]{6,60}$/.test(eid)) return res.status(204).end();

    const pixel = process.env[`META_PIXEL_ID_${envId(id)}`] || process.env.META_PIXEL_ID;
    const tok = process.env[`META_CAPI_TOKEN_${envId(id)}`] || process.env.META_CAPI_TOKEN;
    if (!pixel || !tok) return res.status(204).end();

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const user = { client_user_agent: String(req.headers['user-agent'] || '').slice(0, 250), country: [sha('br')] };
    if (ip) user.client_ip_address = ip;
    if (b.fbp) user.fbp = String(b.fbp).slice(0, 100);
    if (b.fbc) user.fbc = String(b.fbc).slice(0, 150);
    const email = String(b.email || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 120) user.em = [sha(email)];
    const fn = String(b.nome || '').trim().split(/\s+/)[0];
    if (fn && fn.length <= 40) user.fn = [sha(fn)];

    const evt = {
      event_name: evento,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eid,
      action_source: 'website',
      event_source_url: String(b.url || req.headers.referer || '').slice(0, 300) || undefined,
      user_data: user,
    };
    const valor = Number(b.valor);
    if (evento !== 'PageView' && evento !== 'ViewContent' && valor > 0 && valor < 10000) {
      evt.custom_data = { currency: 'BRL', value: valor, content_name: p.nome };
    }
    const body = { data: [evt] };
    const testCode = process.env[`META_TEST_CODE_${envId(id)}`] || process.env.META_TEST_CODE;
    if (testCode) body.test_event_code = testCode;

    const r = await fetch(`https://graph.facebook.com/v19.0/${pixel}/events?access_token=${encodeURIComponent(tok)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      console.error('capi evento: Meta recusou', { evento, produto: id, status: r.status, erro: j?.error?.message });
    }
  } catch (e) {
    console.error('capi evento: falha', e?.message);
  }
  return res.status(204).end();
}
