import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminResumo,
  adminVisaoGeral,
  apurarCampanha,
} from "@/lib/admin.functions";
import {
  Aviso,
  Campo,
  ConfirmacaoPerigosa,
  Esqueleto,
  ErroAoCarregar,
  Etiqueta,
  Painel,
  Tabela,
  Vazio,
  botao,
  celula,
  texto,
} from "./ui";

type Campanha = {
  id: string;
  nome: string;
  premio: string;
  status: string;
  data_apuracao: string;
  digitos_cartela: number;
  numero_sorteado: number | null;
  extracao_federal: {
    concurso?: string;
    data?: string;
    premios?: string[];
    numero_base?: number;
    apurado_em?: string;
  } | null;
};

const PREMIOS = [
  "1º prêmio",
  "2º prêmio",
  "3º prêmio",
  "4º prêmio",
  "5º prêmio",
];

function dataBR(iso: string) {
  return new Date(
    iso + (iso.length === 10 ? "T12:00:00" : ""),
  ).toLocaleDateString("pt-BR");
}

export function AbaApuracao() {
  const resumo = useServerFn(adminResumo);
  const geral = useServerFn(adminVisaoGeral);
  const apurar = useServerFn(apurarCampanha);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "resumo"],
    queryFn: () => resumo({}),
  });
  const { data: visao } = useQuery({
    queryKey: ["admin", "visao-geral"],
    queryFn: () => geral({}),
  });

  const campanhas = (data?.campanhas ?? []) as Campanha[];
  const apuraveis = campanhas.filter(
    (c) => c.status === "aberta" || c.status === "encerrada",
  );
  const apuradas = campanhas.filter((c) => c.status === "apurada");

  const [id, setId] = useState("");
  const [concurso, setConcurso] = useState("");
  const [dataExtracao, setDataExtracao] = useState("");
  const [premios, setPremios] = useState<string[]>(["", "", "", "", ""]);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [digitado, setDigitado] = useState("");

  const escolhida = apuraveis.find((c) => c.id === id) ?? null;
  const digitos = escolhida?.digitos_cartela ?? 4;
  const primeiro = premios[0]?.replace(/\D/g, "") ?? "";
  const base = primeiro
    ? primeiro.padStart(digitos, "0").slice(-digitos)
    : null;

  // Os números já escolhidos só são conhecidos da campanha vigente; é a
  // informação que falta para o operador saber o tamanho do que vai apurar.
  const escolhidosNaVigente =
    visao?.campanha?.id === id ? (visao?.escolhidos ?? null) : null;

  const mutar = useMutation({
    mutationFn: () =>
      apurar({
        data: {
          id,
          concurso,
          data_extracao: dataExtracao,
          premios: premios.filter((p) => p.trim() !== ""),
        },
      }),
    onSuccess: (r) => {
      setConfirmando(false);
      setDigitado("");
      if (r.ok) {
        setErro(null);
        qc.invalidateQueries({ queryKey: ["admin"] });
      } else {
        setErro(r.erro);
      }
    },
  });

  const pronto =
    id !== "" &&
    concurso.trim() !== "" &&
    dataExtracao !== "" &&
    primeiro !== "";

  if (isLoading) return <Esqueleto linhas={6} />;
  if (error) return <ErroAoCarregar />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <Painel titulo="Apurar campanha" descricao="Ação definitiva" tom="perigo">
        <Aviso tom="perigo">
          <span className="titulo text-[12px] tracking-widest">
            Não tem volta
          </span>
          <br />
          Apurar grava o número sorteado e o ganhador, publica o resultado para
          todos os clientes e tranca a campanha. Depois disso o ganhador não
          pode ser trocado, nem por outra apuração.
        </Aviso>

        {apuraveis.length === 0 ? (
          <Vazio>
            Nenhuma campanha aberta ou encerrada para apurar. Uma campanha em
            rascunho precisa ser aberta antes.
          </Vazio>
        ) : (
          <div className="mt-3 grid gap-3">
            <Campo label="Campanha">
              <select
                className={botao.input}
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  setErro(null);
                  setConfirmando(false);
                  setDigitado("");
                }}
              >
                <option value="">Selecione…</option>
                {apuraveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} — {c.premio}
                  </option>
                ))}
              </select>
            </Campo>

            <div className="grid gap-3 md:grid-cols-2">
              <Campo label="Concurso da Loteria Federal">
                <input
                  className={botao.input + " num"}
                  value={concurso}
                  onChange={(e) => setConcurso(e.target.value)}
                  placeholder="0000000"
                />
              </Campo>
              <Campo label="Data da extração">
                <input
                  type="date"
                  className={botao.input + " num"}
                  value={dataExtracao}
                  onChange={(e) => setDataExtracao(e.target.value)}
                />
              </Campo>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              {PREMIOS.map((rotulo, i) => (
                <Campo key={rotulo} label={rotulo}>
                  <input
                    className={botao.input + " num"}
                    value={premios[i] ?? ""}
                    onChange={(e) => {
                      const novos = [...premios];
                      novos[i] = e.target.value;
                      setPremios(novos);
                    }}
                    placeholder="000000"
                  />
                </Campo>
              ))}
            </div>

            {/* Resumo do que vai acontecer, antes do botão. */}
            {escolhida && (
              <div className="border border-border bg-muted p-3">
                <div className={texto.rotulo}>Conferência antes de apurar</div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                  <dt className="text-muted-foreground">Campanha</dt>
                  <dd>{escolhida.nome}</dd>
                  <dt className="text-muted-foreground">Prêmio</dt>
                  <dd>{escolhida.premio}</dd>
                  <dt className="text-muted-foreground">Cartela</dt>
                  <dd className="num">
                    {Math.pow(10, digitos).toLocaleString("pt-BR")} números de{" "}
                    {digitos} dígitos
                  </dd>
                  {escolhidosNaVigente !== null && (
                    <>
                      <dt className="text-muted-foreground">
                        Números com dono
                      </dt>
                      <dd className="num">
                        {escolhidosNaVigente.toLocaleString("pt-BR")}
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Número base</dt>
                  <dd className="num text-foreground">
                    {base ? base : "informe o 1º prêmio"}
                  </dd>
                </dl>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  A busca sobe a partir do número base até o primeiro número com
                  dono; ao chegar ao fim da cartela, continua do{" "}
                  <span className="num">{"0".repeat(digitos)}</span>.
                </p>
              </div>
            )}

            {escolhidosNaVigente === 0 && (
              <Aviso tom="perigo">
                Nenhum número foi escolhido nesta campanha. Não há ganhador
                possível — a apuração vai falhar.
              </Aviso>
            )}

            {erro && <Aviso tom="perigo">{erro}</Aviso>}

            {!confirmando ? (
              <button
                className={botao.perigo}
                disabled={!pronto}
                onClick={() => {
                  setErro(null);
                  setConfirmando(true);
                }}
              >
                Apurar campanha
              </button>
            ) : (
              <ConfirmacaoPerigosa
                alvo={escolhida?.nome ?? ""}
                aviso={
                  <>
                    Isto vai definir o ganhador de{" "}
                    <strong>{escolhida?.premio}</strong> e publicar o resultado
                    para todos os clientes. Não é possível refazer.
                  </>
                }
                rotuloAcao="Apurar e publicar o resultado"
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
          </div>
        )}
      </Painel>

      <Painel
        titulo="Campanhas já apuradas"
        descricao="Cadeia de conferência do resultado"
      >
        {apuradas.length === 0 ? (
          <Vazio>Nenhuma campanha apurada ainda.</Vazio>
        ) : (
          <div className="grid gap-3">
            {apuradas.map((c) => {
              const e = c.extracao_federal ?? null;
              return (
                <div key={c.id} className="border border-border p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="titulo text-[14px]">{c.nome}</span>
                    <Etiqueta tom="bom">apurada</Etiqueta>
                    <span className="ml-auto num text-[12px] text-muted-foreground">
                      {dataBR(c.data_apuracao)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Passo rotulo="1º prêmio" valor={e?.premios?.[0] ?? "—"} />
                    <Passo
                      rotulo="Número base"
                      valor={
                        e?.numero_base !== undefined
                          ? String(e.numero_base).padStart(
                              c.digitos_cartela,
                              "0",
                            )
                          : "—"
                      }
                    />
                    <Passo
                      rotulo="Sorteado"
                      valor={
                        c.numero_sorteado !== null
                          ? String(c.numero_sorteado).padStart(
                              c.digitos_cartela,
                              "0",
                            )
                          : "—"
                      }
                      destaque
                    />
                  </div>

                  <p className="mt-2 text-[12px] text-muted-foreground">
                    Concurso <span className="num">{e?.concurso ?? "—"}</span>
                    {e?.data && (
                      <>
                        {" "}
                        de <span className="num">{dataBR(String(e.data))}</span>
                      </>
                    )}
                    {e?.apurado_em && (
                      <>
                        {" "}
                        · apurado em{" "}
                        <span className="num">
                          {new Date(e.apurado_em).toLocaleString("pt-BR")}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <p className={texto.legenda + " mt-3"}>
          Quem fez a apuração e quando fica registrado na aba de auditoria.
        </p>
      </Painel>
    </div>
  );
}

function Passo({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`border p-2 ${destaque ? "border-premio bg-premio/10" : "border-border"}`}
    >
      <div className="titulo text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {rotulo}
      </div>
      <div
        className={`num mt-1 text-[18px] ${destaque ? "text-premio-texto" : ""}`}
      >
        {valor}
      </div>
    </div>
  );
}
