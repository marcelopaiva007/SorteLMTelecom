import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminAuditoria } from "@/lib/admin.functions";
import { Painel, botao } from "./ui";

const ROTULO: Record<string, string> = {
  assinatura: "Assinatura nova",
  reativacao: "Reativação",
  quitacao_debito: "Quitação de débito",
  mensalidade_em_dia: "Pagamento em dia",
};

const MOTIVO: Record<string, string> = {
  carencia_reativacao: "Carência de reativação",
  limite_por_cpf: "Limite por CPF",
  duplicado_idempotente: "Duplicado (chave idempotente)",
};

export function AbaAuditoria() {
  const fn = useServerFn(adminAuditoria);
  const [busca, setBusca] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["admin", "auditoria", busca],
    queryFn: () => fn({ data: { busca } }),
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <input
          className={botao.input + " max-w-md"}
          placeholder="Buscar por nome, CPF/CNPJ, ID do ERP, tipo de evento ou chave"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {isFetching && <span className="text-[11px] text-muted-foreground">carregando…</span>}
      </div>

      <Painel titulo={`Créditos concedidos (${data?.creditos.length ?? 0})`}>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Cliente</th>
                <th>CPF/CNPJ</th>
                <th>Evento de origem</th>
                <th>Competência</th>
                <th className="pr-8 text-right">Números</th>
                <th className="w-48">Data e hora</th>
              </tr>
            </thead>
            <tbody>
              {(data?.creditos ?? []).map((c) => (
                <tr key={c.id} className="border-b border-border/60">
                  <td className="py-2 pr-2">{c.nome}</td>
                  <td className="num text-[12px] text-muted-foreground">{c.documento}</td>
                  <td>{ROTULO[c.tipo] ?? c.tipo}</td>
                  <td className="num text-[12px] text-muted-foreground">{c.competencia ?? "—"}</td>
                  <td className="num pr-8 text-right">{c.quantidade}</td>
                  <td className="num text-[12px] text-muted-foreground">
                    {new Date(c.criado_em).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

      <Painel titulo={`Eventos bloqueados pelas travas (${data?.bloqueados.length ?? 0})`}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2">Cliente</th>
              <th>Evento</th>
              <th>Trava</th>
              <th>Detalhe</th>
              <th className="w-48">Data e hora</th>
            </tr>
          </thead>
          <tbody>
            {(data?.bloqueados ?? []).map((b) => (
              <tr key={b.id} className="border-b border-border/60">
                <td className="py-2 pr-2">{b.nome}</td>
                <td>{ROTULO[b.tipo] ?? b.tipo}</td>
                <td className="titulo text-[11px] tracking-wide text-destaque">
                  {MOTIVO[b.motivo] ?? b.motivo}
                </td>
                <td className="text-[12px] text-muted-foreground">{b.detalhe ?? "—"}</td>
                <td className="num text-[12px] text-muted-foreground">
                  {new Date(b.ocorrido_em).toLocaleString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>
    </div>
  );
}
