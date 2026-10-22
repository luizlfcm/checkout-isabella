// Dados públicos que o navegador precisa (Public Key NÃO é segredo).
import { PRODUTOS, precoItem, precoTeste, envId } from './_lib/produtos.js';

export default async function handler(req, res) {
  const id = String(req.query.p || '');
  const p = PRODUTOS[id];
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  res.setHeader('Cache-Control', 'no-store');
  const comum = {
    teste: !!precoTeste(),
    publicKey: process.env.MP_PUBLIC_KEY || '',
    whatsapp: String(process.env.WHATSAPP || process.env.NEXT_PUBLIC_WHATSAPP || '').replace(/\D/g, ''),
    contato: process.env.CONTATO_EMAIL || 'contato@isabellabianchi.com.br',
    garantiaDias: Math.max(7, parseInt(process.env.GARANTIA_DIAS || '7', 10) || 7),
  };
  const iid = String(req.query.i || '');
  if (iid) {
    // Link avulso (/firme/<item>): só o item, sem bumps (a compra vem de dentro do app).
    const a = (p.avulsos || []).find((x) => x.id === iid);
    if (!a) return res.status(404).json({ error: 'Item não encontrado' });
    return res.status(200).json({
      ...comum, exclusivas: false, pixelId: '',
      produto: { id, nome: a.titulo || a.nome, preco: precoItem(a.preco), precoSaida: 0, imagemSaida: '', appUrl: p.appUrl, imagem: a.imagem || p.imagem || '', depoimentos: [], inclui: [], bumps: [], avulso: { id: a.id } },
    });
  }
  // Order bump 2 escolhido pelo quiz: ?b2=airfryer | cozinha (sem informação, aparece o Cozinha Multiplica)
  const b2 = String(req.query.b2 || '').toLowerCase() === 'airfryer' ? 'airfryer' : 'cozinha';
  const bumps = p.bumps
    .filter((b) => b.grupo !== 'b2' || b.quando === b2)
    .map((b) => ({ id: b.id, nome: b.nome, preco: precoItem(b.preco), de: b.de || 0, imagem: b.imagem, desc: b.desc, cta: b.cta }));
  res.status(200).json({
    ...comum,
    exclusivas: process.env.CHECKOUT_EXCLUSIVAS === '1',
    pixelId: process.env[`META_PIXEL_ID_${envId(id)}`] || process.env.META_PIXEL_ID || '',
    clarityId: process.env[`CLARITY_ID_${id.toUpperCase()}`] || p.clarityId || '',
    produto: { id, nome: p.titulo || p.nome, preco: precoItem(p.preco), precoSaida: 0, imagemSaida: '', appUrl: p.appUrl, imagem: p.imagem || '', inclui: p.inclui || [], depoimentos: [], bumps },
  });
}
