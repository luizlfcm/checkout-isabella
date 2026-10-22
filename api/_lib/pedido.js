// Processa um pedido do Mercado Pago: consulta a verdade na API do MP e
// libera/remove acesso no Upstash. Idempotente — webhook, polling e retorno do
// cartão podem chamar à vontade.
import { createHash } from 'crypto';
import { cmd } from './redis.js';
import { definirAcessos } from './entrega.js';
import { mpFetch } from './mp.js';
import { PRODUTOS, calcular, envId } from './produtos.js';
import { notificarDashboard, notificarStatus } from './dashboard.js';
import { enviarEntrega, enviarReembolso } from './email.js';
import { cancelarRecuperacao } from './recuperacao.js';

const APROVADO = ['processed', 'accredited'];
const REEMBOLSO = ['refunded', 'charged_back', 'chargeback']; // reembolso parcial NÃO remove acesso

export const chaveRegistro = (id) => `chk_order:${id}`;

export async function salvarRegistro(id, reg) {
  await cmd(['SET', chaveRegistro(id), JSON.stringify(reg), 'EX', String(60 * 60 * 24 * 30)]);
}

export function statusSimples(order) {
  const s = String(order?.status || '').toLowerCase();
  const det = String(order?.transactions?.payments?.[0]?.status_detail || '').toLowerCase();
  if (APROVADO.includes(s) || det === 'accredited') return 'aprovado';
  if (REEMBOLSO.includes(s)) return 'reembolsado';
  if (['canceled', 'cancelled', 'expired', 'failed', 'rejected'].includes(s)) return 'falhou';
  return 'pendente';
}

// Status detalhado para a aba "Checkout" do dashboard (statusSimples continua decidindo a liberação).
export function statusDetalhado(order) {
  const s = statusSimples(order);
  if (s !== 'falhou') return s;
  const o = String(order?.status || '').toLowerCase();
  if (o === 'expired') return 'expirado';
  if (o === 'canceled' || o === 'cancelled') return 'cancelado';
  return 'recusado';
}

// Avisa o dashboard quando o status do pedido muda (uma vez por status; se o envio falhar, a próxima consulta tenta de novo).
export async function registrarStatus(orderId, reg, status, detalhe = '') {
  try {
    const chave = `chk_st:${orderId}`;
    if ((await cmd(['GET', chave])) === status) return;
    const r = await notificarStatus(orderId, reg, itensDoPedido(reg), status, detalhe);
    if (r.enviado) await cmd(['SET', chave, status, 'EX', String(60 * 60 * 24 * 90)]);
    else if (!r.semTentar) console.warn('pedido: status não enviado ao dashboard', { orderId, status, motivo: r.motivo, http: r.status });
  } catch (e) { console.error('pedido: registrarStatus', e?.message); }
}

async function anotarCapi(id, info) {
  // Guarda por 7 dias o resultado do envio ao Meta de cada venda (chave chk_capi:<pedido> no Redis), para diagnóstico: os logs da Vercel só mostram 1 hora.
  try { await cmd(['SET', `chk_capi:${id}`, JSON.stringify({ ...info, quando: new Date().toISOString() }), 'EX', String(60 * 60 * 24 * 7)]); } catch (e) { /* só diagnóstico */ }
}

async function capiPurchase(reg, id) {
  const pixel = process.env[`META_PIXEL_ID_${envId(reg.produto)}`] || process.env.META_PIXEL_ID;
  const tok = process.env[`META_CAPI_TOKEN_${envId(reg.produto)}`] || process.env.META_CAPI_TOKEN;
  if (!pixel || !tok) { console.warn('capi: pixel/token ausente', { produto: reg.produto, temPixel: !!pixel, temToken: !!tok }); await anotarCapi(id, { resultado: 'nao_enviado', motivo: 'pixel ou token ausente', temPixel: !!pixel, temToken: !!tok }); return; }
  const sha = (v) => createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
  const body = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: `purchase_${id}`,
      action_source: 'website',
      event_source_url: reg.url || undefined,
      user_data: {
        em: [sha(reg.email)],
        fbp: reg.fbp || undefined,
        fbc: reg.fbc || undefined,
        client_ip_address: reg.ip || undefined,
        client_user_agent: reg.ua || undefined,
        fn: reg.nome ? [sha(String(reg.nome).split(/\s+/)[0])] : undefined,
        country: [sha('br')],
      },
      custom_data: { currency: 'BRL', value: Number(reg.valor), content_name: PRODUTOS[reg.produto]?.nome },
    }],
  };
  const testCode = process.env[`META_TEST_CODE_${envId(reg.produto)}`] || process.env.META_TEST_CODE;
  if (testCode) body.test_event_code = testCode;
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${pixel}/events?access_token=${encodeURIComponent(tok)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('capi: Meta recusou o Purchase', { produto: reg.produto, status: r.status, erro: j?.error?.message }); await anotarCapi(id, { resultado: 'recusado', http: r.status, erro: j?.error?.message || '', produto: reg.produto, pixel }); }
    else { console.log('capi: Purchase enviado', { produto: reg.produto, recebidos: j?.events_received }); await anotarCapi(id, { resultado: 'enviado', recebidos: j?.events_received, produto: reg.produto, pixel, modoTeste: !!testCode }); }
  } catch (e) {
    console.error('capi: falha de rede', e?.message);
    await anotarCapi(id, { resultado: 'erro_rede', erro: String(e?.message || e) });
  }
}

// Itens do pedido para o dashboard (registros antigos, sem "itens", são recalculados).
const itensDoPedido = (reg) => reg.itens || calcular(reg.produto, reg.bumps || [], reg.desconto === 'saida10', reg.avulso || '')?.itens || [];

