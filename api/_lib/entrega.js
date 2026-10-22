// Entrega: grava/remove o acesso na tabela public.acessos do Supabase do app (REST + chave de serviço, só no servidor).
// A chave de serviço NUNCA vai para o navegador. Sem dependências.
import { createHmac } from 'crypto';

const URL_ = () => String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function cab(extra = {}) {
  return { apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json', ...extra };
}

// Liga/desliga os acessos (flags) de um e-mail. Lança erro se o Supabase recusar, para o pedido tentar de novo.
export async function definirAcessos(email, flags, ligar, pedido = '') {
  if (!URL_() || !KEY()) throw new Error('Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  const mail = String(email).trim().toLowerCase();
  if (ligar) {
    const linhas = flags.map((produto) => ({ email: mail, produto, origem: 'checkout', pedido: String(pedido), ativo: true, expira_em: null }));
    const r = await fetch(`${URL_()}/rest/v1/acessos?on_conflict=email,produto`, {
      method: 'POST', headers: cab({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(linhas),
    });
    if (!r.ok) throw new Error(`Supabase acessos HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  } else {
    for (const produto of flags) {
      const r = await fetch(`${URL_()}/rest/v1/acessos?email=eq.${encodeURIComponent(mail)}&produto=eq.${encodeURIComponent(produto)}`, {
        method: 'PATCH', headers: cab({ Prefer: 'return=minimal' }), body: JSON.stringify({ ativo: false }),
      });
      if (!r.ok) throw new Error(`Supabase acessos HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
    }
  }
}

// Link de download sem login: /baixar/<token> no app (mesmo algoritmo de src/lib/download.js do app; mesmo DOWNLOAD_SECRET).
export function tokenDownload(email, slug) {
  const s = process.env.DOWNLOAD_SECRET;
  if (!s || s.length < 16) return '';
  const carga = `${String(email).toLowerCase()}|${slug}`;
  const sig = createHmac('sha256', s).update(carga).digest('hex').slice(0, 32);
  return `${Buffer.from(carga).toString('base64url')}.${sig}`;
}

// PDFs liberados por cada acesso (slug = nome do arquivo em conteudo/materiais do app)
export const PDFS_POR_ACESSO = {
  firme: [['refeicoes_5min', 'Pronto em 5'], ['guia_mercado', 'Guia do Mercado Inteligente'], ['fome_de_que', 'Fome de Quê?']],
  airfryer_express: [['airfryer_express', 'Airfryer Express']],
  cozinha_multiplica: [['cozinha_multiplica', 'Cozinha Multiplica']],
  cardapios: [['cardapios', 'Cardápios da Semana']],
  dose_doce: [['dose_doce', 'Dose Doce']],
};
