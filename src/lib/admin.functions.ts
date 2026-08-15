import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function exigirAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error || data !== true)
    throw new Error("Acesso restrito a administradores.");
}

// Toda ação do painel deixa rastro: quem fez, o quê, e o valor antes e depois.
// Sem isso, "o critério é congelado e não muda" é promessa sem prova.
async function auditar(
  supabase: any,
  acao: string,
  alvo: string | null,
  antes: unknown,
  depois: unknown,
) {
  const { error } = await supabase.rpc("registrar_auditoria", {
    p_acao: acao,
    p_alvo: alvo,
    p_antes: antes ?? null,
    p_depois: depois ?? null,
  });
  // Auditoria que falha não pode derrubar a operação, mas não pode passar
  // despercebida no log do servidor.
  if (error) console.error("[auditoria]", acao, error);
}

export const adminResumo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const [campanhas, regras, config, sinc, clientes, eventos, bloqueados] =
      await Promise.all([
        supabase
          .from("campanhas")
          .select("*")
          .order("inicio", { ascending: false }),
        supabase.from("regras").select("*").order("tipo_evento"),
        supabase
          .from("configuracoes")
          .select("chave, valor, descricao")
          .order("chave"),
        supabase
          .from("sincronizacoes")
          .select("*")
          .order("iniciado_em", { ascending: false })
          .limit(20),
        supabase.from("clientes").select("id, sincronizado_em"),
        supabase.from("eventos").select("id, tipo, ocorrido_em"),
        supabase.from("eventos_bloqueados").select("id, motivo, ocorrido_em"),
      ]);

    const hoje = new Date().toISOString().slice(0, 10);
    const eventosHoje = (eventos.data ?? []).filter(
      (e: any) => String(e.ocorrido_em).slice(0, 10) === hoje,
    ).length;
    const duplicadosBarrados =
      (bloqueados.data ?? []).filter(
        (b: any) => b.motivo === "duplicado_idempotente",
      ).length +
      (sinc.data ?? []).reduce(
        (a: number, s: any) => a + (s.duplicados_barrados ?? 0),
        0,
      );

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
  .inputValidator((d: unknown) =>
    z.object({ busca: z.string().default("") }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const [creditosRes, bloqRes, acoesRes] = await Promise.all([
      supabase
        .from("creditos")
        .select(
          "id, quantidade, criado_em, clientes(nome, cpf_cnpj, erp_id), eventos(tipo, competencia, ocorrido_em, chave_idempotente)",
        )
        .order("criado_em", { ascending: false })
        .limit(500),
      supabase
        .from("eventos_bloqueados")
        .select(
          "id, tipo, motivo, detalhe, ocorrido_em, clientes(nome, cpf_cnpj)",
        )
        .order("ocorrido_em", { ascending: false })
        .limit(200),
      supabase
        .from("auditoria_admin")
        .select("id, email, acao, alvo, criado_em")
        .order("criado_em", { ascending: false })
        .limit(200),
    ]);

    const termo = data.busca.trim().toLowerCase();
    const filtra = (texto: string) =>
      !termo || texto.toLowerCase().includes(termo);

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
      .filter((c: any) =>
        filtra(`${c.nome} ${c.documento} ${c.erpId} ${c.tipo} ${c.chave}`),
      );

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
      .filter((b: any) =>
        filtra(
          `${b.nome} ${b.documento} ${b.tipo} ${b.motivo} ${b.detalhe ?? ""}`,
        ),
      );

    const acoes = (acoesRes.data ?? [])
      .map((a: any) => ({
        id: a.id,
        email: a.email ?? "—",
        acao: a.acao,
        alvo: a.alvo,
        criado_em: a.criado_em,
      }))
      .filter((a: any) => filtra(`${a.email} ${a.acao} ${a.alvo ?? ""}`));

    return { creditos, bloqueados, acoes };
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

    const ativa =
      (campanhasRes.data ?? []).find((c: any) => c.status === "aberta") ?? null;
    const dentro = (mes: string) =>
      !!ativa &&
      mes >= String(ativa.inicio).slice(0, 7) &&
      mes <= String(ativa.fim).slice(0, 7);

    const linhas = Array.from(meses.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({
        mes,
        assinatura: v["assinatura"] ?? 0,
        reativacao: v["reativacao"] ?? 0,
        quitacao_debito: v["quitacao_debito"] ?? 0,
        mensalidade_em_dia: v["mensalidade_em_dia"] ?? 0,
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
      await auditar(supabase, "criar_campanha", null, null, data);
      return { ok: true as const };
    }

    const { data: atual } = await supabase
      .from("campanhas")
      .select("*")
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

    const { error } = await supabase
      .from("campanhas")
      .update(patch)
      .eq("id", data.id);

    if (error) return { ok: false as const, erro: error.message };
    await auditar(supabase, "editar_campanha", data.id, atual, patch);
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
      .update({
        status: "aberta",
        criterio_congelado_em: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "rascunho");
    if (error) {
      // O banco só admite uma campanha aberta por vez.
      const conflito = error.code === "23505";
      return {
        ok: false as const,
        erro: conflito
          ? "Já existe uma campanha aberta. Encerre a atual antes de abrir a próxima."
          : error.message,
      };
    }
    await auditar(supabase, "abrir_campanha", data.id, null, null);
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

    // A campanha precisa estar em rascunho. O banco também barra por trigger —
    // esta checagem existe só para devolver uma frase legível em vez de um erro
    // de constraint.
    const { data: alvo } = await supabase
      .from("regras")
      .select("campanha_id, campanhas(status, nome)")
      .in(
        "id",
        data.regras.map((r) => r.id),
      );

    const travada = (alvo ?? []).find(
      (r: any) => r.campanhas?.status && r.campanhas.status !== "rascunho",
    );
    if (travada) {
      return {
        ok: false as const,
        erro: `Os pesos de "${travada.campanhas.nome}" estão congelados desde a abertura da campanha. Mudar peso com campanha aberta muda a regra do jogo no meio do jogo.`,
      };
    }

    const { data: antes } = await supabase
      .from("regras")
      .select("*")
      .in(
        "id",
        data.regras.map((r) => r.id),
      );

    for (const r of data.regras) {
      const { id, ...patch } = r;
      const { error } = await supabase
        .from("regras")
        .update(patch)
        .eq("id", id);
      if (error) return { ok: false as const, erro: error.message };
    }

    await auditar(supabase, "salvar_regras", null, antes, data.regras);
    return { ok: true as const };
  });

export const apurarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        concurso: z.string().trim().min(1).max(20),
        data_extracao: z.string().min(10),
        // Os cinco prêmios da extração da Loteria Federal.
        premios: z.array(z.string().trim().min(1).max(20)).min(1).max(5),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    // A apuração roda no banco: busca do ganhador com volta ao início da
    // cartela, gravação e travamento numa transação só.
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: resultado, error } = await supabaseAdmin.rpc(
      "apurar_campanha",
      {
        p_campanha_id: data.id,
        p_concurso: data.concurso,
        p_data_extracao: data.data_extracao,
        p_premios: data.premios,
      },
    );

    if (error) {
      console.error("[apurar_campanha]", error);
      return {
        ok: false as const,
        erro: "Não foi possível apurar agora. Tente de novo.",
      };
    }

    const r = resultado as {
      ok: boolean;
      erro?: string;
      numero_base?: number;
      numero_sorteado?: number;
      ganhador_cliente_id?: string;
    };

    await auditar(supabase, "apurar_campanha", data.id, null, r);

    if (!r.ok)
      return { ok: false as const, erro: r.erro ?? "Não foi possível apurar." };
    return {
      ok: true as const,
      numeroBase: r.numero_base!,
      numeroSorteado: r.numero_sorteado!,
    };
  });

