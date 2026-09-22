import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  MAX_NUMEROS_POR_APOSTA,
  type CanalAposta,
  type StatusAposta,
} from "@/lib/apostas";

async function exigirAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error || data !== true)
    throw new Error("Acesso restrito a administradores.");
}

function emailDoOperador(claims: unknown): string | null {
  const email = (claims as Record<string, unknown> | null)?.["email"];
  return typeof email === "string" ? email : null;
}

/** Mensagem do Postgres já vem em português vinda das travas do banco. */
function motivoDoErro(
  erro: { message?: string; code?: string } | null,
  padrao: string,
) {
  if (!erro) return padrao;
  if (erro.code === "23505") {
    return "Um dos números acabou de ser registrado por outro jogador. Confira a cartela e tente de novo.";
  }
  const msg = (erro.message ?? "").trim();
  return msg || padrao;
}

function soDigitos(v: string) {
  return v.replace(/\D/g, "");
}

const filtroSchema = z.object({
  campanhaId: z.string().uuid().optional(),
  busca: z.string().default(""),
  status: z
    .enum(["todas", "registrada", "confirmada", "cancelada"])
    .default("todas"),
});

type ApostaBruta = {
  id: string;
  protocolo: string;
  status: StatusAposta;
  canal: CanalAposta;
  quantidade: number;
  valor_total: number;
  observacao: string | null;
  registrada_em: string;
  registrada_por_email: string | null;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
  jogador_id: string;
  jogadores: {
    id: string;
    nome: string;
    apelido: string | null;
    documento: string | null;
    whatsapp: string | null;
  } | null;
};

/**
 * Estado completo do pleito: apostas, jogadores, ocupação da cartela e os
 * ajustes do módulo. Uma chamada só, porque a tela do balcão precisa de tudo
 * junto para validar antes de gravar.
 */
