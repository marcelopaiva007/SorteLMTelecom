import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminAuditoria } from "@/lib/admin.functions";
import {
  ErroAoCarregar,
  Etiqueta,
  Painel,
  Tabela,
  botao,
  celula,
  texto,
} from "./ui";

const ROTULO: Record<string, string> = {
  assinatura: "Assinatura nova",
  reativacao: "Reativação",
  quitacao_debito: "Quitação de débito",
  mensalidade_em_dia: "Pagamento em dia",
};

const MOTIVO: Record<string, string> = {
  carencia_reativacao: "Carência",
  limite_por_cpf: "Limite por CPF",
  duplicado_idempotente: "Duplicado",
  cliente_inelegivel: "Autoexcluído",
  fora_de_campanha: "Fora da campanha",
  sem_regra: "Sem peso definido",
  peso_zerado: "Peso zerado",
};

const ACAO: Record<string, string> = {
  criar_campanha: "Criou campanha",
  editar_campanha: "Editou campanha",
  abrir_campanha: "Abriu campanha",
  apurar_campanha: "Apurou campanha",
  salvar_regras: "Alterou pesos",
  editar_configuracao: "Editou dados da empresa",
  processar_eventos: "Processou eventos",
};

// Ações que mudam o resultado do sorteio merecem destaque na trilha.
const ACAO_CRITICA = new Set([
  "apurar_campanha",
  "salvar_regras",
  "abrir_campanha",
]);

export function AbaAuditoria() {
  const fn = useServerFn(adminAuditoria);
  const [campo, setCampo] = useState("");
  const [busca, setBusca] = useState("");
  const { data, isFetching, error } = useQuery({
    queryKey: ["admin", "auditoria", busca],
    queryFn: () => fn({ data: { busca } }),
  });

  if (error) return <ErroAoCarregar />;

  return (
    <div className="grid gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusca(campo);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          className={botao.input + " max-w-md flex-1"}
          placeholder="Nome, CPF/CNPJ, ID do ERP, tipo de evento ou chave idempotente"
          value={campo}
          onChange={(e) => setCampo(e.target.value)}
          aria-label="Buscar na auditoria"
        />
        <button className={botao.primario}>Buscar</button>
        {busca && (
          <button
            type="button"
            className={botao.secundario}
            onClick={() => {
              setCampo("");
              setBusca("");
            }}
          >
            Limpar
          </button>
        )}
      </form>

      <Painel
        titulo="Ações da equipe"
        descricao="Quem mudou o quê no painel, e quando"
      >
        <Tabela
          colunas={[
            { titulo: "Quem" },
            { titulo: "O que fez" },
            { titulo: "Alvo" },
            { titulo: "Quando", largura: "w-44" },
          ]}
          vazio="Nenhuma ação registrada ainda."
          carregando={isFetching}
          total={data?.acoes.length ?? 0}
          limite={200}
        >
          {(data?.acoes ?? []).map((a) => (
            <tr key={a.id} className="border-b border-border/60">
              <td className={celula + " num text-[13px]"}>{a.email}</td>
              <td className={celula}>
                {ACAO_CRITICA.has(a.acao) ? (
                  <Etiqueta tom="alerta">{ACAO[a.acao] ?? a.acao}</Etiqueta>
                ) : (
                  (ACAO[a.acao] ?? a.acao)
                )}
              </td>
              <td className={celula + " num text-[13px] text-muted-foreground"}>
                {a.alvo ?? "—"}
              </td>
              <td className={celula + " num text-[13px] text-muted-foreground"}>
                {new Date(a.criado_em).toLocaleString("pt-BR")}
              </td>
            </tr>
          ))}
        </Tabela>
      </Painel>

      <Painel
        titulo="Eventos barrados pelas travas"
        descricao="Evento que não virou crédito, e o motivo"
      >
        <Tabela
          colunas={[
            { titulo: "Cliente" },
            { titulo: "Evento" },
            { titulo: "Trava" },
            { titulo: "Detalhe" },
            { titulo: "Quando", largura: "w-44" },
          ]}
          vazio="Nenhum evento foi barrado. Se o conector já enviou eventos, é sinal de que todos couberam nas regras."
          carregando={isFetching}
          total={data?.bloqueados.length ?? 0}
          limite={200}
        >
          {(data?.bloqueados ?? []).map((b) => (
            <tr key={b.id} className="border-b border-border/60">
              <td className={celula}>{b.nome}</td>
              <td className={celula}>{ROTULO[b.tipo] ?? b.tipo}</td>
              <td className={celula}>
                <Etiqueta tom="perigo">{MOTIVO[b.motivo] ?? b.motivo}</Etiqueta>
              </td>
              <td className={celula + " text-[13px] text-muted-foreground"}>
                {b.detalhe ?? "—"}
              </td>
              <td className={celula + " num text-[13px] text-muted-foreground"}>
                {new Date(b.ocorrido_em).toLocaleString("pt-BR")}
              </td>
            </tr>
          ))}
        </Tabela>
      </Painel>

      <Painel titulo="Créditos concedidos">
        <Tabela
          colunas={[
            { titulo: "Cliente" },
            { titulo: "CPF/CNPJ" },
            { titulo: "Evento de origem" },
            { titulo: "Competência" },
            { titulo: "Números", alinhamento: "direita" },
            { titulo: "Quando", largura: "w-44" },
          ]}
          vazio={
            busca
              ? `Nenhum crédito encontrado para “${busca}”.`
              : "Nenhum crédito concedido ainda. Créditos aparecem quando o ERP enviar eventos."
          }
          carregando={isFetching}
          total={data?.creditos.length ?? 0}
          limite={500}
        >
          {(data?.creditos ?? []).map((c) => (
            <tr key={c.id} className="border-b border-border/60">
              <td className={celula}>{c.nome}</td>
              <td className={celula + " num text-[13px] text-muted-foreground"}>
                {c.documento}
              </td>
              <td className={celula}>{ROTULO[c.tipo] ?? c.tipo}</td>
              <td className={celula + " num text-[13px] text-muted-foreground"}>
                {c.competencia ?? "—"}
              </td>
              <td className={celula + " num text-right"}>+{c.quantidade}</td>
              <td className={celula + " num text-[13px] text-muted-foreground"}>
                {new Date(c.criado_em).toLocaleString("pt-BR")}
              </td>
            </tr>
          ))}
        </Tabela>

        <p className={texto.legenda + " mt-3"}>
          A busca procura na base inteira, não só nos registros mostrados.
        </p>
      </Painel>
    </div>
  );
}
