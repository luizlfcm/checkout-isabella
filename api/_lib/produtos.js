// Catálogo do checkout do Programa FIRME. O PREÇO É SEMPRE CALCULADO AQUI (servidor),
// nunca confiamos no valor enviado pelo navegador.
// flag = chave gravada em public.acessos (Supabase do app): firme | treino | airfryer_express | cozinha_multiplica | cardapios | dose_doce
// Itens com preço ainda não definido (null) ficam ocultos: defina PRECO_TREINO / PRECO_CARDAPIOS na Vercel para ligá-los.

const preco = (env, padrao = null) => {
  const n = parseFloat(String(process.env[env] ?? '').replace(',', '.'));
  return n > 0 && n < 1000 ? n : padrao;
};

const BASE_IMG = '/img';
const ITENS = {
  treino: {
    id: 'treino', flag: 'treino', hotmartId: 9300002, preco: preco('PRECO_TREINO'), de: preco('PRECO_TREINO_DE'),
    nome: 'Treino Personalizado', titulo: 'Treino Personalizado — montado pelo educador físico Luiz Miranda (CREF 008925-G/RJ)',
    imagem: '/img/firme.png',
    desc: 'Seu treino montado do seu jeito\n✓ Avaliação própria sobre rotina, local de treino, nível e restrições\n✓ Treino montado pelo educador físico, com vídeos e imagens de cada exercício\n✓ Entregue no mesmo aplicativo do seu plano alimentar\n⚡ O prazo de entrega começa quando você enviar a avaliação.',
    cta: 'Sim, quero o meu treino personalizado!',
  },
  airfryer_express: {
    id: 'airfryer_express', flag: 'airfryer_express', hotmartId: 9300003, preco: preco('PRECO_AIRFRYER', 14.9), de: preco('PRECO_AIRFRYER_DE'),
    nome: 'Airfryer Express', titulo: 'Airfryer Express — 30 receitas rápidas para almoço, jantar e lanche',
    imagem: `${BASE_IMG}/airfryer_express.webp`,
    desc: 'Mais variedade no dia a dia com a sua airfryer\n✓ 30 receitas para almoço, jantar e lanche, com porções para dois\n✓ Tempo, temperatura, calorias por porção e dicas de ponto e crocância\n✓ Ingredientes comuns e preparo organizado em poucos passos\n⚡ PDF para baixar, ler no celular ou imprimir.',
    cta: 'Sim, quero o Airfryer Express!',
  },
  cozinha_multiplica: {
    id: 'cozinha_multiplica', flag: 'cozinha_multiplica', hotmartId: 9300004, preco: preco('PRECO_COZINHA', 12.9), de: preco('PRECO_COZINHA_DE'),
    nome: 'Cozinha Multiplica', titulo: 'Cozinha Multiplica — cozinhe 1, coma 3',
    imagem: `${BASE_IMG}/cozinha_multiplica.webp`,
    desc: 'Cozinhe uma vez e tenha três refeições diferentes\n✓ 20 preparos-base que viram 3 finalizações cada: 60 combinações\n✓ Porções para dois e dicas de conservação\n✓ Menos tempo na cozinha ao longo da semana\n⚡ PDF para baixar, ler no celular ou imprimir.',
    cta: 'Sim, quero o Cozinha Multiplica!',
  },
  cardapios: {
    id: 'cardapios', flag: 'cardapios', hotmartId: 9300005, preco: preco('PRECO_CARDAPIOS'), de: preco('PRECO_CARDAPIOS_DE'),
    nome: 'Cardápios da Semana', titulo: 'Cardápios da Semana — 4 semanas de almoços e jantares planejados',
    imagem: `${BASE_IMG}/cardapios.webp`,
    desc: '',
  },
  dose_doce: {
    id: 'dose_doce', flag: 'dose_doce', hotmartId: 9300006, preco: preco('PRECO_DOSE_DOCE', 9.9), de: preco('PRECO_DOSE_DOCE_DE'),
    nome: 'Dose Doce', titulo: 'Dose Doce — 20 receitas de sobremesa com porções definidas',
    imagem: `${BASE_IMG}/dose_doce.webp`,
    desc: '',
  },
};
const ativo = (i) => !!i.preco;

