// Webhook do Mercado Pago (evento "Order"). Valida assinatura, reconsulta o pedido
// na API do MP e libera/remove acesso. Sempre idempotente.
import { assinaturaOk } from './_lib/mp.js';
import { processarPedido } from './_lib/pedido.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  // MP_WEBHOOK_STRICT=1 → rejeita avisos sem assinatura válida (modo rígido).
  // Padrão: a assinatura é verificada e registrada no log, mas o aviso é processado
  // mesmo assim, porque quem decide a liberação é a consulta direta ao pedido na
  // API do Mercado Pago (com nosso token) — um aviso falso não libera nada.
  const estrito = process.env.MP_WEBHOOK_STRICT === '1';

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const dataId = req.query['data.id'] || body?.data?.id || '';
  const assinaturaValida = assinaturaOk(req, dataId);
  if (!assinaturaValida) {
    if (estrito) return res.status(401).json({ error: 'Assinatura inválida' });
    console.warn('webhook: assinatura inválida, processando mesmo assim (modo não estrito)');
  }
  if (!dataId) return res.status(200).json({ ok: true, ignored: true });

  try {
    const r = await processarPedido(dataId);
    return res.status(200).json({ ok: true, ...r });
  } catch (e) {
    console.error('mp-webhook', e);
    return res.status(500).json({ ok: false }); // MP tenta de novo
  }
}
