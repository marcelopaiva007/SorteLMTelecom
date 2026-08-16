import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminResumo,
  chaveErp,
  girarChaveErp,
  processarEventos,
} from "@/lib/admin.functions";
import {
  Aviso,
  Campo,
  ConfirmacaoPerigosa,
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

const ENDPOINT = "/api/erp/eventos";

// O que o time do ERP precisa receber: endereço, cabeçalho e chave. Fica no
// painel porque é aqui que a pessoa que fala com o ERP já está — mandar ela
// procurar num arquivo do repositório é o que mantinha a integração parada.
function ChaveDoErp() {
  const ler = useServerFn(chaveErp);
  const girar = useServerFn(girarChaveErp);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "chave-erp"],
    queryFn: () => ler({}),
  });

  const [aberta, setAberta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const mutar = useMutation({
    mutationFn: () => girar({}),
    onSuccess: (r) => {
      if (r.ok) {
        setErro(null);
        setConfirmando(false);
        setDigitado("");
        setAberta(true);
        qc.invalidateQueries({ queryKey: ["admin", "chave-erp"] });
      } else setErro(r.erro);
    },
  });

  async function copiar(valor: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro("O navegador não liberou a cópia. Selecione e copie na mão.");
    }
  }

  if (isLoading) return <Esqueleto linhas={3} />;
  if (data && !data.ok) return <ErroAoCarregar>{data.erro}</ErroAoCarregar>;

  const endereco =
    typeof window !== "undefined"
      ? window.location.origin + ENDPOINT
      : ENDPOINT;
  const noAmbiente = data?.origem === "ambiente";
  const chave = data?.origem === "banco" ? data.chave : null;

  return (
    <Painel
      titulo="Chave de integração"
      descricao="O que o time do ERP precisa para começar a enviar"
      acao={
        !noAmbiente && (
          <button
            className={botao.secundario}
            onClick={() => {
              setConfirmando(true);
              setErro(null);
            }}
          >
            Gerar chave nova
          </button>
        )
      }
    >
      <div className="grid gap-3">
        <Campo label="Endereço" ajuda="POST, com corpo JSON">
          <div className="flex gap-2">
            <input className={botao.input + " num"} value={endereco} readOnly />
            <button
              className={botao.secundario}
              onClick={() => copiar(endereco, "endereco")}
            >
              {copiado === "endereco" ? "Copiado" : "Copiar"}
            </button>
          </div>
        </Campo>

        <Campo label="Cabeçalho" ajuda="Nome do cabeçalho que leva a chave">
          <input
            className={botao.input + " num"}
            value="x-erp-chave"
            readOnly
          />
        </Campo>

        {noAmbiente ? (
          <Aviso>
            A chave está definida como variável de ambiente na hospedagem, então
            o painel não a lê. Para vê-la ou trocá-la, use o painel da
            hospedagem.
          </Aviso>
        ) : chave ? (
          <Campo label="Chave">
            <div className="flex gap-2">
              <input
                className={botao.input + " num"}
                type={aberta ? "text" : "password"}
                value={chave}
                readOnly
              />
              <button
                className={botao.secundario}
                onClick={() => setAberta((v) => !v)}
              >
                {aberta ? "Ocultar" : "Mostrar"}
              </button>
              <button
                className={botao.secundario}
                onClick={() => copiar(chave, "chave")}
              >
                {copiado === "chave" ? "Copiado" : "Copiar"}
              </button>
            </div>
          </Campo>
        ) : (
          <Aviso tom="perigo">
            <span className="titulo text-[12px] tracking-widest">
              Sem chave configurada
            </span>
            <br />
            Enquanto não houver chave, o endereço acima recusa tudo que o ERP
            enviar. Gere uma agora e passe ao time do ERP.
          </Aviso>
        )}

        {erro && <Aviso tom="perigo">{erro}</Aviso>}

        {confirmando && (
          <ConfirmacaoPerigosa
            alvo="gerar chave"
            aviso={
              <>
                A chave atual deixa de valer e o ERP passa a receber recusa até
                alguém configurar a chave nova do lado de lá. Combine a troca
                antes de gerar.
              </>
            }
            rotuloAcao="Gerar chave nova"
            digitado={digitado}
            aoDigitar={setDigitado}
            aoConfirmar={() => mutar.mutate()}
            aoCancelar={() => {
              setConfirmando(false);
              setDigitado("");
            }}
            ocupado={mutar.isPending}
          />
        )}

        <p className={texto.legenda}>
          O formato do corpo e os exemplos de chamada estão em{" "}
          <span className="titulo text-[12px] tracking-wide">
            docs/INTEGRACAO-ERP.md
          </span>
          .
        </p>
      </div>
    </Painel>
  );
}

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
          O conector do ERP ainda não chamou nenhuma vez. Enquanto isso, nenhum
          evento entra e nenhum cliente ganha número. Passe ao time do ERP o
          endereço e a chave logo abaixo.
        </Aviso>
      )}

      <ChaveDoErp />

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
