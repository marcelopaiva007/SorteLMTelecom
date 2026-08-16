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

    // Os contadores são contados no banco. Antes vinham as tabelas inteiras de
    // clientes, eventos e bloqueados para serem contadas aqui — e vinham
    // cortadas no limite da API, então os números do painel ficavam falsos a
    // partir de mil linhas. "Hoje" também era calculado em UTC, três horas à
    // frente do dia de Brasília.
    const [campanhas, regras, config, sinc, operacional] = await Promise.all([
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
      supabase.rpc("resumo_operacional"),
    ]);

    const contagens = (operacional.data ?? {}) as {
      clientes?: number;
      eventos?: number;
      eventos_hoje?: number;
      bloqueados_duplicados?: number;
    };

    const duplicadosBarrados =
      (contagens.bloqueados_duplicados ?? 0) +
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
      clientesEspelhados: contagens.clientes ?? 0,
      ultimaLeitura: (sinc.data ?? [])[0]?.iniciado_em ?? null,
      eventosHoje: contagens.eventos_hoje ?? 0,
      duplicadosBarrados,
      falhasSeguidas,
      totalEventos: contagens.eventos ?? 0,
    };
  });

/**
 * Visão geral: os poucos números que respondem "o sorteio está saudável?".
 *
 * Seis indicadores, não mais. A leitura de painel degrada rápido depois disso,
 * e o painel não tinha tela de entrada nenhuma — abria direto em campanhas,
 * que é tela de configuração, não de acompanhamento.
 */
export const adminVisaoGeral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const s = await import("@/lib/sorteio.server");

    const campanha = await s.campanhaAtual();

    const [estatisticas, creditosRes, bloqueadosRes, clientesRes, sincRes] =
      await Promise.all([
        campanha
          ? supabaseAdmin.rpc("estatisticas_campanha", {
              p_campanha_id: campanha.id,
            })
          : Promise.resolve({ data: null }),
        campanha
          ? supabaseAdmin
              .from("creditos")
              .select("quantidade")
              .eq("campanha_id", campanha.id)
          : Promise.resolve({ data: [] }),
        supabaseAdmin
          .from("eventos_bloqueados")
          .select("*", { count: "exact", head: true }),
        supabaseAdmin
          .from("clientes")
          .select("*", { count: "exact", head: true }),
        supabaseAdmin
          .from("sincronizacoes")
          .select("status, iniciado_em")
          .order("iniciado_em", { ascending: false })
          .limit(5),
      ]);

    const est = (estatisticas.data ?? {}) as {
      ocupados?: number;
      participantes?: number;
    };
    const numerosConcedidos = (
      (creditosRes.data ?? []) as { quantidade: number }[]
    ).reduce((a, c) => a + c.quantidade, 0);

    let falhasSeguidas = 0;
    for (const linha of (sincRes.data ?? []) as { status: string }[]) {
      if (linha.status === "falha") falhasSeguidas++;
      else break;
    }

    const cartela = campanha ? Math.pow(10, campanha.digitos_cartela) : 0;
    const escolhidos = est.ocupados ?? 0;

    return {
      campanha: campanha
        ? {
            id: campanha.id,
            nome: campanha.nome,
            premio: campanha.premio,
            status: campanha.status,
            inicio: campanha.inicio,
            fim: campanha.fim,
            data_apuracao: campanha.data_apuracao,
            digitos_cartela: campanha.digitos_cartela,
            numero_sorteado: campanha.numero_sorteado,
          }
        : null,
      cartela,
      escolhidos,
      participantes: est.participantes ?? 0,
      numerosConcedidos,
      // Concedido menos escolhido: é quanto crédito está parado na mão dos
      // clientes. Número alto quer dizer que a comunicação não chegou.
      naEspera: Math.max(0, numerosConcedidos - escolhidos),
      bloqueados: bloqueadosRes.count ?? 0,
      clientes: clientesRes.count ?? 0,
      ultimaLeitura:
        ((sincRes.data ?? []) as { iniciado_em: string }[])[0]?.iniciado_em ??
        null,
      falhasSeguidas,
    };
  });

/**
 * Consulta de participante.
 *
 * É a função mais usada num back-office de sorteio e o painel não tinha:
 * quando o cliente liga dizendo que não recebeu números, alguém precisa
 * conseguir olhar o caso dele — o que entrou, o que foi barrado e por quê.
 */
