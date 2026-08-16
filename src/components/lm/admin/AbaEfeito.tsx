import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminEfeito } from "@/lib/admin.functions";
import {
  Aviso,
  Esqueleto,
  ErroAoCarregar,
  Etiqueta,
  IndicadorVariacao,
  Painel,
  Vazio,
  celula,
  texto,
} from "./ui";

const MES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function rotulo(mes: string) {
  const [ano, m] = mes.split("-");
  return `${MES[Number(m) - 1]}/${ano?.slice(2)}`;
}

type Campo = "reativacao" | "quitacao_debito" | "mensalidade_em_dia";

const GATILHOS: { campo: Campo; nome: string }[] = [
  { campo: "reativacao", nome: "Reativações" },
  { campo: "quitacao_debito", nome: "Quitações de débito" },
  { campo: "mensalidade_em_dia", nome: "Pagamentos em dia" },
];

/**
 * Efeito no negócio.
 *
 * A conclusão desta tela é a variação — se o sorteio mudou o comportamento da
 * base ou não. Ela estava em texto de 11px cinza embaixo do valor absoluto;
 * agora é o número grande, e o absoluto virou legenda.
 */
export function AbaEfeito() {
  const fn = useServerFn(adminEfeito);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "efeito"],
    queryFn: () => fn({}),
  });

  if (isLoading) return <Esqueleto linhas={6} />;
  if (error) return <ErroAoCarregar />;

  const linhas = data?.linhas ?? [];
  const com = linhas.filter((l) => l.comSorteio);
  const sem = linhas.filter((l) => !l.comSorteio);

  if (linhas.length === 0) {
    return (
      <Painel titulo="Efeito no negócio">
        <Vazio>
          Ainda não há eventos espelhados do ERP. Assim que o conector começar a
          enviar, a comparação entre os meses com e sem sorteio aparece aqui.
        </Vazio>
      </Painel>
    );
  }

  const media = (arr: typeof linhas, campo: Campo) =>
    arr.length ? arr.reduce((a, l) => a + (l[campo] ?? 0), 0) / arr.length : 0;

  const maior = Math.max(
    1,
    ...linhas.map(
      (l) => l.reativacao + l.quitacao_debito + l.mensalidade_em_dia,
    ),
  );

  const semComparacao = com.length === 0 || sem.length === 0;

  return (
    <div className="grid gap-4">
      <Painel
        titulo="Antes e depois do sorteio"
        descricao="Média mensal dos meses com campanha aberta contra a dos meses anteriores"
      >
        {semComparacao ? (
          <Aviso tom="alerta">
            Ainda não dá para comparar: são necessários meses com campanha
            aberta <em>e</em> meses anteriores sem campanha. Por enquanto só
            existem{" "}
            {com.length === 0 ? "meses sem sorteio" : "meses com sorteio"}.
          </Aviso>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {GATILHOS.map(({ campo, nome }) => {
              const depois = media(com, campo);
              const antes = media(sem, campo);
              const variacao =
                antes > 0 ? ((depois - antes) / antes) * 100 : null;
              return (
                <IndicadorVariacao
                  key={campo}
                  rotulo={nome}
                  variacao={variacao}
                  valor={`${depois.toFixed(1)}/mês`}
                  nota={`antes ${antes.toFixed(1)}/mês`}
                />
              );
            })}
          </div>
        )}
      </Painel>

      <Painel titulo="Mês a mês">
        <div className="border border-border">
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="border-b border-border">
                  {["Mês", "Reativações", "Quitações", "Em dia", "Volume"].map(
                    (t, i) => (
                      <th
                        key={t}
                        className={`titulo px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-muted-foreground ${
                          i > 0 && i < 4 ? "text-right" : "text-left"
                        } ${i === 4 ? "w-1/3" : ""}`}
                      >
                        {t}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-muted/40">
                {linhas.map((l) => {
                  const total =
                    l.reativacao + l.quitacao_debito + l.mensalidade_em_dia;
                  return (
                    <tr
                      key={l.mes}
                      className={`border-b border-border/60 ${l.comSorteio ? "bg-primary/5" : ""}`}
                    >
                      <td className={celula + " num"}>
                        {rotulo(l.mes)}
                        {l.comSorteio && (
                          <span className="ml-2">
                            <Etiqueta tom="ativo">sorteio</Etiqueta>
                          </span>
                        )}
                      </td>
                      <td className={celula + " num text-right"}>
                        {l.reativacao}
                      </td>
                      <td className={celula + " num text-right"}>
                        {l.quitacao_debito}
                      </td>
                      <td className={celula + " num text-right"}>
                        {l.mensalidade_em_dia}
                      </td>
                      <td className={celula}>
                        <div className="h-2.5 w-full border border-border bg-muted">
                          <div
                            className={
                              l.comSorteio
                                ? "h-full bg-primary"
                                : "h-full bg-muted-foreground/40"
                            }
                            style={{ width: `${(total / maior) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className={texto.legenda + " mt-3"}>
          A faixa azul marca os meses em que havia campanha aberta. A comparação
          é descritiva, não prova causa: outros fatores do mês entram no mesmo
          número.
        </p>
      </Painel>
    </div>
  );
}
