import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function exigirAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error || data !== true) throw new Error("Acesso restrito a administradores.");
}

export const adminResumo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const [campanhas, regras, config, sinc, clientes, eventos, bloqueados] = await Promise.all([
      supabase.from("campanhas").select("*").order("inicio", { ascending: false }),
      supabase.from("regras").select("*").order("tipo_evento"),
      supabase.from("configuracoes").select("chave, valor, descricao").order("chave"),
      supabase.from("sincronizacoes").select("*").order("iniciado_em", { ascending: false }).limit(20),
      supabase.from("clientes").select("id, sincronizado_em"),
      supabase.from("eventos").select("id, tipo, ocorrido_em"),
      supabase.from("eventos_bloqueados").select("id, motivo, ocorrido_em"),
    ]);

    const hoje = new Date().toISOString().slice(0, 10);
    const eventosHoje = (eventos.data ?? []).filter((e: any) =>
      String(e.ocorrido_em).slice(0, 10) === hoje,
    ).length;
    const duplicadosBarrados =
      (bloqueados.data ?? []).filter((b: any) => b.motivo === "duplicado_idempotente").length +
      (sinc.data ?? []).reduce((a: number, s: any) => a + (s.duplicados_barrados ?? 0), 0);

    let falhasSeguidas = 0;
    for (const s of sinc.data ?? []) {
      if (s.status === "falha") falhasSeguidas++;
      else break;
    }

    return {
      campanhas: campanhas.data ?? [],
      regras: regras.data ?? [],
      configuracoes: config.data ?? [],
      sincronizacoes: sinc.data ?? [],
      clientesEspelhados: (clientes.data ?? []).length,
      ultimaLeitura: (sinc.data ?? [])[0]?.iniciado_em ?? null,
      eventosHoje,
      duplicadosBarrados,
      falhasSeguidas,
      totalEventos: (eventos.data ?? []).length,
    };
  });

export const adminAuditoria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ busca: z.string().default("") }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const [creditosRes, bloqRes] = await Promise.all([
      supabase
        .from("creditos")
        .select(
          "id, quantidade, criado_em, clientes(nome, cpf_cnpj, erp_id), eventos(tipo, competencia, ocorrido_em, chave_idempotente)",
        )
        .order("criado_em", { ascending: false })
        .limit(500),
      supabase
        .from("eventos_bloqueados")
        .select("id, tipo, motivo, detalhe, ocorrido_em, clientes(nome, cpf_cnpj)")
        .order("ocorrido_em", { ascending: false })
        .limit(200),
    ]);

    const termo = data.busca.trim().toLowerCase();
    const filtra = (texto: string) => !termo || texto.toLowerCase().includes(termo);

    const creditos = (creditosRes.data ?? [])
      .map((c: any) => ({
        id: c.id,
        quantidade: c.quantidade,
        criado_em: c.criado_em,
        nome: c.clientes?.nome ?? "—",
        documento: c.clientes?.cpf_cnpj ?? "",
        erpId: c.clientes?.erp_id ?? "",
        tipo: c.eventos?.tipo ?? "",
        competencia: c.eventos?.competencia ?? null,
        chave: c.eventos?.chave_idempotente ?? "",
      }))
      .filter((c: any) => filtra(`${c.nome} ${c.documento} ${c.erpId} ${c.tipo} ${c.chave}`));

    const bloqueados = (bloqRes.data ?? [])
      .map((b: any) => ({
        id: b.id,
        tipo: b.tipo,
        motivo: b.motivo,
        detalhe: b.detalhe,
        ocorrido_em: b.ocorrido_em,
        nome: b.clientes?.nome ?? "—",
        documento: b.clientes?.cpf_cnpj ?? "",
      }))
      .filter((b: any) => filtra(`${b.nome} ${b.documento} ${b.tipo} ${b.motivo} ${b.detalhe ?? ""}`));

    return { creditos, bloqueados };
  });

