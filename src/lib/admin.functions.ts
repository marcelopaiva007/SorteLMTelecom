import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
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

    // Uma chamada só, com o token do próprio administrador. Antes eram cinco
    // consultas com a chave service_role — que precisa estar no ambiente da
    // hospedagem e, faltando, derrubava esta tela inteira enquanto o resto do
    // painel continuava de pé. Nada aqui exige privilégio além de "é admin",
    // e a função no banco confere isso por dentro.
    const { data, error } = await supabase.rpc("resumo_visao_geral");

    if (error) {
      console.error("[resumo_visao_geral]", error);
      throw new Error("Não foi possível carregar a visão geral.");
    }

    const r = (data ?? {}) as {
      campanha: {
        id: string;
        nome: string;
        premio: string;
        status: string;
        inicio: string;
        fim: string;
        data_apuracao: string;
        digitos_cartela: number;
        numero_sorteado: number | null;
        modo_apuracao: "loteria_federal" | "sorteio_proprio";
      } | null;
      cartela: number;
      escolhidos: number;
      participantes: number;
      numeros_concedidos: number;
      na_espera: number;
      bloqueados: number;
      clientes: number;
      ultima_leitura: string | null;
      falhas_seguidas: number;
    };

    return {
      campanha: r.campanha,
      cartela: r.cartela ?? 0,
      escolhidos: r.escolhidos ?? 0,
      participantes: r.participantes ?? 0,
      numerosConcedidos: r.numeros_concedidos ?? 0,
      // Concedido menos escolhido: é quanto crédito está parado na mão dos
      // clientes. Número alto quer dizer que a comunicação não chegou.
      naEspera: r.na_espera ?? 0,
      bloqueados: r.bloqueados ?? 0,
      clientes: r.clientes ?? 0,
      ultimaLeitura: r.ultima_leitura,
      falhasSeguidas: r.falhas_seguidas ?? 0,
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

    // As cinco tabelas têm policy "admin le X" para authenticated, então o
    // token do próprio administrador basta — não precisa de service_role.
    const termo = data.busca.trim();
    const digitos = termo.replace(/\D/g, "");

    const { data: encontrados } = await supabase
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
      supabase
        .from("creditos")
        .select(
          "id, quantidade, criado_em, detalhe, eventos(tipo, competencia, ocorrido_em)",
        )
        .eq("cliente_id", cliente.id)
        .order("criado_em", { ascending: false })
        .limit(100),
      supabase
        .from("numeros")
        .select("numero, escolhido_em, protocolo")
        .eq("cliente_id", cliente.id)
        .order("numero")
        .limit(500),
      supabase
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
        // Como o número vencedor vai sair. Escolhido na criação e congelado na
        // abertura, porque é parte da promessa que o cliente lê antes de
        // escolher os números dele.
        modo_apuracao: z.enum(["loteria_federal", "sorteio_proprio"]),
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
        modo_apuracao: data.modo_apuracao,
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
    if (travado && atual.modo_apuracao !== data.modo_apuracao) {
      return {
        ok: false as const,
        erro: "A forma de apuração está congelada desde a abertura da campanha e não pode ser alterada.",
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
            modo_apuracao: data.modo_apuracao,
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
    const { data: resultado, error } = await supabase.rpc("apurar_campanha", {
      p_campanha_id: data.id,
      p_concurso: data.concurso,
      p_data_extracao: data.data_extracao,
      p_premios: data.premios,
    });

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

/**
 * Apuração por sorteio próprio.
 *
 * O número sai ao vivo no estúdio e o operador registra aqui o que foi
 * sorteado. O que sustenta o resultado não é a extração da Caixa, é a gravação
 * da transmissão mais a assinatura de quem auditou — por isso os dois são
 * obrigatórios, e o banco recusa a apuração sem eles.
 */
export const apurarCampanhaPropria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        numero: z.number().int().min(0).max(999999),
        realizado_em: z.string().min(10),
        transmissao: z.string().trim().url().max(500),
        auditores: z.array(z.string().trim().min(3).max(120)).min(1).max(10),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { data: resultado, error } = await supabase.rpc(
      "apurar_campanha_propria",
      {
        p_campanha_id: data.id,
        p_numero: data.numero,
        p_realizado_em: data.realizado_em,
        p_transmissao: data.transmissao,
        p_auditores: data.auditores,
      },
    );

    if (error) {
      console.error("[apurar_campanha_propria]", error);
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

    // Roda no banco, com o token do administrador. A função confere `is_admin`
    // por dentro e já grava a rodada no histórico de leituras.
    const { data: resultado, error } = await supabase.rpc(
      "processar_eventos_admin",
    );

    if (error) {
      console.error("[processar_eventos_admin]", error);
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

    const { data, error } = await supabase.rpc("ler_chave_erp");

    if (error) {
      console.error("[ler_chave_erp]", error);
      return { ok: false as const, erro: "Não foi possível ler a chave." };
    }

    const r = (data ?? {}) as { chave?: string; atualizado_em?: string };
    return {
      ok: true as const,
      origem: "banco" as const,
      chave: r.chave ?? null,
      atualizadaEm: r.atualizado_em ?? null,
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

    // A chave nova é sorteada dentro do banco, com 32 bytes de aleatoriedade,
    // e volta uma única vez para ser mostrada ao administrador.
    const { data, error } = await supabase.rpc("girar_chave_erp");

    if (error) {
      console.error("[girar_chave_erp]", error);
      return { ok: false as const, erro: "Não foi possível gravar a chave." };
    }

    const { esquecerChaveDeIngestao } = await import("./erp.server");
    esquecerChaveDeIngestao();

    // A chave nova nunca vai para a auditoria — só o fato de ter girado.
    await auditar(supabase, "girar_chave_erp", null, null, null);
    return {
      ok: true as const,
      chave: ((data ?? {}) as { chave?: string }).chave ?? null,
    };
  });
