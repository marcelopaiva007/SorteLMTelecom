import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CriterioCongelado, Layout, SeloOficial } from "@/components/lm/Layout";
import { carregarResultado } from "@/lib/sorteio.functions";
import { dataBR, formatarNumero } from "@/lib/sessao";

export const Route = createFileRoute("/resultado")({
  head: () => ({
    meta: [
      { title: "Resultado — Sorteio LM" },
      {
        name: "description",
        content: "Número sorteado ao vivo, com globos físicos, e o ganhador da campanha da L&M Telecom.",
      },
      { property: "og:title", content: "Resultado — Sorteio LM" },
      { property: "og:description", content: "Resultado oficial da campanha do Sorteio L&M Telecom." },
    ],
  }),
  component: Resultado,
});

function Resultado() {
  const fn = useServerFn(carregarResultado);
  const { data, isLoading } = useQuery({ queryKey: ["resultado"], queryFn: () => fn({}) });

  if (isLoading || !data) {
    return (
      <Layout>
        <p className="text-sm text-muted-foreground">Carregando resultado…</p>
      </Layout>
    );
  }

  const campanha = data.campanha;

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl leading-none">Resultado</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {campanha?.nome} · {campanha?.premio}
          </p>
        </div>

        {!data.apurada ? (
          <div className="border border-border bg-card p-4">
            <p className="titulo text-[11px] tracking-widest text-muted-foreground">
              Ainda não apurada
            </p>
            <p className="mt-2 text-[13px]">
              A apuração acontece em{" "}
              <span className="num">{dataBR(campanha?.data_apuracao ?? "")}</span>, em estúdio e
              transmitida ao vivo, com globos físicos — um globo por dígito. O resultado aparece
              aqui logo depois, com o número sorteado e o ganhador.
            </p>
          </div>
        ) : (
          <>
            <div className="border border-premio bg-card p-4 text-center">
              <p className="titulo text-[11px] tracking-widest text-muted-foreground">
                Número sorteado ao vivo
              </p>
              <p className="num text-6xl leading-none text-premio-texto">
                {formatarNumero(campanha?.numero_sorteado ?? 0, campanha?.digitos_cartela ?? 6)}
              </p>
              <div className="serrilha my-3" />
              <p className="text-[13px]">
                Ganhador: <strong>{data.ganhador ?? "—"}</strong>
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Prêmio: {campanha?.premio}
              </p>
            </div>
            <div className="border border-border bg-card p-4">
              <p className="titulo text-[11px] tracking-widest text-muted-foreground">
                Como o ganhador foi encontrado
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Sorteio ao vivo com globos físicos, um por dígito. A partir do número sorteado, a
                busca sobe até o primeiro número com dono; ao chegar ao fim da cartela, continua a
                partir do <span className="num">000000</span>.
              </p>
            </div>
          </>
        )}


        {campanha && (
          <CriterioCongelado
            criterio={campanha.criterio_apuracao}
            congeladoEm={campanha.criterio_congelado_em}
          />
        )}

        <SeloOficial />
      </div>
    </Layout>
  );
}