export const adminEfeito = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const [eventosRes, campanhasRes] = await Promise.all([
      supabase.from("eventos").select("tipo, ocorrido_em"),
      supabase.from("campanhas").select("inicio, fim, status").order("inicio"),
    ]);

    const meses = new Map<string, Record<string, number>>();
    for (const e of eventosRes.data ?? []) {
      const mes = String(e.ocorrido_em).slice(0, 7);
      const linha = meses.get(mes) ?? {
        assinatura: 0,
        reativacao: 0,
        quitacao_debito: 0,
        mensalidade_em_dia: 0,
      };
      linha[e.tipo as string] = (linha[e.tipo as string] ?? 0) + 1;
      meses.set(mes, linha);
    }

    const ativa = (campanhasRes.data ?? []).find((c: any) => c.status === "aberta") ?? null;
    const dentro = (mes: string) =>
      !!ativa && mes >= String(ativa.inicio).slice(0, 7) && mes <= String(ativa.fim).slice(0, 7);

    const linhas = Array.from(meses.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({
        mes,
        assinatura: v['assinatura'] ?? 0,
        reativacao: v['reativacao'] ?? 0,
        quitacao_debito: v['quitacao_debito'] ?? 0,
        mensalidade_em_dia: v['mensalidade_em_dia'] ?? 0,
        comSorteio: dentro(mes),
      }));


    return { linhas };
  });

export const salvarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(3),
        inicio: z.string().min(10),
        fim: z.string().min(10),
        premio: z.string().trim().min(2),
        data_apuracao: z.string().min(10),
        digitos_cartela: z.number().int().min(2).max(6),
        criterio_apuracao: z.string().trim().min(10),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    if (!data.id) {
      const { error } = await supabase.from("campanhas").insert({
        nome: data.nome,
        inicio: data.inicio,
        fim: data.fim,
        premio: data.premio,
        data_apuracao: data.data_apuracao,
        digitos_cartela: data.digitos_cartela,
        criterio_apuracao: data.criterio_apuracao,
        status: "rascunho",
      });
      if (error) return { ok: false as const, erro: error.message };
      return { ok: true as const };
    }

    const { data: atual } = await supabase
      .from("campanhas")
      .select("status, criterio_apuracao")
      .eq("id", data.id)
      .maybeSingle();
    if (!atual) return { ok: false as const, erro: "Campanha não encontrada." };

    const travado = atual.status !== "rascunho";
    if (travado && atual.criterio_apuracao !== data.criterio_apuracao) {
      return {
        ok: false as const,
        erro: "O critério de apuração está congelado desde a abertura da campanha e não pode ser alterado.",
      };
    }

    const patch = {
      nome: data.nome,
      inicio: data.inicio,
      fim: data.fim,
      premio: data.premio,
      data_apuracao: data.data_apuracao,
      digitos_cartela: data.digitos_cartela,
      ...(travado
        ? {}
        : {
            criterio_apuracao: data.criterio_apuracao,
            criterio_congelado_em: new Date().toISOString(),
          }),
    };

    const { error } = await supabase.from("campanhas").update(patch).eq("id", data.id);

    if (error) return { ok: false as const, erro: error.message };
    return { ok: true as const };
  });

export const abrirCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);
    const { error } = await supabase
      .from("campanhas")
      .update({ status: "aberta", criterio_congelado_em: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "rascunho");
    if (error) return { ok: false as const, erro: error.message };
    return { ok: true as const };
  });

export const salvarRegras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        regras: z
          .array(
            z.object({
              id: z.string().uuid(),
              quantidade: z.number().int().min(0).max(999),
              carencia_dias: z.number().int().min(0).max(3650),
              limite_meses: z.number().int().min(0).max(120).nullable(),
              bonus_a_cada_meses: z.number().int().min(0).max(60),
              bonus_quantidade: z.number().int().min(0).max(99),
              teto_quantidade: z.number().int().min(0).max(999).nullable(),
            }),
          )
          .min(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);
    for (const r of data.regras) {
      const { id, ...patch } = r;
      const { error } = await supabase.from("regras").update(patch).eq("id", id);
      if (error) return { ok: false as const, erro: error.message };
    }
    return { ok: true as const };
  });

export const salvarConfiguracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ chave: z.string().min(2), valor: z.string().trim().min(1).max(200) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);
    const { error } = await supabase
      .from("configuracoes")
      .update({ valor: data.valor, atualizado_em: new Date().toISOString() })
      .eq("chave", data.chave);
    if (error) return { ok: false as const, erro: error.message };
    return { ok: true as const };
  });