export const apostasDoPleito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtroSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { data: campanhas } = await supabase
      .from("campanhas")
      .select(
        "id, nome, status, inicio, fim, premio, data_apuracao, digitos_cartela",
      )
      .order("inicio", { ascending: false });

    const lista = campanhas ?? [];
    const pleito =
      (data.campanhaId
        ? lista.find((c) => c.id === data.campanhaId)
        : undefined) ??
      lista.find((c) => c.status === "aberta") ??
      lista[0] ??
      null;

    if (!pleito) {
      return {
        pleito: null,
        pleitos: [],
        apostas: [],
        jogadores: [],
        ranking: [],
        ocupados: [],
        indicadores: null,
        limitePorJogador: 0,
        valorPorNumero: 0,
      };
    }

    const [apostasRes, numerosRes, creditosRes, jogadoresRes, configRes] =
      await Promise.all([
        supabase
          .from("apostas")
          .select(
            "id, protocolo, status, canal, quantidade, valor_total, observacao, registrada_em, registrada_por_email, cancelada_em, motivo_cancelamento, jogador_id, jogadores(id, nome, apelido, documento, whatsapp)",
          )
          .eq("campanha_id", pleito.id)
          .order("registrada_em", { ascending: false })
          .limit(2000),
        supabase
          .from("aposta_numeros")
          .select("aposta_id, numero, ativo")
          .eq("campanha_id", pleito.id)
          .limit(50000),
        supabase
          .from("numeros")
          .select("numero")
          .eq("campanha_id", pleito.id)
          .limit(50000),
        supabase
          .from("jogadores")
          .select("id, nome, apelido, documento, whatsapp, ativo")
          .order("nome")
          .limit(2000),
        supabase
          .from("configuracoes")
          .select("chave, valor")
          .in("chave", [
            "apostas_limite_por_jogador",
            "apostas_valor_por_numero",
          ]),
      ]);

    const numerosPorAposta = new Map<string, number[]>();
    const ocupados = new Set<number>();
    for (const n of numerosRes.data ?? []) {
      const atual = numerosPorAposta.get(n.aposta_id) ?? [];
      atual.push(n.numero);
      numerosPorAposta.set(n.aposta_id, atual);
      if (n.ativo) ocupados.add(n.numero);
    }
    const numerosCreditos = (creditosRes.data ?? []).map((n) => n.numero);
    for (const n of numerosCreditos) ocupados.add(n);

    const brutas = (apostasRes.data ?? []) as unknown as ApostaBruta[];
    const apostas = brutas.map((a) => {
      const numeros = (numerosPorAposta.get(a.id) ?? []).sort((x, y) => x - y);
      return {
        id: a.id,
        protocolo: a.protocolo,
        status: a.status,
        canal: a.canal,
        quantidade: a.quantidade,
        valorTotal: Number(a.valor_total ?? 0),
        observacao: a.observacao,
        registradaEm: a.registrada_em,
        registradaPor: a.registrada_por_email,
        canceladaEm: a.cancelada_em,
        motivoCancelamento: a.motivo_cancelamento,
        jogadorId: a.jogador_id,
        jogador: a.jogadores?.nome ?? "—",
        apelido: a.jogadores?.apelido ?? null,
        documento: a.jogadores?.documento ?? null,
        whatsapp: a.jogadores?.whatsapp ?? null,
        numeros,
      };
    });

    const digitos = pleito.digitos_cartela;
    const termo = data.busca.trim().toLowerCase();
    const filtradas = apostas.filter((a) => {
      if (data.status !== "todas" && a.status !== data.status) return false;
      if (!termo) return true;
      const numerosTexto = a.numeros
        .map((n) => String(n).padStart(digitos, "0"))
        .join(" ");
      const alvo = [
        a.protocolo,
        a.jogador,
        a.apelido ?? "",
        a.documento ?? "",
        a.whatsapp ?? "",
        a.observacao ?? "",
        numerosTexto,
      ]
        .join(" ")
        .toLowerCase();
      return alvo.includes(termo);
    });

    // Ranking do pleito: quem está dentro, com quanto, e desde quando.
    const porJogador = new Map<
      string,
      {
        id: string;
        nome: string;
        apelido: string | null;
        documento: string | null;
        whatsapp: string | null;
        apostas: number;
        numeros: number;
        valor: number;
        ultima: string | null;
      }
    >();
    for (const a of apostas) {
      if (a.status === "cancelada") continue;
      const atual = porJogador.get(a.jogadorId) ?? {
        id: a.jogadorId,
        nome: a.jogador,
        apelido: a.apelido,
        documento: a.documento,
        whatsapp: a.whatsapp,
        apostas: 0,
        numeros: 0,
        valor: 0,
        ultima: null,
      };
      atual.apostas += 1;
      atual.numeros += a.numeros.length;
      atual.valor += a.valorTotal;
      if (!atual.ultima || a.registradaEm > atual.ultima)
        atual.ultima = a.registradaEm;
      porJogador.set(a.jogadorId, atual);
    }
    const ranking = Array.from(porJogador.values()).sort(
      (a, b) => b.numeros - a.numeros,
    );

    const config = Object.fromEntries(
      (configRes.data ?? []).map((c) => [c.chave, c.valor]),
    ) as Record<string, string>;

    const valendo = apostas.filter((a) => a.status !== "cancelada");
    const totalCartela = Math.pow(10, digitos);
    const numerosApostados = valendo.reduce(
      (soma, a) => soma + a.numeros.length,
      0,
    );

    return {
      pleito,
      pleitos: lista.map((c) => ({ id: c.id, nome: c.nome, status: c.status })),
      apostas: filtradas,
      jogadores: (jogadoresRes.data ?? []).map((j) => ({
        id: j.id,
        nome: j.nome,
        apelido: j.apelido,
        documento: j.documento,
        whatsapp: j.whatsapp,
        ativo: j.ativo,
      })),
      ranking,
      ocupados: Array.from(ocupados),
      indicadores: {
        apostas: valendo.length,
        canceladas: apostas.length - valendo.length,
        jogadores: ranking.length,
        numerosApostados,
        numerosCreditos: numerosCreditos.length,
        totalCartela,
        ocupacao:
          ((numerosApostados + numerosCreditos.length) / totalCartela) * 100,
        valorTotal: valendo.reduce((soma, a) => soma + a.valorTotal, 0),
        mediaPorJogador: ranking.length ? numerosApostados / ranking.length : 0,
      },
      limitePorJogador:
        Number(config["apostas_limite_por_jogador"] ?? "0") || 0,
      valorPorNumero: Number(config["apostas_valor_por_numero"] ?? "0") || 0,
    };
  });

const jogadorSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(3).max(120),
  apelido: z.string().trim().max(60).optional(),
  documento: z.string().trim().max(20).optional(),
  whatsapp: z.string().trim().max(20).optional(),
  clienteId: z.string().uuid().optional(),
  ativo: z.boolean().optional(),
  observacao: z.string().trim().max(300).optional(),
});