export const processarEventos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: resultado, error } = await supabaseAdmin.rpc(
      "processar_eventos_pendentes",
      { p_limite: 5000 },
    );

    if (error) {
      console.error("[processar_eventos_pendentes]", error);
      return {
        ok: false as const,
        erro: "Não foi possível processar os eventos agora.",
      };
    }

    const r = resultado as {
      ok: boolean;
      creditados: number;
      bloqueados: number;
      ignorados: number;
    };

    await supabaseAdmin.from("sincronizacoes").insert({
      origem: "processamento_manual",
      status: "sucesso",
      eventos_lidos: r.creditados + r.bloqueados + r.ignorados,
      duplicados_barrados: r.ignorados,
      terminado_em: new Date().toISOString(),
    });

    await auditar(supabase, "processar_eventos", null, null, r);
    return {
      ok: true as const,
      creditados: r.creditados,
      bloqueados: r.bloqueados,
      ignorados: r.ignorados,
    };
  });

export const salvarConfiguracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        chave: z.string().min(2),
        valor: z.string().trim().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);
    const { data: antes } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", data.chave)
      .maybeSingle();

    const { error } = await supabase
      .from("configuracoes")
      .update({ valor: data.valor, atualizado_em: new Date().toISOString() })
      .eq("chave", data.chave);
    if (error) return { ok: false as const, erro: error.message };

    if (antes?.valor !== data.valor) {
      await auditar(supabase, "editar_configuracao", data.chave, antes, {
        valor: data.valor,
      });
    }
    return { ok: true as const };
  });
