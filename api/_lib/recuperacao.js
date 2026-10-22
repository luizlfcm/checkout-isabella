// Recuperação de vendas por e-mail (Resend): Pix gerado e não pago, e cartão recusado.
// LIGADA por padrão, para todos os produtos e também para os links avulsos (itens do app e upgrade).
// RECUPERACAO=0 desliga tudo; RECUPERACAO_DIA2=0 desliga só o lembrete do dia seguinte.
// Os e-mails são agendados no próprio Resend (scheduled_at) e cancelados quando o pagamento chega.
import { cmd } from './redis.js';
import { enviarRecuperacao } from './email.js';

const MIN = 60 * 1000;
const ligada = () => process.env.RECUPERACAO !== '0';
// Uma sequência por e-mail + produto (+ item avulso, para o upgrade e os itens do app não se misturarem com a compra principal).
const chave = (produto, email, avulso = '') => `chk_rec:${produto}${avulso ? ':' + avulso : ''}:${String(email).toLowerCase()}`;
export const chaveParar = (email) => `chk_rec_parar:${String(email).toLowerCase()}`;
const TTL = String(60 * 60 * 24 * 4);

// situacao: 'pix' (com o código copia e cola) ou 'cartao' (recusado). Uma sequência por e-mail+produto.
export async function agendarRecuperacao(reg, situacao, pix = '') {
  if (!ligada()) return;
  try {
    if (await cmd(['GET', chaveParar(reg.email)])) return;
    const trava = await cmd(['SET', chave(reg.produto, reg.email, reg.avulso), JSON.stringify({ itens: [] }), 'NX', 'EX', TTL]);
    if (!trava) return; // já existe uma sequência ativa para este e-mail e produto
    const plano = situacao === 'pix'
      ? [{ tipo: 'pix1', apos: 25 * MIN }, ...(process.env.RECUPERACAO_DIA2 !== '0' ? [{ tipo: 'pix2', apos: 24 * 60 * MIN }] : [])]
      : [{ tipo: 'cartao', apos: 15 * MIN }];
    const itens = [];
    for (const e of plano) {
      const quando = Date.now() + e.apos;
      const r = await enviarRecuperacao(reg, e.tipo, { pix, agendarEm: new Date(quando).toISOString() });
      if (r.enviado && r.id) itens.push({ id: r.id, quando, tipo: e.tipo });
    }
    await cmd(['SET', chave(reg.produto, reg.email, reg.avulso), JSON.stringify({ itens }), 'EX', TTL]);
    console.log('recuperação: agendada', { produto: reg.produto, situacao, emails: itens.map((i) => i.tipo) });
  } catch (e) { console.error('recuperação: falha ao agendar', e?.message); }
}

// Chamada na primeira confirmação de pagamento: cancela o que ainda não saiu e diz se a venda foi "recuperada"
// (algum lembrete já tinha sido enviado antes do pagamento).
export async function cancelarRecuperacao(produto, email, avulso = '') {
  try {
    const raw = await cmd(['GET', chave(produto, email, avulso)]);
    if (!raw) return { recuperada: false };
    const { itens = [] } = JSON.parse(raw);
    const key = process.env.RESEND_API_KEY;
    let recuperada = false;
    for (const it of itens) {
      if (it.quando <= Date.now()) { recuperada = true; continue; }
      if (!key) continue;
      await fetch(`https://api.resend.com/emails/${encodeURIComponent(it.id)}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${key}` } })
        .then(async (r) => { if (!r.ok) console.error('recuperação: cancelar falhou', r.status, (await r.text().catch(() => '')).slice(0, 120)); })
        .catch((e) => console.error('recuperação: cancelar erro', e?.message));
    }
    await cmd(['DEL', chave(produto, email, avulso)]);
    return { recuperada };
  } catch (e) { console.error('recuperação: falha ao cancelar', e?.message); return { recuperada: false }; }
}