/** Cadastra ou edita um jogador. Documento repetido reaproveita o cadastro. */
export const salvarJogador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jogadorSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const documento = data.documento ? soDigitos(data.documento) : null;
    const patch = {
      nome: data.nome,
      apelido: data.apelido || null,
      documento: documento || null,
      whatsapp: data.whatsapp ? soDigitos(data.whatsapp) : null,
      cliente_id: data.clienteId ?? null,
      observacao: data.observacao || null,
      ...(data.ativo === undefined ? {} : { ativo: data.ativo }),
    };

    if (data.id) {
      const { error } = await supabase
        .from("jogadores")
        .update(patch)
        .eq("id", data.id);
      if (error)
        return {
          ok: false as const,
          erro: motivoDoErro(error, "Não deu para salvar o jogador."),
        };
      return { ok: true as const, id: data.id };
    }

    if (documento) {
      const { data: existente } = await supabase
        .from("jogadores")
        .select("id")
        .eq("documento", documento)
        .maybeSingle();
      if (existente)
        return {
          ok: true as const,
          id: existente.id,
          reaproveitado: true as const,
        };
    }

    const { data: criado, error } = await supabase
      .from("jogadores")
      .insert({ ...patch, criado_por: userId })
      .select("id")
      .single();
    if (error || !criado) {
      return {
        ok: false as const,
        erro: motivoDoErro(error, "Não deu para cadastrar o jogador."),
      };
    }
    return { ok: true as const, id: criado.id };
  });

const registroSchema = z
  .object({
    campanhaId: z.string().uuid(),
    jogadorId: z.string().uuid().optional(),
    novoJogador: jogadorSchema.omit({ id: true, ativo: true }).optional(),
    numeros: z
      .array(z.number().int().min(0))
      .min(1)
      .max(MAX_NUMEROS_POR_APOSTA),
    canal: z
      .enum(["balcao", "whatsapp", "app", "importacao"])
      .default("balcao"),
    valorTotal: z.number().min(0).max(999999).default(0),
    observacao: z.string().trim().max(300).optional(),
  })
  .refine((d) => d.jogadorId || d.novoJogador, {
    message: "Escolha um jogador ou cadastre um novo.",
  });

/**
 * Registra a aposta do jogador no pleito. A gravação inteira acontece dentro
 * da função registrar_aposta no banco, então ou entra tudo, ou não entra nada.
 */
export const registrarAposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => registroSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId, claims } = context;
    await exigirAdmin(supabase, userId);

    let jogadorId = data.jogadorId ?? null;

    if (!jogadorId && data.novoJogador) {
      const novo = data.novoJogador;
      const documento = novo.documento ? soDigitos(novo.documento) : null;

      if (documento) {
        const { data: existente } = await supabase
          .from("jogadores")
          .select("id")
          .eq("documento", documento)
          .maybeSingle();
        if (existente) jogadorId = existente.id;
      }

      if (!jogadorId) {
        const { data: criado, error } = await supabase
          .from("jogadores")
          .insert({
            nome: novo.nome,
            apelido: novo.apelido || null,
            documento: documento || null,
            whatsapp: novo.whatsapp ? soDigitos(novo.whatsapp) : null,
            cliente_id: novo.clienteId ?? null,
            observacao: novo.observacao || null,
            criado_por: userId,
          })
          .select("id")
          .single();
        if (error || !criado) {
          return {
            ok: false as const,
            erro: motivoDoErro(error, "Não deu para cadastrar o jogador."),
          };
        }
        jogadorId = criado.id;
      }
    }

    if (!jogadorId) return { ok: false as const, erro: "Escolha um jogador." };

    const numeros = Array.from(new Set(data.numeros)).sort((a, b) => a - b);

    const { data: resultado, error } = await supabase.rpc("registrar_aposta", {
      _campanha_id: data.campanhaId,
      _jogador_id: jogadorId,
      _numeros: numeros,
      _canal: data.canal,
      _valor_total: data.valorTotal,
      _observacao: data.observacao ?? null,
      _registrada_por_email: emailDoOperador(claims),
    });

    if (error) {
      return {
        ok: false as const,
        erro: motivoDoErro(error, "Não deu para registrar a aposta."),
      };
    }

    const retorno = (resultado ?? {}) as {
      protocolo?: string;
      quantidade?: number;
    };
    return {
      ok: true as const,
      protocolo: retorno.protocolo ?? "",
      quantidade: retorno.quantidade ?? numeros.length,
      jogadorId,
      numeros,
    };
  });

