import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  apostasDoPleito,
  cancelarAposta,
  exportarApostas,
  mudarStatusAposta,
  registrarAposta,
} from "@/lib/apostas.functions";
import {
  CANAIS,
  MAX_NUMEROS_POR_APOSTA,
  ROTULO_CANAL,
  ROTULO_STATUS,
  formatarMoeda,
  interpretarNumeros,
  lerValor,
  resumirNumeros,
  sortearLivres,
  type CanalAposta,
} from "@/lib/apostas";
import { dataHoraBR, formatarDocumento } from "@/lib/sessao";
import { Aviso, Campo, Indicador, Painel, botao } from "./ui";

type FiltroStatus = "todas" | "registrada" | "confirmada" | "cancelada";

const FORM_VAZIO = {
  jogadorId: "",
  nome: "",
  documento: "",
  whatsapp: "",
  numeros: "",
  canal: "balcao" as CanalAposta,
  observacao: "",
};

export function AbaApostas() {
  const carregar = useServerFn(apostasDoPleito);
  const registrar = useServerFn(registrarAposta);
  const cancelar = useServerFn(cancelarAposta);
  const mudarStatus = useServerFn(mudarStatusAposta);
  const exportar = useServerFn(exportarApostas);
  const qc = useQueryClient();

  const [pleitoId, setPleitoId] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("todas");
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [novoJogador, setNovoJogador] = useState(false);
  const [valorManual, setValorManual] = useState<string | null>(null);
  const [quantidadeSorte, setQuantidadeSorte] = useState("10");
  const [erro, setErro] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<{
    protocolo: string;
    quantidade: number;
  } | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "apostas", pleitoId, busca, status],
    queryFn: () =>
      carregar({
        data: {
          ...(pleitoId ? { campanhaId: pleitoId } : {}),
          busca,
          status,
        },
      }),
  });

  const pleito = data?.pleito ?? null;
  const digitos = pleito?.digitos_cartela ?? 4;
  const encerrado = pleito
    ? ["encerrada", "apurada"].includes(pleito.status)
    : false;

  const ocupados = useMemo(() => new Set(data?.ocupados ?? []), [data]);
  const leitura = useMemo(
    () => interpretarNumeros(form.numeros, digitos),
    [form.numeros, digitos],
  );
  const conflitos = useMemo(
    () => leitura.numeros.filter((n) => ocupados.has(n)),
    [leitura.numeros, ocupados],
  );
  const livresEscolhidos = leitura.numeros.filter((n) => !ocupados.has(n));

  const valorPorNumero = data?.valorPorNumero ?? 0;
  // O módulo é registro de informação: dinheiro só aparece se alguém ajustar
  // apostas_valor_por_numero (ou se já houver valor lançado em apostas antigas).
  const mostrarValor =
    valorPorNumero > 0 || (data?.indicadores?.valorTotal ?? 0) > 0;
  const valorCalculado = valorPorNumero * livresEscolhidos.length;
  const valorTotal =
    valorManual === null ? valorCalculado : lerValor(valorManual);

  const jogadorAtual =
    (data?.jogadores ?? []).find((j) => j.id === form.jogadorId) ?? null;

  const mutarRegistro = useMutation({
    mutationFn: () => {
      if (!pleito) throw new Error("Nenhum pleito selecionado.");
      return registrar({
        data: {
          campanhaId: pleito.id,
          ...(novoJogador
            ? {
                novoJogador: {
                  nome: form.nome.trim(),
                  ...(form.documento.trim()
                    ? { documento: form.documento.trim() }
                    : {}),
                  ...(form.whatsapp.trim()
                    ? { whatsapp: form.whatsapp.trim() }
                    : {}),
                },
              }
            : { jogadorId: form.jogadorId }),
          numeros: leitura.numeros,
          canal: form.canal,
          valorTotal,
          ...(form.observacao.trim()
            ? { observacao: form.observacao.trim() }
            : {}),
        },
      });
    },
    onSuccess: (r) => {
      if (!r.ok) {
        setErro(r.erro);
        setRecibo(null);
        qc.invalidateQueries({ queryKey: ["admin", "apostas"] });
        return;
      }
      setErro(null);
      setRecibo({ protocolo: r.protocolo, quantidade: r.quantidade });
      setForm((f) => ({
        ...FORM_VAZIO,
        canal: f.canal,
        jogadorId: r.jogadorId,
      }));
      setNovoJogador(false);
      setValorManual(null);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  const mutarCancelamento = useMutation({
    mutationFn: (payload: { id: string; motivo: string }) =>
      cancelar({ data: payload }),
    onSuccess: (r) => {
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      setCancelando(null);
      setMotivo("");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const mutarStatus = useMutation({
    mutationFn: (payload: {
      id: string;
      status: "registrada" | "confirmada";
    }) => mudarStatus({ data: payload }),
    onSuccess: (r) => {
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const mutarExportacao = useMutation({
    mutationFn: () => {
      if (!pleito) throw new Error("Nenhum pleito selecionado.");
      return exportar({ data: { campanhaId: pleito.id } });
    },
    onSuccess: (r) => {
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      const blob = new Blob(["﻿" + r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.arquivo;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  function sorteDaCasa() {
    const quantidade = Math.max(
      1,
      Math.min(MAX_NUMEROS_POR_APOSTA, Number(quantidadeSorte) || 0),
    );
    const novos = sortearLivres(quantidade, digitos, ocupados);
    if (!novos.length) {
      setErro("Não há números livres suficientes nesta cartela.");
      return;
    }
    setErro(null);
    setForm((f) => ({
      ...f,
      numeros: novos.map((n) => String(n).padStart(digitos, "0")).join(", "),
    }));
  }

  function removerOcupados() {
    setForm((f) => ({
      ...f,
      numeros: livresEscolhidos
        .map((n) => String(n).padStart(digitos, "0"))
        .join(", "),
    }));
  }

  const podeRegistrar =
    !!pleito &&
    !encerrado &&
    leitura.numeros.length > 0 &&
    conflitos.length === 0 &&
    (novoJogador ? form.nome.trim().length >= 3 : !!form.jogadorId) &&
    !mutarRegistro.isPending;

  const indicadores = data?.indicadores ?? null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Pleito
        </span>
        <select
          className={botao.input + " max-w-md"}
          value={pleito?.id ?? ""}
          onChange={(e) => {
            setPleitoId(e.target.value);
            setRecibo(null);
            setErro(null);
          }}
        >
          {(data?.pleitos ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} — {p.status}
            </option>
          ))}
        </select>
        <button
          className={botao.secundario}
          disabled={!pleito || mutarExportacao.isPending}
          onClick={() => mutarExportacao.mutate()}
        >
          {mutarExportacao.isPending ? "Gerando…" : "Exportar CSV"}
        </button>
        {isFetching && (
          <span className="text-[11px] text-muted-foreground">carregando…</span>
        )}
      </div>

      {!pleito && (
        <Aviso tom="destaque">
          Nenhuma campanha cadastrada ainda. Crie o pleito na aba Campanhas
          antes de registrar apostas.
        </Aviso>
      )}

      {indicadores && (
        <div
          className={
            "grid grid-cols-2 gap-3 " +
            (mostrarValor ? "lg:grid-cols-6" : "lg:grid-cols-5")
          }
        >
          <Indicador
            rotulo="Apostas valendo"
            valor={String(indicadores.apostas)}
            nota={`${indicadores.canceladas} cancelada(s)`}
          />
          <Indicador rotulo="Jogadores" valor={String(indicadores.jogadores)} />
          <Indicador
            rotulo="Números apostados"
            valor={String(indicadores.numerosApostados)}
          />
          <Indicador
            rotulo="Ocupação da cartela"
            valor={`${indicadores.ocupacao.toFixed(1)}%`}
            nota={`${indicadores.numerosCreditos} por crédito`}
          />
          <Indicador
            rotulo="Média por jogador"
            valor={indicadores.mediaPorJogador.toFixed(1)}
            nota="números"
          />
          {mostrarValor && (
            <Indicador
              rotulo="Valor informado"
              valor={formatarMoeda(indicadores.valorTotal)}
            />
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <Painel titulo="Registrar aposta">
          {encerrado ? (
            <Aviso tom="destaque">
              Este pleito está {pleito?.status}. Apostas só entram enquanto a
              campanha está aberta.
            </Aviso>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Jogador
                </span>
                <button
                  className={botao.link}
                  onClick={() => {
                    setNovoJogador((v) => !v);
                    setErro(null);
                  }}
                >
                  {novoJogador ? "escolher da lista" : "cadastrar novo"}
                </button>
              </div>

              {novoJogador ? (
                <div className="grid gap-2">
                  <Campo label="Nome">
                    <input
                      className={botao.input}
                      value={form.nome}
                      onChange={(e) =>
                        setForm({ ...form, nome: e.target.value })
                      }
                      placeholder="Nome completo do jogador"
                    />
                  </Campo>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo label="CPF/CNPJ (opcional)">
                      <input
                        className={botao.input}
                        value={form.documento}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            documento: formatarDocumento(e.target.value),
                          })
                        }
                      />
                    </Campo>
                    <Campo label="WhatsApp (opcional)">
                      <input
                        className={botao.input}
                        value={form.whatsapp}
                        onChange={(e) =>
                          setForm({ ...form, whatsapp: e.target.value })
                        }
                      />
                    </Campo>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    CPF/CNPJ já cadastrado reaproveita o jogador existente, sem
                    duplicar.
                  </p>
                </div>
              ) : (
                <select
                  className={botao.input}
                  value={form.jogadorId}
                  onChange={(e) =>
                    setForm({ ...form, jogadorId: e.target.value })
                  }
                >
                  <option value="">Selecione o jogador…</option>
                  {(data?.jogadores ?? [])
                    .filter((j) => j.ativo)
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nome}
                        {j.documento
                          ? ` — ${formatarDocumento(j.documento)}`
                          : ""}
                      </option>
                    ))}
                </select>
              )}

              <Campo label={`Números (0 a ${Math.pow(10, digitos) - 1})`}>
                <textarea
                  className={botao.input + " min-h-[88px] font-mono"}
                  value={form.numeros}
                  onChange={(e) =>
                    setForm({ ...form, numeros: e.target.value })
                  }
                  placeholder="7, 12, 99 — ou um intervalo: 100-110"
                />
              </Campo>

              <div className="flex items-center gap-2">
                <input
                  className={botao.input + " w-20"}
                  value={quantidadeSorte}
                  onChange={(e) =>
                    setQuantidadeSorte(e.target.value.replace(/\D/g, ""))
                  }
                  aria-label="Quantidade para a sorte da casa"
                />
                <button className={botao.secundario} onClick={sorteDaCasa}>
                  Sorte da casa
                </button>
                <button
                  className={botao.secundario}
                  onClick={() => setForm({ ...form, numeros: "" })}
                >
                  Limpar
                </button>
              </div>

              {leitura.numeros.length > 0 && (
                <div className="border border-border bg-muted p-2 text-[12px] text-muted-foreground">
                  <span className="num text-foreground">
                    {leitura.numeros.length}
                  </span>{" "}
                  número(s) lido(s):{" "}
                  <span className="num">
                    {resumirNumeros(leitura.numeros, digitos, 10)}
                  </span>
                </div>
              )}

              {conflitos.length > 0 && (
                <Aviso tom="destaque">
                  Já têm dono neste pleito:{" "}
                  <span className="num">
                    {resumirNumeros(conflitos, digitos, 10)}
                  </span>
                  .{" "}
                  <button className={botao.link} onClick={removerOcupados}>
                    remover os ocupados
                  </button>
                </Aviso>
              )}

              {(leitura.invalidos.length > 0 ||
                leitura.foraDaCartela.length > 0) && (
                <Aviso>
                  Ignorado por não ser número válido da cartela:{" "}
                  <span className="num">
                    {[
                      ...leitura.invalidos,
                      ...leitura.foraDaCartela.map(String),
                    ]
                      .slice(0, 8)
                      .join(", ")}
                  </span>
                </Aviso>
              )}

              <div
                className={
                  mostrarValor ? "grid grid-cols-2 gap-2" : "grid gap-2"
                }
              >
                <Campo label="Canal">
                  <select
                    className={botao.input}
                    value={form.canal}
                    onChange={(e) =>
                      setForm({ ...form, canal: e.target.value as CanalAposta })
                    }
                  >
                    {CANAIS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.rotulo}
                      </option>
                    ))}
                  </select>
                </Campo>
                {mostrarValor && (
                  <Campo label="Valor informado (R$)">
                    <input
                      className={botao.input}
                      value={valorManual ?? valorCalculado.toFixed(2)}
                      onChange={(e) => setValorManual(e.target.value)}
                    />
                  </Campo>
                )}
              </div>

              <Campo label="Observação (opcional)">
                <input
                  className={botao.input}
                  value={form.observacao}
                  onChange={(e) =>
                    setForm({ ...form, observacao: e.target.value })
                  }
                  placeholder="Ex.: pago no PIX, conferido por Ana"
                />
              </Campo>

              {data && data.limitePorJogador > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Limite do pleito:{" "}
                  <span className="num">{data.limitePorJogador}</span> números
                  por jogador
                  {jogadorAtual
                    ? ` — ${
                        (data.ranking ?? []).find(
                          (r) => r.id === jogadorAtual.id,
                        )?.numeros ?? 0
                      } já registrados para ${jogadorAtual.nome}.`
                    : "."}
                </p>
              )}

              <button
                className={botao.primario}
                disabled={!podeRegistrar}
                onClick={() => mutarRegistro.mutate()}
              >
                {mutarRegistro.isPending
                  ? "Registrando…"
                  : `Registrar ${leitura.numeros.length || ""} número(s)`}
              </button>

              {recibo && (
                <div className="border border-primary bg-primary/5 p-3 text-[12px]">
                  Aposta registrada. Protocolo{" "}
                  <span className="num text-foreground">
                    {recibo.protocolo}
                  </span>{" "}
                  com <span className="num">{recibo.quantidade}</span>{" "}
                  número(s).
                </div>
              )}
            </div>
          )}

          {erro && <Aviso tom="destaque">{erro}</Aviso>}
        </Painel>

        <div className="grid gap-4">
          <Painel
            titulo={`Jogadores no pleito (${data?.ranking?.length ?? 0})`}
          >
            <div className="max-h-[260px] overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2">Jogador</th>
                    <th>CPF/CNPJ</th>
                    <th className="text-right">Apostas</th>
                    <th className="text-right">Números</th>
                    {mostrarValor && <th className="text-right">Valor</th>}
                    <th className="w-40">Última aposta</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.ranking ?? []).map((j) => (
                    <tr key={j.id} className="border-b border-border/60">
                      <td className="py-2 pr-2">
                        {j.nome}
                        {j.apelido && (
                          <span className="text-[11px] text-muted-foreground">
                            {" "}
                            ({j.apelido})
                          </span>
                        )}
                      </td>
                      <td className="num text-[12px] text-muted-foreground">
                        {j.documento ? formatarDocumento(j.documento) : "—"}
                      </td>
                      <td className="num text-right">{j.apostas}</td>
                      <td className="num text-right">{j.numeros}</td>
                      {mostrarValor && (
                        <td className="num text-right">
                          {formatarMoeda(j.valor)}
                        </td>
                      )}
                      <td className="num text-[12px] text-muted-foreground">
                        {j.ultima ? dataHoraBR(j.ultima) : "—"}
                      </td>
                    </tr>
                  ))}
                  {!(data?.ranking ?? []).length && (
                    <tr>
                      <td
                        colSpan={mostrarValor ? 6 : 5}
                        className="py-3 text-[12px] text-muted-foreground"
                      >
                        Nenhuma aposta registrada neste pleito ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Painel>

          <Painel titulo={`Apostas (${data?.apostas.length ?? 0})`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                className={botao.input + " max-w-sm"}
                placeholder="Buscar por protocolo, jogador, CPF/CNPJ ou número"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <select
                className={botao.input + " w-40"}
                value={status}
                onChange={(e) => setStatus(e.target.value as FiltroStatus)}
              >
                <option value="todas">Todas</option>
                <option value="registrada">Registradas</option>
                <option value="confirmada">Confirmadas</option>
                <option value="cancelada">Canceladas</option>
              </select>
            </div>

            <div className="max-h-[460px] overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2">Protocolo</th>
                    <th>Jogador</th>
                    <th>Números</th>
                    <th className="text-right">Qtd</th>
                    <th>Canal</th>
                    <th>Situação</th>
                    <th className="w-40">Registrada em</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(data?.apostas ?? []).map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-border/60 align-top"
                    >
                      <td className="num py-2 pr-2 text-[12px]">
                        {a.protocolo}
                      </td>
                      <td className="pr-2">
                        {a.jogador}
                        {a.documento && (
                          <div className="num text-[11px] text-muted-foreground">
                            {formatarDocumento(a.documento)}
                          </div>
                        )}
                      </td>
                      <td className="num pr-2 text-[12px] text-muted-foreground">
                        {resumirNumeros(a.numeros, digitos)}
                      </td>
                      <td className="num text-right">{a.quantidade}</td>
                      <td className="text-[12px] text-muted-foreground">
                        {ROTULO_CANAL[a.canal] ?? a.canal}
                      </td>
                      <td
                        className={
                          "titulo text-[11px] tracking-wide " +
                          (a.status === "cancelada"
                            ? "text-destaque"
                            : "text-foreground")
                        }
                      >
                        {ROTULO_STATUS[a.status] ?? a.status}
                        {a.status === "cancelada" && a.motivoCancelamento && (
                          <div className="text-[11px] font-normal tracking-normal text-muted-foreground">
                            {a.motivoCancelamento}
                          </div>
                        )}
                      </td>
                      <td className="num text-[12px] text-muted-foreground">
                        {dataHoraBR(a.registradaEm)}
                        {a.registradaPor && (
                          <div className="text-[11px]">{a.registradaPor}</div>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {a.status === "registrada" && (
                          <button
                            className={botao.link}
                            onClick={() =>
                              mutarStatus.mutate({
                                id: a.id,
                                status: "confirmada",
                              })
                            }
                          >
                            confirmar
                          </button>
                        )}
                        {a.status === "cancelada" ? (
                          <button
                            className={botao.link + " ml-2"}
                            onClick={() =>
                              mutarStatus.mutate({
                                id: a.id,
                                status: "registrada",
                              })
                            }
                          >
                            reabrir
                          </button>
                        ) : (
                          <button
                            className={botao.link + " ml-2 text-destaque"}
                            onClick={() => {
                              setCancelando(a.id);
                              setMotivo("");
                            }}
                          >
                            cancelar
                          </button>
                        )}
                        {cancelando === a.id && (
                          <div className="mt-2 flex items-center gap-1">
                            <input
                              className={botao.input + " w-44"}
                              placeholder="Motivo do cancelamento"
                              value={motivo}
                              onChange={(e) => setMotivo(e.target.value)}
                            />
                            <button
                              className={botao.secundario + " px-2 py-1"}
                              disabled={
                                motivo.trim().length < 3 ||
                                mutarCancelamento.isPending
                              }
                              onClick={() =>
                                mutarCancelamento.mutate({
                                  id: a.id,
                                  motivo: motivo.trim(),
                                })
                              }
                            >
                              ok
                            </button>
                            <button
                              className={botao.link}
                              onClick={() => setCancelando(null)}
                            >
                              sair
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!(data?.apostas ?? []).length && (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-3 text-[12px] text-muted-foreground"
                      >
                        Nenhuma aposta encontrada com esse filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">
              Cancelar devolve os números do jogador para a cartela do pleito. O
              histórico fica guardado — nada é apagado.
            </p>
          </Painel>
        </div>
      </div>
    </div>
  );
}
