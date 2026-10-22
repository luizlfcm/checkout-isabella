// Polling do navegador: pergunta ao MP (fonte da verdade) e libera se aprovado.
import { processarPedido } from './_lib/pedido.js';

export default async function handler(req, res) {
  const id = String(req.query.id || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!id) return res.status(400).json({ error: 'id ausente' });
  try {
    const r = await processarPedido(id);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ status: r.status });
  } catch (e) {
    console.error('status', e);
    return res.status(200).json({ status: 'pendente' });
  }
}
