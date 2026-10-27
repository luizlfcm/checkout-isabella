// Guarda as respostas do quiz (sem e-mail e sem nome) por 30 dias, ligadas ao qsid.
// O checkout usa o qsid na compra para ligar as respostas ao pedido.
import { cmd } from './_lib/redis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.QUIZ_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const qsid = String(b.qsid || '');
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(qsid)) return res.status(204).end();
    const r = b.r && typeof b.r === 'object' ? b.r : {};
    const lim = (v, n = 40) => String(v ?? '').slice(0, n);
    const num = (v, a, z) => { const x = Number(v); return Number.isFinite(x) && x >= a && x <= z ? x : null; };
    const reg = {
      sexo: lim(r.sexo, 1), obj: lim(r.obj), ref: lim(r.ref), trein: lim(r.trein, 2), air: lim(r.air, 3),
      obst: Array.isArray(r.obst) ? r.obst.slice(0, 8).map((x) => lim(x)) : [],
      tri: Array.isArray(r.tri) ? r.tri.slice(0, 5).map((x) => lim(x)) : [],
      idade: num(r.idade, 14, 100), altura: num(r.altura, 100, 230), peso: num(r.peso, 25, 300),
      utm: b.utm && typeof b.utm === 'object' ? Object.fromEntries(Object.entries(b.utm).slice(0, 12).map(([k, v]) => [lim(k, 20), lim(v, 120)])) : {},
      em: Date.now(),
    };
    await cmd(['SET', `quiz:${qsid}`, JSON.stringify(reg), 'EX', 60 * 60 * 24 * 30]);
  } catch (e) {
    console.error('lead: falha', e?.message);
  }
  return res.status(204).end();
}
