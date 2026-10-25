# checkout-isabella

Checkout próprio do Programa FIRME (Pix e cartão, Mercado Pago Orders), derivado do checkout-luveris.
HTML estático + funções da Vercel em `api/` (sem dependências). O acesso é liberado gravando em `public.acessos` do Supabase do app.

Rotas: `/firme` (produto + bumps; `?b2=airfryer|cozinha` escolhe o bump 2 do quiz) e `/firme/<item>` (compra avulsa de dentro do app: treino, airfryer_express, cozinha_multiplica, cardapios, dose_doce).

Fluxo: `/api/pagar` cria o pedido no MP e guarda o registro no Redis → webhook/polling chamam `processarPedido` (idempotente) → `definirAcessos` (Supabase) → e-mail de entrega (Resend, com login por código e links /baixar dos PDFs) → CAPI Purchase.
Reembolso: remove o acesso (`ativo=false`) e envia e-mail.

Itens sem preço (Treino e Cardápios) ficam ocultos até definir `PRECO_TREINO` / `PRECO_CARDAPIOS`. Variáveis: ver `.env.example`.

Pendente: `/api/lead` + `qsid` (quiz), upsell pós-compra (Cardápios), capa do Treino, pixel/CAPI e Clarity do FIRME.

## Dashboard
O checkout avisa o dashboard (`/api/webhooks/checkout`) de cada pedido (`ORDER_STATUS`), venda (`PURCHASE_APPROVED`) e reembolso (`PURCHASE_REFUNDED`), com UTM/fbclid em `atrib`. É o mesmo formato dos outros produtos. Cadastre o funil e as ofertas com `docs/dashboard-firme.sql` e configure `DASHBOARD_URL` e `DASHBOARD_WEBHOOK_SECRET`. Em modo de teste (preço de teste ou Pix de teste) nada é enviado.
