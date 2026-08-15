import { createFileRoute, Link } from "@tanstack/react-router";
import { CriterioCongelado, Layout, Progresso, SeloOficial } from "@/components/lm/Layout";
import { usePainel } from "@/hooks/usePainel";
import { dataBR } from "@/lib/sessao";

export const Route = createFileRoute("/saldo")({
  head: () => ({
    meta: [
      { title: "Meu saldo de números — Sorteio LM" },
      {
        name: "description",
        content: "Veja quantos números você já ganhou, de onde veio cada crédito e o que fazer para ganhar mais no mês seguinte.",
      },
      { property: "og:title", content: "Meu saldo de números — Sorteio LM" },
      { property: "og:description", content: "Seu saldo de números do Sorteio L&M Telecom." },
    ],
  }),
  component: Saldo,
});

function Saldo() {
  const { data, isLoading } = usePainel();

  if (isLoading || !data || !data.ok) {
    return (
      <Layout>
        <p className="text-sm text-muted-foreground">Carregando seu saldo…</p>
      </Layout>
    );
  }

  const { cliente, campanha, creditos, saldo, meusNumeros, ocupados, participantes } = data;
  const total = Math.pow(10, campanha?.digitos_cartela ?? 6);
  const preenchida = (ocupados.length / total) * 100;
  const proximoBonus = 6 - (cliente.mesesEmDia % 6);
  const porMensalidade = Math.min(6, 3 + Math.floor(cliente.mesesEmDia / 6));

  return (
    <Layout>
      <div className="space-y-4">
        <div className="border border-primary bg-card p-4">
          <p className="titulo text-[11px] tracking-widest text-muted-foreground">
            Seus números disponíveis
          </p>
          <div className="flex items-end gap-3">
            <span className="num text-6xl leading-none text-primary">{saldo}</span>
            <span className="titulo pb-1 text-[12px] tracking-widest text-muted-foreground">
              para escolher
            </span>
          </div>
          <div className="serrilha my-3" />
          <p className="text-[12px] text-muted-foreground">
            Olá, {cliente.primeiroNome}. Você já escolheu{" "}
            <span className="num text-foreground">{meusNumeros.length}</span> número(s) nesta
            campanha.
          </p>
          {saldo > 0 && (
            <Link
              to="/cartela"
              className="titulo mt-3 block border border-primary bg-primary px-4 py-3 text-center text-sm tracking-widest text-primary-foreground"
            >
              Escolher meus números
            </Link>
          )}
        </div>

        <div className="border border-premio bg-card p-4">
          <p className="titulo text-[11px] tracking-widest text-premio-texto">Prêmio da campanha</p>
          <h2 className="text-2xl leading-none text-premio-texto">{campanha?.premio}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {campanha?.nome} · apuração ao vivo em{" "}
            <span className="num">{dataBR(campanha?.data_apuracao ?? "")}</span>
          </p>

          <div className="mt-3 space-y-1">
            <Progresso valor={preenchida} />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span className="num">
                {ocupados.length} de {total} números da cartela
              </span>
              <span className="num">{participantes} participantes</span>
            </div>
          </div>
        </div>

        {campanha && (
          <CriterioCongelado
            criterio={campanha.criterio_apuracao}
            congeladoEm={campanha.criterio_congelado_em}
          />
        )}

        <div className="border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2 text-base">De onde vieram</h2>
          <ul>
            {creditos.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between border-b border-border px-4 py-2 last:border-b-0"
              >
                <div>
                  <p className="text-[13px]">{c.rotulo}</p>
                  {c.competencia && (
                    <p className="num text-[11px] text-muted-foreground">
                      competência {c.competencia}
                    </p>
                  )}
                </div>
                <span className="num text-lg text-primary">+{c.quantidade}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-border bg-primary/5 p-4">
          <p className="titulo text-[11px] tracking-widest text-muted-foreground">
            Para o mês que vem
          </p>
          <p className="mt-1 text-[13px]">
            Pagando a mensalidade em dia você ganha{" "}
            <span className="num text-primary">+{porMensalidade}</span> números. Faltam{" "}
            <span className="num text-primary">{proximoBonus}</span> mês(es) em dia seguidos para
            subir mais 1 por mês (teto de 6).
          </p>
        </div>

        <SeloOficial />
      </div>
    </Layout>
  );
}
