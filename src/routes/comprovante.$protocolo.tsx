import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Layout, SeloOficial } from "@/components/lm/Layout";
import { buscarComprovante } from "@/lib/sorteio.functions";
import { dataHoraBR, formatarNumero, lerToken } from "@/lib/sessao";

export const Route = createFileRoute("/comprovante/$protocolo")({
  head: () => ({
    meta: [
      { title: "Comprovante de escolha — Sorteio LM" },
      {
        name: "description",
        content: "Comprovante com os números escolhidos, protocolo, data e hora da sua participação no Sorteio LM.",
      },
      { property: "og:title", content: "Comprovante — Sorteio LM" },
      { property: "og:description", content: "Seus números confirmados no Sorteio L&M Telecom." },
    ],
  }),
  component: Comprovante,
});

function Comprovante() {
  const { protocolo } = Route.useParams();
  const fn = useServerFn(buscarComprovante);
  const { data, isLoading } = useQuery({
    queryKey: ["comprovante", protocolo],
    queryFn: () => fn({ data: { token: lerToken() ?? "", protocolo } }),
  });

  if (isLoading || !data || !data.ok) {
    return (
      <Layout>
        <p className="text-sm text-muted-foreground">Carregando comprovante…</p>
      </Layout>
    );
  }

  const quando = data.numeros[0]?.escolhido_em;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="border border-primary bg-card">
          <div className="border-b border-border px-4 py-2">
            <h1 className="text-xl leading-none">Números confirmados</h1>
            <p className="text-[11px] text-muted-foreground">{data.campanha?.premio}</p>
          </div>

          <div className="grid grid-cols-4 gap-1 p-3">
            {data.numeros.map((n) => (
              <span
                key={n.numero}
                className="num border border-primary bg-primary px-1 py-2 text-center text-[13px] text-primary-foreground"
              >
                {formatarNumero(n.numero, data.campanha?.digitos_cartela ?? 6)}
              </span>
            ))}
          </div>

          <div className="serrilha" />

          <dl className="grid grid-cols-2 gap-y-2 p-4 text-[12px]">
            <dt className="titulo tracking-widest text-muted-foreground">Protocolo</dt>
            <dd className="num text-right">{data.protocolo}</dd>
            <dt className="titulo tracking-widest text-muted-foreground">Data e hora</dt>
            <dd className="num text-right">{quando ? dataHoraBR(quando) : "—"}</dd>
            <dt className="titulo tracking-widest text-muted-foreground">Titular</dt>
            <dd className="text-right">{data.nome}</dd>
            <dt className="titulo tracking-widest text-muted-foreground">Quantidade</dt>
            <dd className="num text-right">{data.numeros.length}</dd>
          </dl>
        </div>

        <div className="flex gap-2">
          <Link
            to="/meus-numeros"
            className="titulo flex-1 border border-primary px-3 py-3 text-center text-[12px] tracking-widest text-primary"
          >
            Meus números
          </Link>
          <Link
            to="/cartela"
            className="titulo flex-1 border border-border px-3 py-3 text-center text-[12px] tracking-widest text-muted-foreground"
          >
            Voltar à cartela
          </Link>
        </div>

        <SeloOficial />
      </div>
    </Layout>
  );
}
