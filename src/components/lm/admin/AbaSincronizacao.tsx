import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminResumo, processarEventos } from "@/lib/admin.functions";
import {
  Aviso,
  Esqueleto,
  ErroAoCarregar,
  Etiqueta,
  Indicador,
  Painel,
  Tabela,
  botao,
  celula,
  texto,
} from "./ui";

export function AbaSincronizacao() {
  const resumo = useServerFn(adminResumo);
  const processar = useServerFn(processarEventos);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
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

  if (isLoading) return <Esqueleto linhas={6} />;
  if (error) return <ErroAoCarregar />;

  const sinc = (data?.sincronizacoes ?? []) as {
    id: string;
    iniciado_em: string;
    origem: string;
    status: string;
    clientes_lidos: number;
    eventos_lidos: number;
    duplicados_barrados: number;
    erro: string | null;
  }[];
  const falhas = data?.falhasSeguidas ?? 0;
  const nuncaLeu = !data?.ultimaLeitura;

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
              : "o conector ainda não chamou"
          }
          alerta={nuncaLeu || falhas >= 3}
        />
        <Indicador
          rotulo="Clientes espelhados"
          valor={(data?.clientesEspelhados ?? 0).toLocaleString("pt-BR")}
          nota="somente leitura do ERP"
        />
        <Indicador
          rotulo="Eventos do dia"
          valor={(data?.eventosHoje ?? 0).toLocaleString("pt-BR")}
          nota="no fuso de Brasília"
        />
        <Indicador
          rotulo="Duplicados barrados"
          valor={(data?.duplicadosBarrados ?? 0).toLocaleString("pt-BR")}
          nota="pela chave idempotente"
        />
      </div>

      {falhas >= 3 && (
        <Aviso tom="perigo">
          <span className="titulo text-[12px] tracking-widest">
            {falhas} falhas seguidas na leitura
          </span>
          <br />
          Nenhum evento novo está entrando. Enquanto isso, cliente que paga em
          dia não recebe número.
        </Aviso>
      )}

      {nuncaLeu && (
        <Aviso tom="alerta">
          O conector do ERP ainda não chamou nenhuma vez. O contrato da
          integração está em{" "}
          <span className="titulo text-[12px] tracking-wide">
            docs/INTEGRACAO-ERP.md
          </span>
          : o ERP posta em <span className="num">/api/erp/eventos</span> com a
          chave combinada.
        </Aviso>
      )}

      <Painel
        titulo="Processar eventos"
        descricao="Para carga inicial e retomada depois de falha"
      >
        <Aviso>
          Todo evento novo vira crédito sozinho, na hora em que entra. Este
          botão passa pelos eventos que ainda não viraram crédito nem bloqueio.
          Rodar duas vezes não credita duas vezes.
        </Aviso>
        {resultado && <Aviso tom="bom">{resultado}</Aviso>}
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        <button
          className={botao.primario + " mt-3"}
          disabled={mutar.isPending}
          onClick={() => mutar.mutate()}
        >
          {mutar.isPending ? "Processando…" : "Processar eventos pendentes"}
        </button>
      </Painel>

      <Painel titulo="Histórico de leituras">
        <Tabela
          colunas={[
            { titulo: "Início", largura: "w-44" },
            { titulo: "Origem" },
            { titulo: "Situação" },
            { titulo: "Clientes", alinhamento: "direita" },
            { titulo: "Eventos", alinhamento: "direita" },
            { titulo: "Duplicados", alinhamento: "direita" },
            { titulo: "Observação" },
          ]}
          vazio="Nenhuma leitura registrada. O histórico começa na primeira chamada do conector."
          total={sinc.length}
          limite={20}
        >
          {sinc.map((s) => (
            <tr key={s.id} className="border-b border-border/60">
              <td className={celula + " num text-[13px]"}>
                {new Date(s.iniciado_em).toLocaleString("pt-BR")}
              </td>
              <td className={celula + " text-[13px] text-muted-foreground"}>
                {s.origem}
              </td>
              <td className={celula}>
                <Etiqueta tom={s.status === "falha" ? "perigo" : "bom"}>
                  {s.status}
                </Etiqueta>
              </td>
              <td className={celula + " num text-right"}>{s.clientes_lidos}</td>
              <td className={celula + " num text-right"}>{s.eventos_lidos}</td>
              <td className={celula + " num text-right"}>
                {s.duplicados_barrados}
              </td>
              <td className={celula + " text-[13px] text-muted-foreground"}>
                {s.erro ?? "—"}
              </td>
            </tr>
          ))}
        </Tabela>

        <p className={texto.legenda + " mt-3"}>
          A integração é de mão única: o Sorteio LM lê o que o ERP envia e nunca
          escreve nele.
        </p>
      </Painel>
    </div>
  );
}
