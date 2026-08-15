import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminEfeito } from "@/lib/admin.functions";
import { Aviso, Indicador, Painel } from "./ui";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotulo(mes: string) {
  const [ano, m] = mes.split("-");
  return `${MES[Number(m) - 1]}/${ano?.slice(2)}`;
}

export function AbaEfeito() {
  const fn = useServerFn(adminEfeito);
  const { data } = useQuery({ queryKey: ["admin", "efeito"], queryFn: () => fn({}) });
  const linhas = data?.linhas ?? [];

  const com = linhas.filter((l) => l.comSorteio);
  const sem = linhas.filter((l) => !l.comSorteio);

  const media = (arr: typeof linhas, campo: "reativacao" | "quitacao_debito" | "mensalidade_em_dia") =>
    arr.length ? arr.reduce((a, l) => a + (l[campo] ?? 0), 0) / arr.length : 0;

  const cartao = (campo: "reativacao" | "quitacao_debito" | "mensalidade_em_dia", nome: string) => {
    const a = media(com, campo);
    const b = media(sem, campo);
    const variacao = b > 0 ? ((a - b) / b) * 100 : 0;
    return (
      <Indicador
        key={campo}
        rotulo={nome}
        valor={`${a.toFixed(1)}/mês`}
        nota={`antes ${b.toFixed(1)}/mês · ${variacao >= 0 ? "+" : ""}${variacao.toFixed(0)}%`}
      />
    );
  };

  const maior = Math.max(
    1,
    ...linhas.map((l) => l.reativacao + l.quitacao_debito + l.mensalidade_em_dia),
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        {cartao("reativacao", "Reativações")}
        {cartao("quitacao_debito", "Quitações de débito")}
        {cartao("mensalidade_em_dia", "Pagamentos em dia")}
      </div>

      <Painel titulo="Mês a mês">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2">Mês</th>
              <th className="text-right">Reativações</th>
              <th className="text-right">Quitações</th>
              <th className="text-right">Em dia</th>
              <th className="w-1/3 pl-4">Volume</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const total = l.reativacao + l.quitacao_debito + l.mensalidade_em_dia;
              return (
                <tr key={l.mes} className="border-b border-border/60">
                  <td className="num py-2">
                    {rotulo(l.mes)}
                    {l.comSorteio && (
                      <span className="titulo ml-2 border border-primary px-1 text-[10px] tracking-widest text-primary">
                        sorteio
                      </span>
                    )}
                  </td>
                  <td className="num text-right">{l.reativacao}</td>
                  <td className="num text-right">{l.quitacao_debito}</td>
                  <td className="num text-right">{l.mensalidade_em_dia}</td>
                  <td className="pl-4">
                    <div className="h-2 w-full border border-border bg-muted">
                      <div
                        className={l.comSorteio ? "h-full bg-primary" : "h-full bg-muted-foreground/40"}
                        style={{ width: `${(total / maior) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Aviso>
          Comparação entre a média mensal dos meses com sorteio ativo e a dos meses anteriores, a
          partir dos eventos espelhados do ERP.
        </Aviso>
      </Painel>
    </div>
  );
}
