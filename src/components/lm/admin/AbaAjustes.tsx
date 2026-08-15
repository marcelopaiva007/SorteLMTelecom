import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminResumo, salvarConfiguracao } from "@/lib/admin.functions";
import { Aviso, Campo, Painel, botao } from "./ui";

export function AbaAjustes() {
  const resumo = useServerFn(adminResumo);
  const salvar = useServerFn(salvarConfiguracao);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "resumo"], queryFn: () => resumo({}) });

  const [valores, setValores] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (data?.configuracoes) {
      setValores(Object.fromEntries(data.configuracoes.map((c: any) => [c.chave, c.valor])));
    }
  }, [data]);

  const mutar = useMutation({
    mutationFn: async () => {
      for (const [chave, valor] of Object.entries(valores)) {
        const r = await salvar({ data: { chave, valor } });
        if (!r.ok) return r;
      }
      return { ok: true as const };
    },
    onSuccess: (r) => {
      if (r.ok) {
        setErro(null);
        setSalvo(true);
        qc.invalidateQueries({ queryKey: ["admin"] });
        qc.invalidateQueries({ queryKey: ["configuracoes-publicas"] });
      } else setErro(r.erro ?? "Não foi possível salvar.");
    },
  });

  return (
    <div className="max-w-2xl">
      <Painel titulo="Dados da empresa">
        <div className="grid gap-3">
          {(data?.configuracoes ?? []).map((c: any) => (
            <Campo key={c.chave} label={c.descricao ?? c.chave}>
              <input
                className={botao.input + (c.chave === "cnpj" ? " num" : "")}
                value={valores[c.chave] ?? ""}
                onChange={(e) => {
                  setSalvo(false);
                  setValores({ ...valores, [c.chave]: e.target.value });
                }}
              />
            </Campo>
          ))}
        </div>
        {erro && <Aviso tom="destaque">{erro}</Aviso>}
        {salvo && <Aviso>Dados gravados. O selo de campanha oficial já usa o novo valor.</Aviso>}
        <Aviso>
          O CNPJ aparece no selo &ldquo;Campanha oficial L&M Telecom&rdquo; em todas as telas do
          cliente. Substitua o valor fictício pelo CNPJ verdadeiro da L&M Telecom.
        </Aviso>
        <button
          className={botao.primario + " mt-3"}
          disabled={mutar.isPending}
          onClick={() => mutar.mutate()}
        >
          Salvar
        </button>
      </Painel>
    </div>
  );
}
