// Upstash Redis REST (estado do checkout: pedidos, travas e agendamentos). Banco dedicado a este checkout.
const URL_ = () => process.env.KV_REST_API_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN;

export async function cmd(args) {
  const r = await fetch(URL_(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}
