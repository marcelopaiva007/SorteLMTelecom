import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminResumo, apurarCampanha } from "@/lib/admin.functions";
import { Aviso, Campo, Painel, botao } from "./ui";

type Campanha = {
  id: string;
  nome: string;
  premio: string;
  status: string;
  data_apuracao: string;
  digitos_cartela: number;
  numero_sorteado: number | null;
  extracao_federal: unknown;
};

const PREMIOS = [
  "1º prêmio",
  "2º prêmio",
  "3º prêmio",
  "4º prêmio",
  "5º prêmio",
];

export function AbaApuracao() {
  const resumo = useServerFn(adminResumo);
  const apurar = useServerFn(apurarCampanha);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin", "resumo"],
    queryFn: () => resumo({}),
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
  const [feito, setFeito] = useState<{ base: number; sorteado: number } | null>(
    null,
  );
  const [confirmando, setConfirmando] = useState(false);

  const escolhida = apuraveis.find((c) => c.id === id) ?? null;
  const digitos = escolhida?.digitos_cartela ?? 4;
  const primeiro = premios[0]?.replace(/\D/g, "") ?? "";
  const base = primeiro
    ? primeiro.padStart(digitos, "0").slice(-digitos)
    : null;

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
      if (r.ok) {
        setErro(null);
        setFeito({ base: r.numeroBase, sorteado: r.numeroSorteado });
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

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Painel titulo="Apurar campanha">
        <Aviso>
          A apuração é feita uma vez só e não pode ser refeita. A partir do
          número sorteado, a busca sobe até o primeiro número com dono; ao
          chegar ao fim da cartela, continua do{" "}
          <span className="num">{"0".repeat(digitos)}</span>.
        </Aviso>

        {apuraveis.length === 0 ? (
          <Aviso tom="destaque">
            Nenhuma campanha aberta ou encerrada para apurar.
          </Aviso>
        ) : (
          <div className="mt-3 grid gap-3">
            <Campo label="Campanha">
              <select
                className={botao.input}
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  setFeito(null);
                  setErro(null);
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
                      setFeito(null);
                    }}
                    placeholder="000000"
                  />
                </Campo>
              ))}
            </div>

            {base && (
              <Aviso>
                Número base: os <span className="num">{digitos}</span> últimos
                dígitos do 1º prêmio dão{" "}
                <span className="num text-foreground">{base}</span>.
              </Aviso>
            )}

            {erro && <Aviso tom="destaque">{erro}</Aviso>}

            {feito && (
              <Aviso>
                <span className="titulo text-[12px] tracking-widest">
                  Campanha apurada
                </span>
                <br />
                Número base{" "}
                <span className="num">
                  {String(feito.base).padStart(digitos, "0")}
                </span>{" "}
                · número sorteado{" "}
                <span className="num text-foreground">
                  {String(feito.sorteado).padStart(digitos, "0")}
                </span>
                . O resultado já aparece na tela do cliente.
              </Aviso>
            )}

            {!confirmando ? (
              <button
                className={botao.primario + " mt-1"}
                disabled={!pronto}
                onClick={() => {
                  setErro(null);
                  setConfirmando(true);
                }}
              >
                Apurar
              </button>
            ) : (
              <div className="mt-1 border border-destaque bg-destaque/10 p-3">
                <p className="text-[12px] text-destaque">
                  Confirma a apuração de <strong>{escolhida?.nome}</strong>?
                  Esta ação é definitiva: o ganhador não pode ser trocado
                  depois.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    className={botao.primario}
                    disabled={mutar.isPending}
                    onClick={() => mutar.mutate()}
                  >
                    {mutar.isPending ? "Apurando…" : "Confirmar apuração"}
                  </button>
                  <button
                    className={botao.secundario}
                    onClick={() => setConfirmando(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Painel>

      <Painel titulo="Campanhas já apuradas">
        {apuradas.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nenhuma campanha apurada ainda.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Campanha</th>
                <th>Apuração</th>
                <th className="text-right">Sorteado</th>
              </tr>
            </thead>
            <tbody>
              {apuradas.map((c) => (
                <tr key={c.id} className="border-b border-border/60">
                  <td className="py-2 pr-2">
                    <div className="titulo text-[13px]">{c.nome}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.premio}
                    </div>
                  </td>
                  <td className="num text-[12px] text-muted-foreground">
                    {new Date(c.data_apuracao + "T12:00:00").toLocaleDateString(
                      "pt-BR",
                    )}
                  </td>
                  <td className="num text-right">
                    {c.numero_sorteado !== null
                      ? String(c.numero_sorteado).padStart(
                          c.digitos_cartela,
                          "0",
                        )
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Painel>
    </div>
  );
}
