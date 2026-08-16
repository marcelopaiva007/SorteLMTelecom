// Porta de entrada do ERP.
//
// O ERP empurra clientes e eventos para cá; o Sorteio LM nunca escreve no ERP.
// Cada evento gravado dispara sozinho a concessão de crédito, pela trigger
// `eventos_creditam` — este módulo não calcula número nenhum, só recebe fato.
//
// A idempotência é do banco: `eventos.chave_idempotente` é única, então
// reenviar o mesmo lote não duplica crédito. O ERP pode repetir à vontade
// depois de uma queda de rede.
//
// Autenticação por chave compartilhada no cabeçalho `x-erp-chave`, conferida
// contra a chave de ingestão — ver `chaveDeIngestao()` para de onde ela vem.

import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const clienteSchema = z.object({
  erp_id: z.string().trim().min(1).max(64),
  cpf_cnpj: z.string().trim().min(11).max(20),
  nome: z.string().trim().min(1).max(200),
  whatsapp: z.string().trim().max(20).nullish(),
  status: z.enum(["ativo", "cancelado", "suspenso"]).default("ativo"),
  data_ativacao: z.string().min(10).max(10).nullish(),
  data_cancelamento: z.string().min(10).max(10).nullish(),
  meses_em_dia: z.number().int().min(0).max(1200).default(0),
});

