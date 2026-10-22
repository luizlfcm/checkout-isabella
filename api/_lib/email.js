// E-mails via Resend: entrega, reembolso e recuperação de vendas.
// Só envia se RESEND_API_KEY estiver configurada. Falhas nunca derrubam a liberação.
import { createHash } from 'crypto';
import { PRODUTOS } from './produtos.js';
import { tokenDownload, PDFS_POR_ACESSO } from './entrega.js';

const BASE = (process.env.CHECKOUT_URL || 'https://pagamento.isabellabianchi.com.br').replace(/\/$/, '');
const APP = () => (process.env.APP_URL || 'https://programafirme.isabellabianchi.com.br').replace(/\/$/, '');
const CONTATO = () => process.env.CONTATO_EMAIL || 'contato@isabellabianchi.com.br';
const GARANTIA = () => Math.max(7, parseInt(process.env.GARANTIA_DIAS || '7', 10) || 7);
const LOGO = `${BASE}/img/firme-compacto.png`;
const COR = '#0E8F6A';
const primeiroNome = (n) => { const w = String(n || '').trim().split(/\s+/)[0] || ''; return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function moldura(titulo, miolo) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F1F7F4;font-family:Arial,Helvetica,sans-serif;color:#0F2A24">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="background:#fff;padding:20px 24px 16px;border-radius:18px 18px 0 0;border-top:6px solid ${COR};border-bottom:1px solid #D5E8E0"><img src="${LOGO}" height="40" alt="Programa FIRME" style="height:40px;width:auto;display:block;border:0"></td></tr>
<tr><td style="background:#fff;padding:26px 24px;border-radius:0 0 18px 18px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#0F2A24">${esc(titulo)}</h1>
<div style="font-size:16px;line-height:1.6">${miolo}</div></td></tr>
<tr><td style="padding:16px 8px;text-align:center;font-size:12px;line-height:1.6;color:#4F6B62">
Programa FIRME · Isabella Bianchi · Nutricionista · CRN 7104141<br>
Pagamento processado por 53.168.292 LUIZ FELIPE CORREA MIRANDA · CNPJ 53.168.292/0001-32<br>
Reembolso em até ${GARANTIA()} dias · Pagamento e demais assuntos: <a href="mailto:${CONTATO()}" style="color:#4F6B62">${CONTATO()}</a></td></tr>
</table></td></tr></table></body></html>`;
}

const botao = (href, rotulo) => `<p style="margin:24px 0 4px;text-align:center"><a href="${esc(href)}" style="display:inline-block;background:${COR};color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:14px;font-size:16px">${esc(rotulo)}</a></p>`;

async function resend(to, subject, html, text, agendarEm = '') {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { enviado: false, motivo: 'resend não configurado' };
  const de = process.env.EMAIL_FROM || process.env.EMAIL_REMETENTE || 'Isabella Bianchi <noreply@send.isabellabianchi.com.br>';
  const body = { from: de, to: [to], subject, html, text, reply_to: CONTATO() };
  if (agendarEm) body.scheduled_at = agendarEm; // ISO 8601; o Resend aceita até 30 dias à frente
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) { console.error('resend falhou', r.status, await r.text().catch(() => '')); return { enviado: false, motivo: `HTTP ${r.status}` }; }
  const j = await r.json().catch(() => ({}));
  return { enviado: true, id: j.id || '' };
}

function nomesComprados(reg) {
  const p = PRODUTOS[reg.produto];
  if (reg.avulso) return [(p.avulsos || []).find((a) => a.id === reg.avulso)?.nome || reg.avulso];
  return [p.nome, ...p.bumps.filter((b) => (reg.bumps || []).includes(b.id)).map((b) => b.nome)];
}

export async function enviarEntrega(reg) {
  const p = PRODUTOS[reg.produto];
  if (!p) return { enviado: false, motivo: 'produto desconhecido' };
  const comprados = nomesComprados(reg);
  const nome = primeiroNome(reg.nome);
  const flags = reg.flags || [];
  const temFirme = flags.includes('firme');
  const temTreino = flags.includes('treino');

  // Links de download direto dos PDFs comprados (sem login)
  const links = [];
  for (const f of flags) for (const [slug, rotulo] of PDFS_POR_ACESSO[f] || []) {
    const t = tokenDownload(reg.email, slug);
    if (t) links.push([rotulo, `${APP()}/baixar/${t}`]);
  }
  const listaPdf = links.length
    ? `<p style="margin:20px 0 6px"><b>Seus PDFs para baixar agora:</b></p><ul style="margin:0;padding-left:20px">${links.map(([r, h]) => `<li style="margin:4px 0"><a href="${esc(h)}" style="color:${COR}">${esc(r)}</a></li>`).join('')}</ul><p style="margin:6px 0 0;font-size:13px;color:#4F6B62">Eles também ficam na aba Produtos do aplicativo.</p>`
    : '';
  const proximo = temFirme || temTreino
    ? `<p style="margin:14px 0 0">Depois de entrar, responda à avaliação${temFirme && temTreino ? ' de nutrição e a de treino' : temTreino ? ' de treino' : ''}. É a partir dela que ${temFirme && temTreino ? 'a Isabella e o Luiz montam' : temTreino ? 'o educador físico monta' : 'a nutricionista monta'} o seu plano, e você será avisada(o) por e-mail quando ele for liberado.</p>`
    : '';

  const miolo = `<p style="margin:0 0 10px">Olá${nome ? ', ' + esc(nome) : ''}! Seu pagamento foi confirmado. Você comprou:</p>
<ul style="margin:0 0 14px;padding-left:20px">${comprados.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
<p style="margin:0 0 6px"><b>Como entrar no aplicativo:</b></p>
<ol style="margin:0;padding-left:20px"><li>Abra o link abaixo.</li><li>Digite este e-mail: <b>${esc(reg.email)}</b></li><li>Digite o código de 6 dígitos que enviaremos para você. Não precisa de senha.</li></ol>
${botao(`${APP()}/login`, 'Entrar no aplicativo')}${proximo}${listaPdf}
<p style="margin:20px 0 0;font-size:13px;color:#4F6B62">Reembolso em até ${GARANTIA()} dias, se mudar de ideia: basta responder este e-mail.</p>`;

  const text = `Olá${nome ? ', ' + nome : ''}! Seu pagamento foi confirmado (${comprados.join(', ')}).\nEntre em ${APP()}/login com o e-mail ${reg.email} e use o código de 6 dígitos enviado por e-mail (sem senha).\n` +
    links.map(([r, h]) => `${r}: ${h}`).join('\n') + `\nReembolso em até ${GARANTIA()} dias: responda este e-mail (${CONTATO()}).`;
  return resend(reg.email, `${comprados[0]} — acesso liberado`, moldura('Seu acesso está liberado', miolo), text);
}

export async function enviarReembolso(reg) {
  const p = PRODUTOS[reg.produto];
  if (!p) return { enviado: false, motivo: 'produto desconhecido' };
  const nome = primeiroNome(reg.nome);
  const nomeCompra = nomesComprados(reg).join(' + ');
  const miolo = `<p style="margin:0 0 10px">Olá${nome ? ', ' + esc(nome) : ''}!</p><p style="margin:0">Seu reembolso de <b>${esc(nomeCompra)}</b> foi processado e o acesso foi encerrado. Se tiver qualquer dúvida, responda este e-mail ou escreva para <a href="mailto:${CONTATO()}" style="color:${COR}">${CONTATO()}</a>.</p>`;
  return resend(reg.email, `Reembolso confirmado — ${nomeCompra}`, moldura('Reembolso confirmado', miolo), `Olá! Seu reembolso de ${nomeCompra} foi processado. Dúvidas: ${CONTATO()}.`);
}

// ---------- Recuperação de vendas (Pix pendente / cartão recusado) ----------
// Token do link "não quero mais lembretes" (impede que terceiros bloqueiem e-mails alheios).
export function tokenParar(email) {
  const seg = process.env.RECUPERACAO_SEGREDO || process.env.MP_WEBHOOK_SECRET || process.env.RESEND_API_KEY || '';
  return createHash('sha256').update(`${seg}|${String(email).toLowerCase()}`).digest('hex').slice(0, 24);
}
const urlParar = (email) => `${BASE}/api/parar?e=${encodeURIComponent(email)}&t=${tokenParar(email)}`;

// tipo: 'pix1' (Pix gerado e não pago), 'pix2' (dia seguinte), 'cartao' (pagamento recusado)
export async function enviarRecuperacao(reg, tipo, { pix = '', agendarEm = '' } = {}) {
  const p = PRODUTOS[reg.produto];
  if (!p) return { enviado: false, motivo: 'produto desconhecido' };
  const nome = primeiroNome(reg.nome);
  const av = reg.avulso ? (p.avulsos || []).find((a) => a.id === reg.avulso) : null;
  if (reg.avulso && !av) return { enviado: false, motivo: 'item desconhecido' };
  const nomeItem = av ? av.nome : p.nome;
  const link = `${BASE}/${reg.produto}${av ? '/' + av.id : ''}?email=${encodeURIComponent(reg.email)}&utm_source=recuperacao&utm_medium=email&utm_campaign=${tipo}`;
  const ola = `<p style="margin:0 0 10px">Olá${nome ? ', ' + esc(nome) : ''}!</p>`;
  const rodape = `<p style="margin:22px 0 0;font-size:12px;color:#4F6B62">Se você já pagou, é só desconsiderar este e-mail. Não quer mais receber lembretes? <a href="${esc(urlParar(reg.email))}" style="color:#4F6B62">Toque aqui para parar</a>.</p>`;
  let assunto, titulo, miolo, texto;
  if (tipo === 'pix1' && pix) {
    assunto = `Seu Pix está esperando — ${nomeItem}`; titulo = 'Seu Pix está esperando';
    miolo = `${ola}<p style="margin:0 0 10px">Você gerou o Pix de <b>${brl(reg.valor)}</b> para <b>${esc(nomeItem)}</b>, mas ainda não vimos o pagamento. Copie o código abaixo e cole no app do seu banco (Pix Copia e Cola):</p>
<div style="background:#F1F7F4;border-radius:10px;padding:14px;margin:12px 0;word-break:break-all;font-size:13px;line-height:1.5;font-family:monospace">${esc(pix)}</div>
<p style="margin:0">Se o código expirou, é só gerar outro:</p>${botao(link, 'Abrir o pagamento')}${rodape}`;
    texto = `Olá${nome ? ', ' + nome : ''}! Seu Pix de ${brl(reg.valor)} para ${nomeItem} ainda não foi pago. Pix Copia e Cola:\n${pix}\nSe expirou, gere outro: ${link}\nSe já pagou, desconsidere. Para parar: ${urlParar(reg.email)}`;
  } else if (tipo === 'pix2' || tipo === 'pix1') {
    assunto = `Ainda dá tempo — ${nomeItem}`; titulo = 'Ainda dá tempo';
    miolo = `${ola}<p style="margin:0">Você começou a comprar <b>${esc(nomeItem)}</b>, mas o Pix não foi concluído e já expirou. Dá para gerar um novo em segundos, e o acesso é liberado na hora.</p>${botao(link, 'Gerar um novo Pix')}${rodape}`;
    texto = `Olá${nome ? ', ' + nome : ''}! O Pix de ${nomeItem} expirou, mas você pode gerar outro: ${link}\nSe já pagou, desconsidere. Para parar: ${urlParar(reg.email)}`;
  } else {
    assunto = `Seu pagamento não foi aprovado — ${nomeItem}`; titulo = 'Seu pagamento não foi aprovado';
    miolo = `${ola}<p style="margin:0">Não conseguimos aprovar o pagamento de <b>${esc(nomeItem)}</b> no cartão. Isso pode acontecer por limite, por algum dado digitado errado ou por uma trava do banco. Você pode tentar de novo ou pagar por <b>Pix</b>, que é aprovado na hora.</p>${botao(link, 'Tentar novamente')}${rodape}`;
    texto = `Olá${nome ? ', ' + nome : ''}! Não conseguimos aprovar o pagamento de ${nomeItem} no cartão. Tente de novo ou pague por Pix: ${link}\nSe já pagou, desconsidere. Para parar: ${urlParar(reg.email)}`;
  }
  return resend(reg.email, assunto, moldura(titulo, miolo), texto, agendarEm);
}
