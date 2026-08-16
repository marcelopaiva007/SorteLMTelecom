import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminCliente } from "@/lib/admin.functions";
import {
  Aviso,
  Esqueleto,
  ErroAoCarregar,
  Etiqueta,
  Indicador,
  Painel,
  Tabela,
  Vazio,
  botao,
  celula,
  texto,
} from "./ui";

const ROTULO_EVENTO: Record<string, string> = {
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

type Bloqueado = {
  id: string;
  tipo: string;
  motivo: string;
  detalhe: string | null;
  ocorrido_em: string;
};

function documentoBR(d: string) {
  const n = (d ?? "").replace(/\D/g, "");
  if (n.length === 11)
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (n.length === 14)
    return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}

/**
 * Consulta de participante.
 *
 * A pergunta que esta tela responde é sempre a mesma: "o cliente ligou dizendo
 * que não recebeu números — o que aconteceu com o caso dele?". Por isso os
 * eventos barrados aparecem com o mesmo peso dos créditos concedidos: é lá que
 * está a resposta.
 */
export function AbaClientes() {
  const fn = useServerFn(adminCliente);
  const [campo, setCampo] = useState("");
  const [busca, setBusca] = useState("");

  const { data, isFetching, error } = useQuery({
    queryKey: ["admin", "cliente", busca],
    queryFn: () => fn({ data: { busca } }),
    enabled: busca.trim().length >= 2,
  });

  function procurar(e: React.FormEvent) {
    e.preventDefault();
    setBusca(campo);
  }

  const cliente = data?.cliente ?? null;

  return (
    <div className="grid gap-4">
      <Painel
        titulo="Consultar cliente"
        descricao="Por nome, CPF/CNPJ ou identificador do ERP"
      >
        <form onSubmit={procurar} className="flex flex-wrap gap-2">
          <input
            className={botao.input + " max-w-md flex-1"}
            placeholder="Ex.: Ana Ferreira, 12345678909 ou ERP00042"
            value={campo}
            onChange={(e) => setCampo(e.target.value)}
            aria-label="Buscar cliente"
          />
          <button className={botao.primario} disabled={campo.trim().length < 2}>
            Procurar
          </button>
        </form>
      </Painel>

      {busca.trim().length >= 2 && isFetching && <Esqueleto linhas={4} />}
      {error && <ErroAoCarregar />}

      {data && !isFetching && !cliente && (
        <Painel titulo={`Resultados (${data.candidatos.length})`}>
          {data.candidatos.length === 0 ? (
            <Vazio>
              Nenhum cliente encontrado para “{busca}”. Se ele existe no ERP mas
              não aqui, o conector ainda não enviou o cadastro dele.
            </Vazio>
          ) : (
            <Tabela
              colunas={[
                { titulo: "Nome" },
                { titulo: "CPF/CNPJ" },
                { titulo: "ERP" },
              ]}
              vazio=""
              total={data.candidatos.length}
            >
              {data.candidatos.map((c) => (
                <tr key={c.id} className="border-b border-border/60">
                  <td className={celula}>
                    <button
                      className="text-primary underline underline-offset-2"
                      onClick={() => {
                        setCampo(c.documento);
                        setBusca(c.documento);
                      }}
                    >
                      {c.nome}
                    </button>
                  </td>
                  <td className={celula + " num text-[13px]"}>
                    {documentoBR(c.documento)}
                  </td>
                  <td
                    className={
                      celula + " num text-[13px] text-muted-foreground"
                    }
                  >
                    {c.erpId}
                  </td>
                </tr>
              ))}
            </Tabela>
          )}
        </Painel>
      )}

      {cliente && (
        <>
          <Painel
            titulo={cliente.nome}
            descricao={`${documentoBR(cliente.documento)} · ${cliente.erpId}`}
            acao={
              <div className="flex gap-2">
                {cliente.autoexcluido && (
                  <Etiqueta tom="perigo">autoexcluído</Etiqueta>
                )}
                <Etiqueta tom={cliente.status === "ativo" ? "ativo" : "alerta"}>
                  {cliente.status}
                </Etiqueta>
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-4">
              <Indicador
                rotulo="Números ganhos"
                valor={String(cliente.totalCreditos)}
                nota="somando todos os créditos"
              />
              <Indicador
                rotulo="Já escolhidos"
                valor={String(cliente.numeros.length)}
              />
              <Indicador
                rotulo="Saldo"
                valor={String(cliente.saldo)}
                nota="ainda pode escolher"
                alerta={cliente.saldo < 0}
              />
              <Indicador
                rotulo="Meses em dia"
                valor={String(cliente.mesesEmDia)}
                nota="posição na escada do bom pagador"
              />
            </div>

            {cliente.autoexcluido && (
              <Aviso tom="perigo">
                Este cliente pediu autoexclusão. Ele não entra no sistema e
                novos eventos dele não geram crédito — é o comportamento
                esperado, não um defeito.
              </Aviso>
            )}

            {!cliente.whatsapp && (
              <Aviso tom="alerta">
                Sem WhatsApp no cadastro.{" "}
                <span className="text-foreground">
                  Este cliente não consegue entrar
                </span>
                , porque o código de acesso não tem para onde ir. Corrija no
                ERP.
              </Aviso>
            )}
          </Painel>

          <Painel
            titulo="Eventos barrados"
            descricao="Quando o cliente diz que não recebeu, a resposta costuma estar aqui"
          >
            <Tabela
              colunas={[
                { titulo: "Evento" },
                { titulo: "Trava" },
                { titulo: "Detalhe" },
                { titulo: "Quando", largura: "w-44" },
              ]}
              vazio="Nenhum evento deste cliente foi barrado pelas travas."
              total={cliente.bloqueados.length}
            >
              {(cliente.bloqueados as Bloqueado[]).map((b) => (
                <tr key={b.id} className="border-b border-border/60">
                  <td className={celula}>{ROTULO_EVENTO[b.tipo] ?? b.tipo}</td>
                  <td className={celula}>
                    <Etiqueta tom="perigo">
                      {MOTIVO[b.motivo] ?? b.motivo}
                    </Etiqueta>
                  </td>
                  <td className={celula + " text-[13px] text-muted-foreground"}>
                    {b.detalhe ?? "—"}
                  </td>
                  <td
                    className={
                      celula + " num text-[13px] text-muted-foreground"
                    }
                  >
                    {new Date(b.ocorrido_em).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </Tabela>
          </Painel>

          <Painel titulo="Créditos concedidos">
            <Tabela
              colunas={[
                { titulo: "Origem" },
                { titulo: "Competência" },
                { titulo: "Números", alinhamento: "direita" },
                { titulo: "Como foi calculado" },
                { titulo: "Quando", largura: "w-44" },
              ]}
              vazio="Este cliente ainda não recebeu nenhum crédito."
              total={cliente.creditos.length}
            >
              {cliente.creditos.map((c) => {
                const d = (c.detalhe ?? {}) as Record<string, number | null>;
                return (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className={celula}>
                      {ROTULO_EVENTO[c.tipo] ?? c.tipo}
                    </td>
                    <td
                      className={
                        celula + " num text-[13px] text-muted-foreground"
                      }
                    >
                      {c.competencia ?? "—"}
                    </td>
                    <td className={celula + " num text-right"}>
                      +{c.quantidade}
                    </td>
                    <td
                      className={celula + " text-[13px] text-muted-foreground"}
                    >
                      {d["base"] !== undefined && d["base"] !== null
                        ? `base ${d["base"]}${d["passos"] ? ` + ${d["passos"]}×${d["bonus_por_passo"] ?? 0}` : ""}${d["teto"] ? `, teto ${d["teto"]}` : ""}`
                        : "—"}
                    </td>
                    <td
                      className={
                        celula + " num text-[13px] text-muted-foreground"
                      }
                    >
                      {new Date(c.criado_em).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </Tabela>
          </Painel>

          <Painel titulo={`Números escolhidos (${cliente.numeros.length})`}>
            {cliente.numeros.length === 0 ? (
              <Vazio>
                O cliente ainda não escolheu nenhum número
                {cliente.saldo > 0 ? ` — tem ${cliente.saldo} esperando.` : "."}
              </Vazio>
            ) : (
              <div className="flex flex-wrap gap-1">
                {cliente.numeros.map((n) => (
                  <span
                    key={n.numero}
                    title={`${n.protocolo ?? "sem protocolo"} · ${new Date(n.escolhido_em).toLocaleString("pt-BR")}`}
                    className="num border border-border px-2 py-1 text-[13px]"
                  >
                    {n.numero}
                  </span>
                ))}
              </div>
            )}
          </Painel>
        </>
      )}

      {busca.trim().length < 2 && (
        <p className={texto.legenda}>
          Digite ao menos dois caracteres. Encontrando um cliente só, a ficha
          completa abre direto.
        </p>
      )}
    </div>
  );
}