const eventoSchema = z.object({
  erp_id: z.string().trim().min(1).max(64),
  tipo: z.enum([
    "assinatura",
    "reativacao",
    "quitacao_debito",
    "mensalidade_em_dia",
  ]),
  competencia: z.string().trim().max(7).nullish(),
  ocorrido_em: z.string().min(10),
  chave_idempotente: z.string().trim().min(3).max(200),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const corpoSchema = z.object({
  clientes: z.array(clienteSchema).max(5000).default([]),
  eventos: z.array(eventoSchema).max(5000).default([]),
});

/** Comparação de tempo constante: evita vazar a chave por diferença de tempo. */
function chaveConfere(recebida: string, esperada: string): boolean {
  const a = new TextEncoder().encode(recebida);
  const b = new TextEncoder().encode(esperada);
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i]! ^ b[i]!;
  return diferenca === 0;
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function soDigitos(v: string) {
  return (v || "").replace(/\D/g, "");
}

/** Nome da chave na tabela `segredos`. */
export const CHAVE_ERP = "erp_chave_ingestao";

// A leitura no banco é barata, mas o ERP pode postar em rajada. Um cache curto
// evita uma consulta por requisição sem atrasar a virada da chave: depois de
// girar, a nova vale em no máximo um minuto.
let cache: { valor: string; ate: number } | null = null;

/**
 * De onde vem a chave, nesta ordem:
 *   1. ERP_CHAVE_INGESTAO no ambiente, para quem prefere o segredo fora do banco;
 *   2. a tabela `segredos`, que só a service_role enxerga e que o painel
 *      consegue configurar sem depender do painel da hospedagem.
 */
export async function chaveDeIngestao(): Promise<string | null> {
  const doAmbiente = process.env["ERP_CHAVE_INGESTAO"];
  if (doAmbiente) return doAmbiente;

  if (cache && cache.ate > Date.now()) return cache.valor;

  const { supabaseAdmin } = await import("@/lib/supabase.server");
  const { data, error } = await supabaseAdmin
    .from("segredos")
    .select("valor")
    .eq("chave", CHAVE_ERP)
    .maybeSingle();

  if (error) {
    console.error("[erp] falha ao ler a chave de ingestão", error.message);
    return null;
  }
  if (!data?.valor) return null;

  cache = { valor: data.valor, ate: Date.now() + 60_000 };
  return data.valor;
}

/** Chamado depois de girar a chave, para a nova valer na hora. */
export function esquecerChaveDeIngestao() {
  cache = null;
}

export async function receberDoErp(request: Request): Promise<Response> {
  const esperada = await chaveDeIngestao();
  if (!esperada) {
    console.error("[erp] chave de ingestão não configurada");
    return json({ ok: false, erro: "Integração do ERP não configurada." }, 503);
  }

  const recebida = request.headers.get("x-erp-chave") ?? "";
  if (!chaveConfere(recebida, esperada)) {
    return json({ ok: false, erro: "Chave de integração inválida." }, 401);
  }

  let corpo: z.infer<typeof corpoSchema>;
  try {
    corpo = corpoSchema.parse(await request.json());
  } catch (erro) {
    return json(
      {
        ok: false,
        erro: "Corpo inválido.",
        detalhe: erro instanceof z.ZodError ? erro.issues : String(erro),
      },
      400,
    );
  }

  const { supabaseAdmin } = await import("@/lib/supabase.server");
  const iniciado = new Date().toISOString();

  let clientesGravados = 0;
  let eventosGravados = 0;
  let duplicados = 0;
  const erros: string[] = [];

  // 1. Espelho dos clientes. `erp_id` é a chave: o ERP manda o estado atual e
  // a linha aqui passa a refletir isso.
  if (corpo.clientes.length) {
    const { data, error } = await supabaseAdmin
      .from("clientes")
      .upsert(
        corpo.clientes.map((c) => ({
          erp_id: c.erp_id,
          cpf_cnpj: soDigitos(c.cpf_cnpj),
          nome: c.nome,
          whatsapp: c.whatsapp ?? null,
          status: c.status,
          data_ativacao: c.data_ativacao ?? null,
          data_cancelamento: c.data_cancelamento ?? null,
          meses_em_dia: c.meses_em_dia,
          sincronizado_em: new Date().toISOString(),
        })),
        { onConflict: "erp_id" },
      )
      .select("id");

    if (error) erros.push(`clientes: ${error.message}`);
    else clientesGravados = data?.length ?? 0;
  }

  // 2. Eventos. Precisamos do id interno do cliente, e o ERP só conhece o
  // erp_id dele.
  if (corpo.eventos.length) {
    const erpIds = Array.from(new Set(corpo.eventos.map((e) => e.erp_id)));
    const { data: clientes } = await supabaseAdmin
      .from("clientes")
      .select("id, erp_id")
      .in("erp_id", erpIds);

    const porErpId = new Map((clientes ?? []).map((c) => [c.erp_id, c.id]));

    const linhas: {
      cliente_id: string;
      tipo: (typeof corpo.eventos)[number]["tipo"];
      competencia: string | null;
      ocorrido_em: string;
      chave_idempotente: string;
      payload_erp: Json;
    }[] = [];

    for (const e of corpo.eventos) {
      const clienteId = porErpId.get(e.erp_id);
      if (!clienteId) {
        erros.push(
          `evento ${e.chave_idempotente}: cliente ${e.erp_id} não está na base`,
        );
        continue;
      }
      linhas.push({
        cliente_id: clienteId,
        tipo: e.tipo,
        competencia: e.competencia ?? null,
        ocorrido_em: e.ocorrido_em,
        chave_idempotente: e.chave_idempotente,
        // O zod garante que é um objeto; o formato interno é livre porque é
        // carga do ERP, guardada para auditoria.
        payload_erp: e.payload as Json,
      });
    }

    if (linhas.length) {
      // `ignoreDuplicates` faz o banco descartar o que já entrou pela chave
      // idempotente. A trigger de crédito só dispara para linha nova, então
      // reenvio não paga duas vezes.
      const { data, error } = await supabaseAdmin
        .from("eventos")
        .upsert(linhas, {
          onConflict: "chave_idempotente",
          ignoreDuplicates: true,
        })
        .select("id");

      if (error) erros.push(`eventos: ${error.message}`);
      else {
        eventosGravados = data?.length ?? 0;
        duplicados = linhas.length - eventosGravados;
      }
    }
  }

  const houveFalha = erros.length > 0;

  await supabaseAdmin.from("sincronizacoes").insert({
    origem: "conector_erp",
    status: houveFalha ? "falha" : "sucesso",
    clientes_lidos: corpo.clientes.length,
    eventos_lidos: corpo.eventos.length,
    duplicados_barrados: duplicados,
    erro: houveFalha ? erros.slice(0, 20).join(" | ") : null,
    iniciado_em: iniciado,
    terminado_em: new Date().toISOString(),
  });

  return json(
    {
      ok: !houveFalha,
      clientes: {
        recebidos: corpo.clientes.length,
        gravados: clientesGravados,
      },
      eventos: {
        recebidos: corpo.eventos.length,
        gravados: eventosGravados,
        duplicados,
      },
      erros,
    },
    houveFalha ? 207 : 200,
  );
}