/** Cancelar devolve os números do jogador para a cartela do pleito. */
export const cancelarAposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        motivo: z.string().trim().min(3).max(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);
    const { error } = await supabase
      .from("apostas")
      .update({
        status: "cancelada",
        motivo_cancelamento: data.motivo,
        cancelada_por: userId,
        cancelada_em: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error)
      return {
        ok: false as const,
        erro: motivoDoErro(error, "Não deu para cancelar."),
      };
    return { ok: true as const };
  });

/** Confirma (pagamento conferido, comprovante entregue) ou reabre um cancelamento. */
export const mudarStatusAposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["registrada", "confirmada"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);
    const { error } = await supabase
      .from("apostas")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) {
      return {
        ok: false as const,
        erro: motivoDoErro(
          error,
          "Não deu para mudar a situação da aposta. Se ela estava cancelada, algum número já foi para outro jogador.",
        ),
      };
    }
    return { ok: true as const };
  });

type ApostaExportada = {
  id: string;
  protocolo: string;
  status: StatusAposta;
  canal: CanalAposta;
  quantidade: number;
  valor_total: number;
  observacao: string | null;
  registrada_em: string;
  registrada_por_email: string | null;
  motivo_cancelamento: string | null;
  jogadores: {
    nome: string;
    apelido: string | null;
    documento: string | null;
    whatsapp: string | null;
  } | null;
};

/** Planilha do pleito: uma linha por aposta, com os números por extenso. */
export const exportarApostas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campanhaId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { data: pleito } = await supabase
      .from("campanhas")
      .select("nome, digitos_cartela")
      .eq("id", data.campanhaId)
      .maybeSingle();
    if (!pleito) return { ok: false as const, erro: "Pleito não encontrado." };

    const [apostasRes, numerosRes] = await Promise.all([
      supabase
        .from("apostas")
        .select(
          "id, protocolo, status, canal, quantidade, valor_total, observacao, registrada_em, registrada_por_email, motivo_cancelamento, jogadores(nome, apelido, documento, whatsapp)",
        )
        .eq("campanha_id", data.campanhaId)
        .order("registrada_em", { ascending: true })
        .limit(5000),
      supabase
        .from("aposta_numeros")
        .select("aposta_id, numero, ativo")
        .eq("campanha_id", data.campanhaId)
        .limit(50000),
    ]);

    const porAposta = new Map<string, number[]>();
    for (const n of numerosRes.data ?? []) {
      if (!n.ativo) continue;
      const atual = porAposta.get(n.aposta_id) ?? [];
      atual.push(n.numero);
      porAposta.set(n.aposta_id, atual);
    }

    const digitos = pleito.digitos_cartela;
    const campo = (v: string | number | null) => {
      const texto = v === null ? "" : String(v);
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };

    const linhas = [
      [
        "protocolo",
        "jogador",
        "apelido",
        "documento",
        "whatsapp",
        "situacao",
        "canal",
        "quantidade",
        "valor_total",
        "numeros",
        "registrada_em",
        "registrada_por",
        "observacao",
        "motivo_cancelamento",
      ].join(";"),
    ];

    const paraPlanilha = (apostasRes.data ??
      []) as unknown as ApostaExportada[];
    for (const a of paraPlanilha) {
      const numeros = (porAposta.get(a.id) ?? [])
        .sort((x, y) => x - y)
        .map((n) => String(n).padStart(digitos, "0"))
        .join(" ");
      linhas.push(
        [
          campo(a.protocolo),
          campo(a.jogadores?.nome ?? ""),
          campo(a.jogadores?.apelido ?? ""),
          campo(a.jogadores?.documento ?? ""),
          campo(a.jogadores?.whatsapp ?? ""),
          campo(a.status),
          campo(a.canal),
          campo(a.quantidade),
          campo(String(a.valor_total ?? 0).replace(".", ",")),
          campo(numeros),
          campo(new Date(a.registrada_em).toLocaleString("pt-BR")),
          campo(a.registrada_por_email ?? ""),
          campo(a.observacao ?? ""),
          campo(a.motivo_cancelamento ?? ""),
        ].join(";"),
      );
    }

    const arquivo =
      "apostas-" +
      pleito.nome
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      ".csv";

    return { ok: true as const, arquivo, csv: linhas.join("\n") };
  });