export const PRODUTOS = {
  firme: {
    nome: 'Programa FIRME',
    preco: preco('PRECO_FIRME', 27), hotmartId: 9300001, // id interno da oferta (dashboard, opcional)
    precoSaida: 0, imagemSaida: '',
    flag: 'firme',
    clarityId: '',
    appUrl: process.env.APP_URL || 'https://programafirme.isabellabianchi.com.br',
    titulo: 'Programa FIRME — plano alimentar com a nutricionista Isabella Bianchi',
    imagem: '/img/firme.png',
    inclui: ['Avaliação nutricional e plano alimentar feito à mão pela nutricionista', 'Bônus: Pronto em 5, Guia do Mercado Inteligente e Fome de Quê?', 'Chat com a nutricionista dentro do aplicativo'],
    cor: '#0E8F6A', bg: '#F1F7F4', rodape: 'Isabella Bianchi · Nutricionista · CRN 7104141',
    depoimentos: [],
    // Links avulsos (/firme/<id>): itens vendidos dentro do app, só o item (sem produto principal e sem bumps).
    avulsos: Object.values(ITENS).filter(ativo),
    // Order bumps. grupo 'b2': o quiz decide qual aparece (airfryer ou cozinha); sem informação, aparece o Cozinha Multiplica.
    bumps: [
      { ...ITENS.treino, grupo: 'b1' },
      { ...ITENS.airfryer_express, grupo: 'b2', quando: 'airfryer' },
      { ...ITENS.cozinha_multiplica, grupo: 'b2', quando: 'cozinha' },
    ].filter(ativo),
  },
};

// Modo de teste: se PRECO_TESTE_CENTAVOS existir (ex.: 100), cada item (produto e bumps) custa esse valor.
export function precoTeste() {
  const n = parseInt(process.env.PRECO_TESTE_CENTAVOS || '', 10);
  return n >= 1 && n <= 1000 ? n : 0;
}
export const precoItem = (p) => (precoTeste() ? precoTeste() / 100 : p);

// Variáveis de ambiente do pixel/CAPI: META_PIXEL_ID_FIRME etc.
export const envId = (id) => String(PRODUTOS[id]?.pixelDe || id).toUpperCase();

export function calcular(produtoId, bumpIds = [], saida = false, avulsoId = '', precoAvulso = null) {
  const p = PRODUTOS[produtoId];
  if (!p) return null;
  if (avulsoId) {
    const a = (p.avulsos || []).find((x) => x.id === avulsoId);
    if (!a) return null;
    const centavos = Math.round(precoItem(precoAvulso != null ? precoAvulso : a.preco) * 100);
    return { produto: p, avulso: a, saida: false, itens: [{ produto_id: a.hotmartId, nome: a.nome, valor: centavos / 100 }], flags: [a.flag], centavos, valor: (centavos / 100).toFixed(2), bumps: [], escolhidos: [] };
  }
  // No máximo um bump por grupo de escolha do quiz (b2): evita pedido com os dois da mesma vaga.
  const vistos = new Set();
  const escolhidos = p.bumps.filter((b) => {
    if (!bumpIds.includes(b.id)) return false;
    if (b.grupo === 'b2') { if (vistos.has('b2')) return false; vistos.add('b2'); }
    return true;
  });
  const flags = [p.flag, ...escolhidos.map((b) => b.flag)];
  const base = Math.round(precoItem(p.preco) * 100);
  const centavos = base + escolhidos.reduce((s, b) => s + Math.round(precoItem(b.preco) * 100), 0);
  const itens = [
    { produto_id: p.hotmartId, nome: p.nome, valor: base / 100 },
    ...escolhidos.map((b) => ({ produto_id: b.hotmartId, nome: b.nome, valor: Math.round(precoItem(b.preco) * 100) / 100 })),
  ];
  return { produto: p, saida: false, itens, flags, centavos, valor: (centavos / 100).toFixed(2), bumps: escolhidos.map((b) => b.id), escolhidos };
}
