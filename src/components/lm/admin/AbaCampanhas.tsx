import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminResumo, salvarCampanha, abrirCampanha } from "@/lib/admin.functions";
import { Aviso, Campo, Painel, botao } from "./ui";

type Campanha = {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  premio: string;
  data_apuracao: string;
  digitos_cartela: number;
  criterio_apuracao: string;
  criterio_congelado_em: string;
  status: string;
};

const VAZIA = {
  nome: "",
  inicio: "",
  fim: "",
  premio: "",
  data_apuracao: "",
  digitos_cartela: 6,
  criterio_apuracao: "",
};

export function AbaCampanhas() {
  const resumo = useServerFn(adminResumo);
  const salvar = useServerFn(salvarCampanha);
  const abrir = useServerFn(abrirCampanha);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["admin", "resumo"], queryFn: () => resumo({}) });
  const campanhas = (data?.campanhas ?? []) as Campanha[];

  const [editando, setEditando] = useState<string | "nova" | null>(null);
  const [form, setForm] = useState({ ...VAZIA });
  const [erro, setErro] = useState<string | null>(null);

  const mutar = useMutation({
    mutationFn: (payload: typeof VAZIA & { id?: string }) => salvar({ data: payload }),

    onSuccess: (r) => {
      if (r.ok) {
        setEditando(null);
        setErro(null);
        qc.invalidateQueries({ queryKey: ["admin"] });
      } else setErro(r.erro);
    },
  });

  const mutarAbrir = useMutation({
    mutationFn: (id: string) => abrir({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });

  function editar(c: Campanha) {
    setErro(null);
    setEditando(c.id);
    setForm({
      nome: c.nome,
      inicio: c.inicio,
      fim: c.fim,
      premio: c.premio,
      data_apuracao: c.data_apuracao,
      digitos_cartela: c.digitos_cartela,
      criterio_apuracao: c.criterio_apuracao,
    });
  }

  const emEdicao = campanhas.find((c) => c.id === editando) ?? null;
  const travado = !!emEdicao && emEdicao.status !== "rascunho";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Painel titulo="Campanhas">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2">Campanha</th>
              <th>Período</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.id} className="border-b border-border/60">
                <td className="py-2 pr-2">
                  <div className="titulo text-[13px]">{c.nome}</div>
                  <div className="text-[11px] text-muted-foreground">{c.premio}</div>
                </td>
                <td className="num text-[12px] text-muted-foreground">
                  {c.inicio.slice(8, 10)}/{c.inicio.slice(5, 7)} — {c.fim.slice(8, 10)}/
                  {c.fim.slice(5, 7)}
                </td>
                <td className="text-[11px] uppercase tracking-wide">{c.status}</td>
                <td className="py-2 text-right">
                  <button className={botao.link} onClick={() => editar(c)}>
                    editar
                  </button>
                  {c.status === "rascunho" && (
                    <button
                      className={botao.link + " ml-2"}
                      onClick={() => mutarAbrir.mutate(c.id)}
                    >
                      abrir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className={botao.secundario + " mt-3"}
          onClick={() => {
            setEditando("nova");
            setErro(null);
            setForm({ ...VAZIA });
          }}
        >
          Nova campanha
        </button>
      </Painel>

      {editando && (
        <Painel titulo={editando === "nova" ? "Nova campanha" : "Editar campanha"}>
          {erro && <Aviso tom="destaque">{erro}</Aviso>}
          <div className="grid gap-3 md:grid-cols-2">
            <Campo label="Nome">
              <input
                className={botao.input}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Campo>
            <Campo label="Prêmio">
              <input
                className={botao.input}
                value={form.premio}
                onChange={(e) => setForm({ ...form, premio: e.target.value })}
              />
            </Campo>
            <Campo label="Início">
              <input
                type="date"
                className={botao.input + " num"}
                value={form.inicio}
                onChange={(e) => setForm({ ...form, inicio: e.target.value })}
              />
            </Campo>
            <Campo label="Fim">
              <input
                type="date"
                className={botao.input + " num"}
                value={form.fim}
                onChange={(e) => setForm({ ...form, fim: e.target.value })}
              />
            </Campo>
            <Campo label="Data de apuração">
              <input
                type="date"
                className={botao.input + " num"}
                value={form.data_apuracao}
                onChange={(e) => setForm({ ...form, data_apuracao: e.target.value })}
              />
            </Campo>
            <Campo label="Dígitos da cartela">
              <input
                type="number"
                min={2}
                max={6}
                className={botao.input + " num"}
                value={form.digitos_cartela}
                onChange={(e) =>
                  setForm({ ...form, digitos_cartela: Number(e.target.value) || 6 })
                }
              />
              <span className="text-[11px] text-muted-foreground">
                {Math.pow(10, form.digitos_cartela).toLocaleString("pt-BR")} números na cartela
              </span>
            </Campo>
          </div>

          <div className="mt-4">
            <Campo label="Critério de apuração">
              <textarea
                rows={4}
                disabled={travado}
                className={botao.input + (travado ? " opacity-70" : "")}
                value={form.criterio_apuracao}
                onChange={(e) => setForm({ ...form, criterio_apuracao: e.target.value })}
              />
            </Campo>
            {travado && emEdicao && (
              <Aviso tom="destaque">
                <span className="titulo text-[11px] tracking-widest">Critério congelado</span> desde{" "}
                <span className="num">
                  {new Date(emEdicao.criterio_congelado_em).toLocaleString("pt-BR")}
                </span>
                . Depois que a campanha abre o critério não pode mais ser editado — é o que sustenta
                o selo de campanha oficial.
              </Aviso>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className={botao.primario}
              disabled={mutar.isPending}
              onClick={() =>
                mutar.mutate({
                  ...(editando !== "nova" ? { id: editando } : {}),
                  ...form,
                })
              }
            >
              Salvar
            </button>
            <button className={botao.secundario} onClick={() => setEditando(null)}>
              Cancelar
            </button>
          </div>
        </Painel>
      )}
    </div>
  );
}
