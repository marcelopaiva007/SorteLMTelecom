import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminResumo, processarEventos } from "@/lib/admin.functions";
import { Aviso, Indicador, Painel, botao } from "./ui";

export function AbaSincronizacao() {
  const resumo = useServerFn(adminResumo);
  const processar = useServerFn(processarEventos);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "resumo"],
    queryFn: () => resumo({}),
  });

  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const mutar = useMutation({
    mutationFn: () => processar({}),
    onSuccess: (r) => {
      if (r.ok) {
        setErro(null);
        setResultado(
          `${r.creditados} evento(s) viraram crédito, ${r.bloqueados} barrado(s) pelas travas, ${r.ignorados} já processado(s).`,
        );
        qc.invalidateQueries({ queryKey: ["admin"] });
      } else {
        setResultado(null);
        setErro(r.erro);
      }
    },
  });

  const sinc = data?.sincronizacoes ?? [];
  const falhas = data?.falhasSeguidas ?? 0;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Indicador
          rotulo="Última leitura"
          valor={
            data?.ultimaLeitura
              ? new Date(data.ultimaLeitura).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }
          nota={
            data?.ultimaLeitura
              ? new Date(data.ultimaLeitura).toLocaleDateString("pt-BR")
              : "sem registro"
          }
        />
        <Indicador
          rotulo="Clientes espelhados"
          valor={String(data?.clientesEspelhados ?? 0)}
          nota="somente leitura do ERP"
        />
        <Indicador
          rotulo="Eventos do dia"
          valor={String(data?.eventosHoje ?? 0)}
        />
        <Indicador
          rotulo="Duplicados barrados"
          valor={String(data?.duplicadosBarrados ?? 0)}
          nota="pela chave idempotente"
        />
      </div>

      {falhas >= 3 && (
        <Aviso tom="destaque">
          <span className="titulo text-[12px] tracking-widest">
            {falhas} falhas seguidas na leitura
          </span>
          <br />
          Nenhum evento novo está sendo espelhado. Verifique o conector do ERP
          antes que créditos deixem de ser gerados.
        </Aviso>
      )}

      <Painel titulo="Processar eventos">
        <Aviso>
          Todo evento novo vira crédito sozinho, na hora em que entra. Este
          botão existe para a carga inicial e para quando o conector do ERP
          voltar depois de uma falha: ele passa pelos eventos que ainda não
          viraram crédito nem bloqueio. Rodar duas vezes não credita duas vezes.
        </Aviso>
        {resultado && <Aviso>{resultado}</Aviso>}
        {erro && <Aviso tom="destaque">{erro}</Aviso>}
        <button
          className={botao.primario + " mt-3"}
          disabled={mutar.isPending}
          onClick={() => mutar.mutate()}
        >
          {mutar.isPending ? "Processando…" : "Processar eventos pendentes"}
        </button>
      </Painel>

      <Painel titulo="Histórico de leituras">
        <Aviso>
          Origem:{" "}
          <span className="titulo text-[11px] tracking-widest">
            aguardando conector do ERP
          </span>{" "}
          — os contadores acima leem as tabelas reais do sistema. A integração é
          somente leitura: o Sorteio LM nunca escreve no ERP.
        </Aviso>
        <table className="mt-3 w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2">Início</th>
              <th>Situação</th>
              <th className="text-right">Clientes</th>
              <th className="text-right">Eventos</th>
              <th className="text-right">Duplicados</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {sinc.map((s: any) => (
              <tr key={s.id} className="border-b border-border/60">
                <td className="num py-2 text-[12px]">
                  {new Date(s.iniciado_em).toLocaleString("pt-BR")}
                </td>
                <td
                  className={
                    "text-[11px] uppercase tracking-wide " +
                    (s.status === "falha"
                      ? "text-destaque"
                      : "text-muted-foreground")
                  }
                >
                  {s.status}
                </td>
                <td className="num text-right">{s.clientes_lidos}</td>
                <td className="num text-right">{s.eventos_lidos}</td>
                <td className="num text-right">{s.duplicados_barrados}</td>
                <td className="text-[12px] text-muted-foreground">
                  {s.erro ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>
    </div>
  );
}
