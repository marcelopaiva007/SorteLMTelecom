import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@/components/lm/Layout";
import { usePainel } from "@/hooks/usePainel";
import { dataHoraBR, formatarNumero } from "@/lib/sessao";

export const Route = createFileRoute("/meus-numeros")({
  head: () => ({
    meta: [
      { title: "Meus números — Sorteio LM" },
      {
        name: "description",
        content: "Todos os números que você já escolheu na campanha e o histórico de créditos com a origem de cada um.",
      },
      { property: "og:title", content: "Meus números — Sorteio LM" },
      { property: "og:description", content: "Seus números e o histórico de créditos no Sorteio LM." },
    ],
  }),
  component: MeusNumeros,
});

function MeusNumeros() {
  const { data, isLoading } = usePainel();

  if (isLoading || !data || !data.ok) {
    return (
      <Layout>
        <p className="text-sm text-muted-foreground">Carregando seus números…</p>
      </Layout>
    );
  }

  const digitos = data.campanha?.digitos_cartela ?? 6;

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl leading-none">Meus números</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {data.meusNumeros.length} escolhido(s) · {data.saldo} disponível(is)
          </p>
        </div>

        {data.meusNumeros.length === 0 ? (
          <div className="border border-border bg-card p-4">
            <p className="text-[13px] text-muted-foreground">
              Você ainda não escolheu nenhum número.
            </p>
            <Link
              to="/cartela"
              className="titulo mt-3 block border border-primary bg-primary px-4 py-3 text-center text-sm tracking-widest text-primary-foreground"
            >
              Ir para a cartela
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {data.meusNumeros.map((n) => (
              <span
                key={n.numero}
                className="num border border-dashed border-primary px-1 py-2 text-center text-[13px] text-primary"
              >
                {formatarNumero(n.numero, digitos)}
              </span>
            ))}
          </div>
        )}

        <div className="border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2 text-base">Histórico de créditos</h2>
          <ul>
            {data.creditos.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between border-b border-border px-4 py-2 last:border-b-0"
              >
                <div>
                  <p className="text-[13px]">{c.rotulo}</p>
                  <p className="num text-[11px] text-muted-foreground">
                    {dataHoraBR(c.criado_em)}
                    {c.competencia ? ` · ${c.competencia}` : ""}
                  </p>
                </div>
                <span className="num text-lg text-primary">+{c.quantidade}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <span className="titulo text-[11px] tracking-widest text-muted-foreground">
              Total ganho
            </span>
            <span className="num text-lg">{data.totalCreditos}</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