// Avisa o dashboard uma única vez por pedido; se falhar, libera a trava para a próxima chamada tentar de novo.
// Guarda a origem do PRIMEIRO pedido aprovado do e-mail (só de compra pelo funil, nunca de link avulso do app) e devolve a etiqueta desta venda.
async function origemDoCliente(orderId, reg) {
  try {
    const email = String(reg.email || '').trim().toLowerCase();
    if (!email) return {};
    const chave = `chk_orig:${email}`;
    if (!reg.avulso) await cmd(['SET', chave, JSON.stringify({ pedido: orderId, produto: reg.produto, atrib: reg.atrib || {}, data: new Date().toISOString() }), 'NX']).catch(() => {});
    const raw = await cmd(['GET', chave]).catch(() => null);
    const orig = raw ? JSON.parse(raw) : null;
    const outroPedido = !!orig && orig.pedido !== orderId;
    const tipoApp = reg.avulso ? String(reg.avulso) : '';
    const recompra = !tipoApp && outroPedido;
    return { tipoApp, recompra, atribCliente: (tipoApp || recompra) && outroPedido ? (orig.atrib || {}) : {} };
  } catch (e) { return {}; }
}

async function avisarDashboard(evento, orderId, reg, chave) {
  const trava = await cmd(['SET', chave, '1', 'NX', 'EX', String(60 * 60 * 24 * 90)]);
  if (!trava) return;
  const recuperada = evento === 'PURCHASE_APPROVED' && !!(await cmd(['GET', `chk_recup:${orderId}`]).catch(() => null));
  // Venda dentro do app (link avulso) ou recompra de quem já comprou: etiqueta + origem do 1º pedido do cliente (campanha/anúncio que o trouxe).
  let origem = {};
  if (evento === 'PURCHASE_APPROVED') origem = await origemDoCliente(orderId, reg);
  const r = await notificarDashboard(evento, orderId, reg, itensDoPedido(reg), { recuperada, ...origem });
  console.log('pedido: dashboard', { orderId, evento, enviado: r.enviado, motivo: r.motivo, status: r.status });
  if (!r.enviado && !r.semTentar) await cmd(['DEL', chave]).catch(() => {});
}

export async function processarPedido(orderId) {
  const { ok, data: order } = await mpFetch(`/v1/orders/${encodeURIComponent(orderId)}`);
  if (!ok) throw new Error(`MP order ${orderId} indisponível`);
  const status = statusSimples(order);

  const raw = await cmd(['GET', chaveRegistro(orderId)]);
  if (!raw) return { status, ignorado: true }; // pedido que não é deste checkout
  const reg = JSON.parse(raw);
  const produto = PRODUTOS[reg.produto];
  if (!produto) return { status, ignorado: true };

  await registrarStatus(orderId, reg, statusDetalhado(order), order?.transactions?.payments?.[0]?.status_detail);

  if (status === 'aprovado') {
    await definirAcessos(reg.email, reg.flags, true, orderId); // grava em public.acessos (se falhar, lança erro e o Mercado Pago/polling tentam de novo)
    const primeira = await cmd(['SET', `chk_paid:${orderId}`, '1', 'NX', 'EX', String(60 * 60 * 24 * 90)]);
    console.log('pedido: aprovado, acesso liberado', { orderId, produto: reg.produto, flags: reg.flags, primeiraConfirmacao: !!primeira });
    // Links avulsos (compra de dentro do app, de quem já é aluno) não vão para a API de Conversões da Meta, para não distorcer a otimização dos anúncios (CAPI_AVULSOS=1 liga).
    if (primeira && (!reg.avulso || process.env.CAPI_AVULSOS === '1')) await capiPurchase(reg, orderId);
    // Recuperação de vendas: cancela lembretes pendentes e registra se esta venda foi recuperada.
    if (primeira) {
      const rc = await cancelarRecuperacao(reg.produto, reg.email, reg.avulso);
      if (rc.recuperada) await cmd(['SET', `chk_recup:${orderId}`, '1', 'EX', String(60 * 60 * 24 * 90)]).catch(() => {});
    }
    // E-mail de entrega: uma única vez por pedido; se falhar, libera a trava para tentar de novo.
    const mailTrava = await cmd(['SET', `chk_mail:${orderId}`, '1', 'NX', 'EX', String(60 * 60 * 24 * 90)]);
    if (mailTrava) {
      try {
        const r = await enviarEntrega(reg);
        console.log('pedido: e-mail de entrega', { orderId, enviado: r.enviado, motivo: r.motivo });
        if (!r.enviado) await cmd(['DEL', `chk_mail:${orderId}`]);
      } catch (e) { console.error('email entrega', e); await cmd(['DEL', `chk_mail:${orderId}`]).catch(() => {}); }
    }
    await avisarDashboard('PURCHASE_APPROVED', orderId, reg, `chk_dash:${orderId}`);
  } else if (status === 'reembolsado') {
    await definirAcessos(reg.email, reg.flags, false, orderId);
    console.log('pedido: reembolsado, acesso removido', { orderId, produto: reg.produto });
    const trava = await cmd(['SET', `chk_refmail:${orderId}`, '1', 'NX', 'EX', String(60 * 60 * 24 * 90)]);
    if (trava) {
      try {
        const r = await enviarReembolso(reg);
        console.log('pedido: e-mail de reembolso', { orderId, enviado: r.enviado, motivo: r.motivo });
        if (!r.enviado) await cmd(['DEL', `chk_refmail:${orderId}`]);
      } catch (e) { console.error('email reembolso', e); await cmd(['DEL', `chk_refmail:${orderId}`]).catch(() => {}); }
    }
    await avisarDashboard('PURCHASE_REFUNDED', orderId, reg, `chk_dashref:${orderId}`);
  }
  return { status, email: reg.email };
}