export const adminCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ busca: z.string().trim().min(2).max(100) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const termo = data.busca.trim();
    const digitos = termo.replace(/\D/g, "");

    const { data: encontrados } = await supabaseAdmin
      .from("clientes")
      .select(
        "id, erp_id, cpf_cnpj, nome, whatsapp, status, meses_em_dia, autoexcluido_em",
      )
      .or(
        [
          `nome.ilike.%${termo}%`,
          `erp_id.ilike.%${termo}%`,
          ...(digitos.length >= 3 ? [`cpf_cnpj.ilike.%${digitos}%`] : []),
        ].join(","),
      )
      .limit(20);

    const lista = encontrados ?? [];
    if (lista.length !== 1) {
      return {
        ok: true as const,
        candidatos: lista.map((c) => ({
          id: c.id,
          nome: c.nome,
          documento: c.cpf_cnpj,
          erpId: c.erp_id,
        })),
        cliente: null,
      };
    }

    const cliente = lista[0]!;
    const [creditosRes, numerosRes, bloqRes] = await Promise.all([
      supabaseAdmin
        .from("creditos")
        .select(
          "id, quantidade, criado_em, detalhe, eventos(tipo, competencia, ocorrido_em)",
        )
        .eq("cliente_id", cliente.id)
        .order("criado_em", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("numeros")
        .select("numero, escolhido_em, protocolo")
        .eq("cliente_id", cliente.id)
        .order("numero")
        .limit(500),
      supabaseAdmin
        .from("eventos_bloqueados")
        .select("id, tipo, motivo, detalhe, ocorrido_em")
        .eq("cliente_id", cliente.id)
        .order("ocorrido_em", { ascending: false })
        .limit(50),
    ]);

    const creditos = ((creditosRes.data ?? []) as any[]).map((c) => ({
      id: c.id,
      quantidade: c.quantidade,
      criado_em: c.criado_em,
      tipo: c.eventos?.tipo ?? "",
      competencia: c.eventos?.competencia ?? null,
      detalhe: c.detalhe ?? null,
    }));

    const numeros = (numerosRes.data ?? []) as {
      numero: number;
      escolhido_em: string;
      protocolo: string | null;
    }[];
    const totalCreditos = creditos.reduce((a, c) => a + c.quantidade, 0);

    return {
      ok: true as const,
      candidatos: [],
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        documento: cliente.cpf_cnpj,
        erpId: cliente.erp_id,
        whatsapp: cliente.whatsapp,
        status: cliente.status,
        mesesEmDia: cliente.meses_em_dia,
        autoexcluido: !!cliente.autoexcluido_em,
        totalCreditos,
        saldo: totalCreditos - numeros.length,
        creditos,
        numeros,
        bloqueados: (bloqRes.data ?? []) as any[],
      },
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

    // A busca dos créditos roda no banco. Antes o filtro era aplicado em
    // JavaScript depois de um `limit(500)`, então só encontrava dentro dos 500
    // registros mais recentes — quem procurasse um cliente antigo não achava.
    const [creditosRes, bloqRes, acoesRes] = await Promise.all([
      supabase.rpc("buscar_creditos", { p_busca: data.busca, p_limite: 500 }),
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

    const creditos = (creditosRes.data ?? []).map((c: any) => ({
      id: c.id,
      quantidade: c.quantidade,
      criado_em: c.criado_em,
      nome: c.nome ?? "—",
      documento: c.documento ?? "",
      erpId: c.erp_id ?? "",
      tipo: c.tipo ?? "",
      competencia: c.competencia ?? null,
      chave: c.chave ?? "",
    }));

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

    // Agregação por mês feita no banco. Antes a tabela de eventos inteira vinha
    // para ser somada aqui — truncada no limite da API, o gráfico ficava curto.
    const [efeitoRes, campanhasRes] = await Promise.all([
      supabase.rpc("efeito_no_negocio"),
      supabase.from("campanhas").select("inicio, fim, status").order("inicio"),
    ]);

    const ativa =
      (campanhasRes.data ?? []).find((c: any) => c.status === "aberta") ?? null;
    const dentro = (mes: string) =>
      !!ativa &&
      mes >= String(ativa.inicio).slice(0, 7) &&
      mes <= String(ativa.fim).slice(0, 7);

    const linhas = ((efeitoRes.data ?? []) as any[]).map((l) => ({
      mes: l.mes as string,
      assinatura: Number(l.assinatura ?? 0),
      reativacao: Number(l.reativacao ?? 0),
      quitacao_debito: Number(l.quitacao_debito ?? 0),
      mensalidade_em_dia: Number(l.mensalidade_em_dia ?? 0),
      comSorteio: dentro(l.mes as string),
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

// ---------------------------------------------------------------------------
// Chave de integração do ERP
// ---------------------------------------------------------------------------
//
// A chave é o que o time do ERP precisa ter em mãos, então o painel mostra —
// para um administrador já autenticado, o mesmo que já pode ver a base inteira.
// Quando a chave vem do ambiente da hospedagem, o painel não tem como lê-la e
// diz isso em vez de fingir que não existe chave nenhuma.

export const chaveErp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    if (process.env["ERP_CHAVE_INGESTAO"]) {
      return {
        ok: true as const,
        origem: "ambiente" as const,
        chave: null,
        atualizadaEm: null,
      };
    }

    const [{ supabaseAdmin }, { CHAVE_ERP }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./erp.server"),
    ]);

    const { data, error } = await supabaseAdmin
      .from("segredos")
      .select("valor, atualizado_em")
      .eq("chave", CHAVE_ERP)
      .maybeSingle();

    if (error) {
      console.error("[chave_erp]", error);
      return { ok: false as const, erro: "Não foi possível ler a chave." };
    }

    return {
      ok: true as const,
      origem: "banco" as const,
      chave: data?.valor ?? null,
      atualizadaEm: data?.atualizado_em ?? null,
    };
  });

export const girarChaveErp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    if (process.env["ERP_CHAVE_INGESTAO"]) {
      return {
        ok: false as const,
        erro: "A chave vem do ambiente da hospedagem. Gire-a por lá.",
      };
    }

    // 256 bits de aleatoriedade do sistema. O prefixo só serve para quem for
    // ler o cabeçalho saber do que se trata.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const nova =
      "erp_" +
      btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");

    const [{ supabaseAdmin }, { CHAVE_ERP, esquecerChaveDeIngestao }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("./erp.server"),
      ]);

    const { error } = await supabaseAdmin.from("segredos").upsert(
      {
        chave: CHAVE_ERP,
        valor: nova,
        descricao: "Cabeçalho x-erp-chave em POST /api/erp/eventos",
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "chave" },
    );

    if (error) {
      console.error("[girar_chave_erp]", error);
      return { ok: false as const, erro: "Não foi possível gravar a chave." };
    }

    esquecerChaveDeIngestao();
    // A chave nova nunca vai para a auditoria — só o fato de ter girado.
    await auditar(supabase, "girar_chave_erp", null, null, null);
    return { ok: true as const, chave: nova };
  });
