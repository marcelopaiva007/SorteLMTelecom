import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CriterioCongelado, Layout, Progresso } from "@/components/lm/Layout";
import { usePainel } from "@/hooks/usePainel";
import { escolherNumeros } from "@/lib/sorteio.functions";
import { formatarNumero } from "@/lib/sessao";

export const Route = createFileRoute("/cartela")({
  head: () => ({
    meta: [
      { title: "Cartela — Sorteio LM" },
      {
        name: "description",
        content: "Escolha seus números na cartela do Sorteio LM. Números ocupados aparecem riscados; o botão Sorte da casa preenche o restante.",
      },
      { property: "og:title", content: "Cartela — Sorteio LM" },
      { property: "og:description", content: "Escolha livremente seus números, como numa rifa — mas de graça." },
    ],
  }),
  component: Cartela,
});

function Cartela() {
  const { data, isLoading, token, refetch } = usePainel();
  const navigate = useNavigate();
  const confirmar = useServerFn(escolherNumeros);
  const [bloco, setBloco] = useState(0);
  const [selecao, setSelecao] = useState<number[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ocupados = useMemo(
    () => new Set(data && data.ok ? data.ocupados : []),
    [data],
  );
  const meus = useMemo(
    () => new Set(data && data.ok ? data.meusNumeros.map((n) => n.numero) : []),
    [data],
  );

  if (isLoading || !data || !data.ok) {
    return (
      <Layout>
        <p className="text-sm text-muted-foreground">Carregando a cartela…</p>
      </Layout>
    );
  }

  const digitos = data.campanha?.digitos_cartela ?? 6;
  const total = Math.pow(10, digitos);
  const blocos = total / 100;
  const saldo = data.saldo;
  const restante = saldo - selecao.length;

  function alternar(n: number) {
    setErro(null);
    setSelecao((atual) => {
      if (atual.includes(n)) return atual.filter((x) => x !== n);
      if (atual.length >= saldo) return atual;
      return [...atual, n];
    });
  }

  function sorteDaCasa() {
    setErro(null);
    const livres: number[] = [];
    for (let n = 0; n < total; n++) {
      if (!ocupados.has(n) && !selecao.includes(n)) livres.push(n);
    }
    const escolhidos = [...selecao];
    while (escolhidos.length < saldo && livres.length) {
      const i = Math.floor(Math.random() * livres.length);
      escolhidos.push(livres.splice(i, 1)[0]!);
    }
    setSelecao(escolhidos);
  }

  async function enviar() {
    if (!token || !selecao.length) return;
    setEnviando(true);
    setErro(null);
    const r = await confirmar({ data: { token, numeros: selecao } });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro);
      refetch();
      return;
    }
    setSelecao([]);
    navigate({ to: "/comprovante/$protocolo", params: { protocolo: r.protocolo } });
  }

  const inicio = bloco * 100;

  return (
    <Layout>
      <div className="space-y-4 pb-24">
        <div>
          <h1 className="text-2xl leading-none">Cartela</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Escolha livremente. Riscado = já ocupado. Tracejado = já é seu.
          </p>
        </div>

        <div className="border border-border bg-card p-3">
          <div className="flex items-baseline justify-between">
            <span className="titulo text-[11px] tracking-widest text-muted-foreground">
              Disponíveis para você
            </span>
            <span className="num text-2xl text-primary">{restante}</span>
          </div>
          <div className="mt-2">
            <Progresso valor={(data.ocupados.length / total) * 100} />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span className="num">
                {data.ocupados.length}/{total} preenchidos
              </span>
              <span className="num">{data.participantes} participantes</span>
            </div>
          </div>
        </div>

        {data.campanha && (
          <CriterioCongelado
            criterio={data.campanha.criterio_apuracao}
            congeladoEm={data.campanha.criterio_congelado_em}
          />
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={sorteDaCasa}
            disabled={restante <= 0}
            className="titulo flex-1 border border-primary px-3 py-2 text-[12px] tracking-widest text-primary disabled:opacity-40"
          >
            Sorte da casa
          </button>
          <button
            onClick={() => setSelecao([])}
            disabled={!selecao.length}
            className="titulo flex-1 border border-border px-3 py-2 text-[12px] tracking-widest text-muted-foreground disabled:opacity-40"
          >
            Limpar
          </button>
        </div>

        <div className="border border-border bg-card p-2">
          <p className="titulo mb-2 px-1 text-[11px] tracking-widest text-muted-foreground">
            Centena
          </p>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {Array.from({ length: blocos }, (_, b) => (
              <button
                key={b}
                onClick={() => setBloco(b)}
                className={`num shrink-0 border px-2 py-1 text-[11px] ${
                  b === bloco
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {formatarNumero(b * 100, digitos)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 100 }, (_, i) => {
            const n = inicio + i;
            const meu = meus.has(n);
            const ocupado = ocupados.has(n) && !meu;
            const sel = selecao.includes(n);
            return (
              <button
                key={n}
                disabled={ocupado || meu}
                onClick={() => alternar(n)}
                className={[
                  "num border px-1 py-2 text-[12px]",
                  ocupado
                    ? "border-border bg-muted text-muted-foreground line-through opacity-60"
                    : meu
                      ? "border-dashed border-primary text-primary"
                      : sel
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground",
                ].join(" ")}
              >
                {formatarNumero(n, digitos)}
              </button>
            );
          })}
        </div>

        {erro && (
          <p className="border border-destaque bg-destaque/10 px-3 py-2 text-[12px] text-destaque">
            {erro}
          </p>
        )}
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 border-t border-border bg-card p-3">
        <button
          onClick={enviar}
          disabled={!selecao.length || enviando}
          className="titulo w-full border border-primary bg-primary px-4 py-3 text-sm tracking-widest text-primary-foreground disabled:opacity-40"
        >
          {enviando
            ? "Confirmando…"
            : `Confirmar ${selecao.length} número${selecao.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Layout>
  );
}
