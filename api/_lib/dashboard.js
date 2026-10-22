// Avisa o dashboard de vendas (Ads x Faturamento) das vendas/reembolsos e do status dos pedidos do checkout próprio.
// Configuração (Vercel): DASHBOARD_URL (ex.: https://seu-dashboard.vercel.app) e
// DASHBOARD_WEBHOOK_SECRET (o mesmo valor de CHECKOUT_WEBHOOK_SECRET no dashboard).
// Em modo de teste só envia se DASHBOARD_ACEITA_TESTE=1 (para validar a integração; apague depois). Nunca envia em modo de teste (preço de teste ou Pix de teste) para não sujar o dashboard.
import { precoTeste } from './produtos.js';

async function enviar(corpo, timeoutMs = 8000) {
  const base = String(process.env.DASHBOARD_URL || '').trim().replace(/\/$/, '');
  const segredo = process.env.DASHBOARD_WEBHOOK_SECRET;
  if (!base || !segredo) return { enviado: false, motivo: 'dashboard não configurado', semTentar: true };
  if ((precoTeste() || process.env.MP_MODO_TESTE === '1') && process.env.DASHBOARD_ACEITA_TESTE !== '1') return { enviado: false, motivo: 'modo de teste', semTentar: true };
  try {
    const r = await fetch(`${base}/api/webhooks/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-checkout-secret': segredo },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) console.error('dashboard: recusou', { evento: corpo.evento, orderId: corpo.pedido, status: r.status, resp: (await r.text().catch(() => '')).slice(0, 200) });
    return { enviado: r.ok, status: r.status };
  } catch (e) {
    console.error('dashboard: falha', e?.message);
    return { enviado: false, motivo: String(e?.message || e) };
  }
}

export function notificarDashboard(evento, orderId, reg, itens, extra = {}) {
  return enviar({
    evento, pedido: orderId, itens, email: reg.email, nome: reg.nome || '', metodo: reg.metodo || 'pix',
    data: new Date().toISOString(), recuperada: !!extra.recuperada, atrib: reg.atrib || {},
    tipoApp: extra.tipoApp || '', recompra: !!extra.recompra, atribCliente: extra.atribCliente || {},
  });
}

// Status do pedido (para a aba "Checkout" do dashboard): pendente, aprovado, recusado, expirado, cancelado, reembolsado.
// Timeout curto: este envio pode acontecer enquanto o cliente espera o Pix; se falhar, a próxima consulta do pedido tenta de novo.
export function notificarStatus(orderId, reg, itens, status, detalhe = '') {
  return enviar({
    evento: 'ORDER_STATUS', pedido: orderId, status, detalhe: String(detalhe || '').slice(0, 80),
    produto: reg.produto, itens, valor: Number(reg.valor), parcelas: reg.parcelas || 1,
    email: reg.email, nome: reg.nome || '', metodo: reg.metodo || 'pix',
    criadoEm: reg.criadoEm || new Date().toISOString(), data: new Date().toISOString(), atrib: reg.atrib || {},
  }, 2500);
}
