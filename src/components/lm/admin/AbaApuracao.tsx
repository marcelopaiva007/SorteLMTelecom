import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminResumo,
  adminVisaoGeral,
  apurarCampanha,
  apurarCampanhaPropria,
} from "@/lib/admin.functions";
import {
  Aviso,
  Campo,
  ConfirmacaoPerigosa,
  Esqueleto,
  ErroAoCarregar,
  Etiqueta,
  Painel,
  Vazio,
  botao,
  texto,
} from "./ui";

type Modo = "loteria_federal" | "sorteio_proprio";

type Campanha = {
  id: string;
  nome: string;
  premio: string;
  status: string;
  data_apuracao: string;
  digitos_cartela: number;
  numero_sorteado: number | null;
  modo_apuracao: Modo;
  apuracao: {
    modo?: Modo;
    concurso?: string;
    data?: string;
    premios?: string[];
    numero_base?: number;
    realizado_em?: string;
    transmissao?: string;
    auditores?: string[];
    apurado_em?: string;
    apurado_por?: string;
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
  const apurarFederal = useServerFn(apurarCampanha);
  const apurarProprio = useServerFn(apurarCampanhaPropria);
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
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [digitado, setDigitado] = useState("");

  // Loteria Federal
  const [concurso, setConcurso] = useState("");
  const [dataExtracao, setDataExtracao] = useState("");
  const [premios, setPremios] = useState<string[]>(["", "", "", "", ""]);

  // Sorteio próprio
  const [numero, setNumero] = useState("");
  const [realizadoEm, setRealizadoEm] = useState("");
  const [transmissao, setTransmissao] = useState("");
  const [auditores, setAuditores] = useState("");

  const escolhida = apuraveis.find((c) => c.id === id) ?? null;
  const modo: Modo = escolhida?.modo_apuracao ?? "loteria_federal";
  const digitos = escolhida?.digitos_cartela ?? 4;

  const primeiro = premios[0]?.replace(/\D/g, "") ?? "";
  const numeroLimpo = numero.replace(/\D/g, "");

  // O número base é de onde a busca do ganhador começa. Na Loteria Federal ele
  // vem dos últimos dígitos do 1º prêmio; no sorteio próprio é o número que
  // saiu ao vivo.
  const base =
    modo === "loteria_federal"
      ? primeiro
        ? primeiro.padStart(digitos, "0").slice(-digitos)
        : null
      : numeroLimpo
        ? numeroLimpo.padStart(digitos, "0").slice(-digitos)
        : null;

  const listaAuditores = auditores
    .split(/[,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);

  const escolhidosNaVigente =
    visao?.campanha?.id === id ? (visao?.escolhidos ?? null) : null;

  function limpar() {
    setConfirmando(false);
    setDigitado("");
  }

  const mutar = useMutation({
    mutationFn: () =>
      modo === "loteria_federal"
        ? apurarFederal({
            data: {
              id,
              concurso,
              data_extracao: dataExtracao,
              premios: premios.filter((p) => p.trim() !== ""),
            },
          })
        : apurarProprio({
            data: {
              id,
              numero: Number(numeroLimpo),
              realizado_em: new Date(realizadoEm).toISOString(),
              transmissao: transmissao.trim(),
              auditores: listaAuditores,
            },
          }),
    onSuccess: (r) => {
      limpar();
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
    (modo === "loteria_federal"
      ? concurso.trim() !== "" && dataExtracao !== "" && primeiro !== ""
      : numeroLimpo !== "" &&
        realizadoEm !== "" &&
        transmissao.trim() !== "" &&
        listaAuditores.length > 0);

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
                  limpar();
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

            {/* A forma de apurar é da campanha, congelada desde a abertura. O
                formulário segue a campanha; não há escolha a fazer aqui. */}
            {escolhida && (
              <div className="flex items-center gap-2">
                <Etiqueta tom="ativo">
                  {modo === "sorteio_proprio"
                    ? "Sorteio próprio"
                    : "Loteria Federal"}
                </Etiqueta>
                <span className={texto.legenda}>
                  definido na criação da campanha e congelado desde a abertura
                </span>
              </div>
            )}

            {escolhida && modo === "loteria_federal" && (
              <>
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
              </>
            )}

            {escolhida && modo === "sorteio_proprio" && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <Campo
                    label="Número sorteado ao vivo"
                    ajuda={`${digitos} dígitos, de ${"0".repeat(digitos)} a ${"9".repeat(digitos)}`}
                  >
                    <input
                      className={botao.input + " num"}
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      placeholder={"0".repeat(digitos)}
                      inputMode="numeric"
                    />
                  </Campo>
                  <Campo label="Data e hora do sorteio">
                    <input
                      type="datetime-local"
                      className={botao.input + " num"}
                      value={realizadoEm}
                      onChange={(e) => setRealizadoEm(e.target.value)}
                    />
                  </Campo>
                </div>

                <Campo
                  label="Link da gravação da transmissão"
                  ajuda="É o que sustenta o resultado no lugar da extração da Caixa. Precisa ficar público e no ar."
                >
                  <input
                    className={botao.input}
                    value={transmissao}
                    onChange={(e) => setTransmissao(e.target.value)}
                    placeholder="https://…"
                  />
                </Campo>

                <Campo
                  label="Auditores presentes"
                  ajuda="Um por linha, ou separados por vírgula. Nome e cargo."
                >
                  <textarea
                    rows={3}
                    className={botao.input}
                    value={auditores}
                    onChange={(e) => setAuditores(e.target.value)}
                    placeholder={
                      "Fulano de Tal — contabilidade\nSicrana de Tal — jurídico"
                    }
                  />
                </Campo>
              </>
            )}

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
                  {modo === "sorteio_proprio" && (
                    <>
                      <dt className="text-muted-foreground">Auditores</dt>
                      <dd>
                        {listaAuditores.length > 0
                          ? listaAuditores.join(" · ")
                          : "informe ao menos um"}
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Número base</dt>
                  <dd className="num text-foreground">
                    {base
                      ? base
                      : modo === "loteria_federal"
                        ? "informe o 1º prêmio"
                        : "informe o número sorteado"}
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
                aoCancelar={limpar}
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
              const a = c.apuracao ?? null;
              const proprio =
                (a?.modo ?? c.modo_apuracao) === "sorteio_proprio";
              return (
                <div key={c.id} className="border border-border p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="titulo text-[14px]">{c.nome}</span>
                    <Etiqueta tom="bom">apurada</Etiqueta>
                    <Etiqueta>
                      {proprio ? "sorteio próprio" : "Loteria Federal"}
                    </Etiqueta>
                    <span className="ml-auto num text-[12px] text-muted-foreground">
                      {dataBR(c.data_apuracao)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Passo
                      rotulo={proprio ? "Sorteado ao vivo" : "1º prêmio"}
                      valor={
                        proprio
                          ? a?.numero_base !== undefined
                            ? String(a.numero_base).padStart(
                                c.digitos_cartela,
                                "0",
                              )
                            : "—"
                          : (a?.premios?.[0] ?? "—")
                      }
                    />
                    <Passo
                      rotulo="Número base"
                      valor={
                        a?.numero_base !== undefined
                          ? String(a.numero_base).padStart(
                              c.digitos_cartela,
                              "0",
                            )
                          : "—"
                      }
                    />
                    <Passo
                      rotulo="Com dono"
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

                  {proprio ? (
                    <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
                      {a?.realizado_em && (
                        <>
                          Sorteado em{" "}
                          <span className="num">
                            {new Date(a.realizado_em).toLocaleString("pt-BR")}
                          </span>
                          .{" "}
                        </>
                      )}
                      {a?.transmissao && (
                        <>
                          <a
                            href={a.transmissao}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline underline-offset-2"
                          >
                            Gravação da transmissão
                          </a>
                          .{" "}
                        </>
                      )}
                      {a?.auditores?.length ? (
                        <>Auditores: {a.auditores.join(" · ")}.</>
                      ) : null}
                    </p>
                  ) : (
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Concurso <span className="num">{a?.concurso ?? "—"}</span>
                      {a?.data && (
                        <>
                          {" "}
                          de{" "}
                          <span className="num">{dataBR(String(a.data))}</span>
                        </>
                      )}
                    </p>
                  )}

                  {a?.apurado_em && (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Apurado em{" "}
                      <span className="num">
                        {new Date(a.apurado_em).toLocaleString("pt-BR")}
                      </span>
                      {a.apurado_por && <> por {a.apurado_por}</>}
                    </p>
                  )}
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
