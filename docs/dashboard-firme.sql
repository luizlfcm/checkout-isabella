-- Dashboard "Ads × Faturamento": cadastro do funil e das ofertas do Programa FIRME.
-- Rodar uma vez no SQL Editor do Supabase DO DASHBOARD (não o do app). Pode rodar de novo sem duplicar.
-- 1) Troque act_COLOQUE_AQUI pelo ID da conta de anúncios que vai rodar o FIRME (formato act_123...).
--    O token do Meta do dashboard precisa ter acesso a essa conta (Configurações do Negócio > Contas de anúncio).
insert into funis (id, conta_anuncio_id, ativo) values ('BM 4', 'act_COLOQUE_AQUI', true)
on conflict (id) do nothing;

-- 2) Ofertas (mesmos IDs internos de api/_lib/produtos.js do checkout)
insert into ofertas (produto_id, nome, tipo, funil_id) values
  (9300001, 'Programa FIRME', 'Front', 'BM 4'),
  (9300002, 'Treino Personalizado', 'OrderBump', 'BM 4'),
  (9300003, 'Airfryer Express', 'OrderBump', 'BM 4'),
  (9300004, 'Cozinha Multiplica', 'OrderBump', 'BM 4'),
  (9300005, 'Cardápios da Semana', 'Upsell', 'BM 4'),
  (9300006, 'Dose Doce', 'Upsell', 'BM 4'),
  (9300007, 'Atualização do plano (45 dias)', 'Upsell', 'BM 4')
on conflict (produto_id) do nothing;
