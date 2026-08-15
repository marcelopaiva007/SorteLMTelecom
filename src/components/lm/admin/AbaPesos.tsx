import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminResumo, salvarRegras } from "@/lib/admin.functions";
import { Aviso, Campo, Indicador, Painel, botao } from "./ui";

type Regra = {
  id: string;
  tipo_evento: string;
  quantidade: number;
  carencia_dias: number;
  limite_meses: number | null;
  bonus_a_cada_meses: number;
  bonus_quantidade: number;
  teto_quantidade: number | null;
};

const ROTULO: Record<string, string> = {
  assinatura: "Assinatura nova",
  reativacao: "Reativação",
  quitacao_debito: "Quitação de débito",
  mensalidade_em_dia: "Pagamento em dia",
};

export function acumulado12Meses(r: Regra | undefined) {
  if (!r) return 0;
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    const passos = r.bonus_a_cada_meses > 0 ? Math.floor((m - 1) / r.bonus_a_cada_meses) : 0;
    let q = r.quantidade + passos * r.bonus_quantidade;
    if (r.teto_quantidade !== null) q = Math.min(q, r.teto_quantidade);
    total += q;
  }
  return total;
}

export function AbaPesos() {
  const resumo = useServerFn(adminResumo);
  const salvar = useServerFn(salvarRegras);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "resumo"], queryFn: () => resumo({}) });

  const [regras, setRegras] = useState<Regra[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (data?.regras) setRegras(data.regras as Regra[]);
  }, [data]);

  const mutar = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          regras: regras.map((r) => ({
            id: r.id,
            quantidade: r.quantidade,
            carencia_dias: r.carencia_dias,
            limite_meses: r.limite_meses,
            bonus_a_cada_meses: r.bonus_a_cada_meses,
            bonus_quantidade: r.bonus_quantidade,
            teto_quantidade: r.teto_quantidade,
          })),
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        setErro(null);
        setSalvo(true);
        qc.invalidateQueries({ queryKey: ["admin"] });
      } else setErro(r.erro);
    },
  });

  function alterar(id: string, campo: keyof Regra, valor: number | null) {
    setSalvo(false);
    setRegras((rs) => rs.map((r) => (r.id === id ? { ...r, [campo]: valor } : r)));
  }

  const fiel = regras.find((r) => r.tipo_evento === "mensalidade_em_dia");
  const novo = regras.find((r) => r.tipo_evento === "assinatura");
  const totalFiel = acumulado12Meses(fiel);
  const totalNovo = novo?.quantidade ?? 0;
  const invertido = totalNovo >= totalFiel;

  const num = (v: number | null) => (v === null ? "" : String(v));

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Painel titulo="Pesos dos gatilhos">
        <div className="grid gap-4">
          {regras.map((r) => (
            <div key={r.id} className="border border-border p-3">
              <div className="titulo mb-2 text-[13px]">{ROTULO[r.tipo_evento] ?? r.tipo_evento}</div>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                <Campo label="Números">
                  <input
                    type="number"
                    className={botao.input + " num"}
                    value={r.quantidade}
                    onChange={(e) => alterar(r.id, "quantidade", Number(e.target.value) || 0)}
                  />
                </Campo>
                <Campo label="Carência (dias)">
                  <input
                    type="number"
                    className={botao.input + " num"}
                    value={r.carencia_dias}
                    onChange={(e) => alterar(r.id, "carencia_dias", Number(e.target.value) || 0)}
                  />
                </Campo>
                <Campo label="Limite por CPF (meses)">
                  <input
                    type="number"
                    className={botao.input + " num"}
                    value={num(r.limite_meses)}
                    onChange={(e) =>
                      alterar(r.id, "limite_meses", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </Campo>
                <Campo label="Escada: +1 a cada (meses)">
                  <input
                    type="number"
                    className={botao.input + " num"}
                    value={r.bonus_a_cada_meses}
                    onChange={(e) =>
                      alterar(r.id, "bonus_a_cada_meses", Number(e.target.value) || 0)
                    }
                  />
                </Campo>
                <Campo label="Bônus / teto">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className={botao.input + " num"}
                      value={r.bonus_quantidade}
                      onChange={(e) =>
                        alterar(r.id, "bonus_quantidade", Number(e.target.value) || 0)
                      }
                    />
                    <input
                      type="number"
                      className={botao.input + " num"}
                      value={num(r.teto_quantidade)}
                      onChange={(e) =>
                        alterar(
                          r.id,
                          "teto_quantidade",
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </div>
                </Campo>
              </div>
            </div>
          ))}
        </div>
        {erro && <Aviso tom="destaque">{erro}</Aviso>}
        {salvo && <Aviso>Pesos gravados na tabela de regras.</Aviso>}
        <button className={botao.primario + " mt-3"} disabled={mutar.isPending} onClick={() => mutar.mutate()}>
          Salvar pesos
        </button>
      </Painel>

      <div className="grid content-start gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Indicador
            rotulo="Bom pagador — 12 meses"
            valor={String(totalFiel)}
            nota="acumulado de quem paga em dia por 12 meses seguidos"
            alerta={invertido}
          />
          <Indicador
            rotulo="Cliente novo ao assinar"
            valor={String(totalNovo)}
            nota="números do primeiro título pago"
            alerta={invertido}
          />
        </div>
        {invertido ? (
          <Aviso tom="destaque">
            <span className="titulo text-[12px] tracking-widest">Pesos invertidos</span>
            <br />
            Com esta configuração o cliente novo ganha{" "}
            <span className="num">{totalNovo}</span> números e o cliente fiel de 12 meses ganha{" "}
            <span className="num">{totalFiel}</span>. O sistema passa a ensinar a base a cancelar e
            voltar. Reduza o peso da assinatura nova ou aumente a escada do bom pagador.
          </Aviso>
        ) : (
          <Aviso>
            Configuração saudável: o cliente fiel de 12 meses acumula{" "}
            <span className="num">{totalFiel}</span> números contra{" "}
            <span className="num">{totalNovo}</span> de quem acabou de assinar.
          </Aviso>
        )}
      </div>
    </div>
  );
}
