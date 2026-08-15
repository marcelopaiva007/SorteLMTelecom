import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const docSchema = z.object({ documento: z.string().trim().min(11).max(20) });

// Mensagem única para todos os desfechos de "pedi um código".
//
// Antes, a tela dizia se o CPF era ou não cliente da LM e devolvia nome e final
// do WhatsApp — sem nenhuma autenticação. Dava para varrer CPFs e montar uma
// lista de assinantes com nome e telefone. Agora a resposta é sempre igual:
// quem é cliente recebe a mensagem, quem não é fica sem saber que não é.
const RESPOSTA_NEUTRA =
  "Se este CPF/CNPJ for de cliente da L&M Telecom, enviamos um código de 6 dígitos para o WhatsApp cadastrado no contrato.";

export const solicitarCodigo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => docSchema.parse(d))
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const { enviarCodigo, modoDemo } = await import("./whatsapp.server");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    const documento = s.soDigitos(data.documento);

    // Dois limites: um contra quem varre muitos CPFs do mesmo lugar, outro
    // contra quem pede código sem parar para um CPF só.
    const [ipOk, docOk] = await Promise.all([
      s.dentroDoLimite(`codigo:ip:${s.ipDaRequisicao()}`, 20, 15 * 60),
      s.dentroDoLimite(`codigo:doc:${documento}`, 3, 15 * 60),
    ]);
    if (!ipOk || !docOk) {
      return {
        ok: false as const,
        erro: "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.",
      };
    }

    const cliente = await s.clientePorDocumento(documento);

    // Cliente inexistente ou autoexcluído: nada acontece, mas a resposta é a
    // mesma de quem recebeu o código.
    if (!cliente || cliente.autoexcluido_em) {
      return { ok: true as const, aviso: RESPOSTA_NEUTRA };
    }

    const codigo = s.gerarCodigo();
    const { error } = await supabaseAdmin.rpc("emitir_codigo_acesso", {
      p_cliente_id: cliente.id,
      p_codigo: codigo,
      p_expira_em: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) {
      return {
        ok: false as const,
        erro: "Não foi possível gerar seu código agora. Tente de novo.",
      };
    }

    await enviarCodigo(cliente.whatsapp, codigo, s.primeiroNome(cliente.nome));

    return {
      ok: true as const,
      aviso: RESPOSTA_NEUTRA,
      // Só existe em ambiente de demonstração, com SORTEIO_MODO_DEMO=1 e fora
      // de produção. Ver src/lib/whatsapp.server.ts.
      ...(modoDemo() ? { codigoDemo: codigo } : {}),
    };
  });

export const validarCodigo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        documento: z.string().trim(),
        codigo: z.string().trim().length(6),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    const documento = s.soDigitos(data.documento);
    const erroPadrao = {
      ok: false as const,
      erro: "Código incorreto ou expirado.",
    };

    if (
      !(await s.dentroDoLimite(`validar:ip:${s.ipDaRequisicao()}`, 30, 15 * 60))
    ) {
      return {
        ok: false as const,
        erro: "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.",
      };
    }

    const cliente = await s.clientePorDocumento(documento);
    if (!cliente || cliente.autoexcluido_em) return erroPadrao;

    // A função no banco confere, conta a tentativa e mata o código no quinto
    // erro — tudo numa transação, para que N requisições paralelas não contem
    // como uma tentativa só.
    const { data: aceito, error } = await supabaseAdmin.rpc(
      "consumir_codigo_acesso",
      {
        p_cliente_id: cliente.id,
        p_codigo: data.codigo,
      },
    );
    if (error || aceito !== true) return erroPadrao;

    const token = await s.abrirSessao(cliente.id);
    if (!token)
      return {
        ok: false as const,
        erro: "Não foi possível abrir sua sessão. Tente de novo.",
      };

    return { ok: true as const };
  });

// Pesos da campanha para a tela de entrada, que é vista antes do login.
// Sai do banco em vez de estar escrito à mão na tela: era isso que fazia a
// primeira tela anunciar metade do que o regulamento prometia.
export const regrasVigentes = createServerFn({ method: "GET" }).handler(
  async () => {
    const s = await import("./sorteio.server");
    const campanha = await s.campanhaAtual();
    if (!campanha) return { campanha: null, regras: [] };
    return {
      campanha: {
        nome: campanha.nome,
        premio: campanha.premio,
        digitos_cartela: campanha.digitos_cartela,
      },
      regras: await s.regrasDaCampanha(campanha.id),
    };
  },
);

// O cookie de sessão é httpOnly, então a página não consegue olhar para ele.
// Esta é a pergunta barata que substitui o antigo `lerToken()`.
export const sessaoAtiva = createServerFn({ method: "GET" }).handler(
  async () => {
    const s = await import("./sorteio.server");
    return { ativa: (await s.clienteDaSessao()) !== null };
  },
);

export const carregarPainel = createServerFn({ method: "POST" }).handler(
  async () => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const cliente = await s.clienteDaSessao();
    if (!cliente) return { ok: false as const };

    const campanha = await s.campanhaAtual();
    if (!campanha) {
      return {
        ok: true as const,
        cliente: {
          nome: cliente.nome,
          primeiroNome: s.primeiroNome(cliente.nome),
          mesesEmDia: cliente.meses_em_dia,
        },
        campanha: null,
        regras: [],
        creditos: [],
        totalCreditos: 0,
        saldo: 0,
        meusNumeros: [],
        ocupados: [],
        participantes: 0,
      };
    }

    const [creditosRes, meusRes, ocupadosRes, participantesRes, regras] =
      await Promise.all([
        supabaseAdmin
          .from("creditos")
          .select(
            "id, quantidade, criado_em, eventos(tipo, competencia, ocorrido_em)",
          )
          .eq("cliente_id", cliente.id)
          .eq("campanha_id", campanha.id)
          .order("criado_em", { ascending: false }),
        supabaseAdmin
          .from("numeros")
          .select("numero, escolhido_em, protocolo")
          .eq("cliente_id", cliente.id)
          .eq("campanha_id", campanha.id)
          .order("numero"),
        supabaseAdmin
          .from("numeros")
          .select("numero")
          .eq("campanha_id", campanha.id),
        supabaseAdmin
          .from("creditos")
          .select("cliente_id")
          .eq("campanha_id", campanha.id),
        s.regrasDaCampanha(campanha.id),
      ]);

    const creditos = (creditosRes.data ?? []).map((c) => {
      const ev = c.eventos as unknown as {
        tipo: string;
        competencia: string | null;
        ocorrido_em: string;
      } | null;
      return {
        id: c.id,
        quantidade: c.quantidade,
        criado_em: c.criado_em,
        tipo: ev?.tipo ?? "assinatura",
        rotulo: s.ROTULO_EVENTO[ev?.tipo ?? "assinatura"] ?? "Crédito",
        competencia: ev?.competencia ?? null,
      };
    });

    const totalCreditos = creditos.reduce((a, c) => a + c.quantidade, 0);
    const meusNumeros = meusRes.data ?? [];
    const ocupados = (ocupadosRes.data ?? []).map((n) => n.numero);
    const participantes = new Set(
      (participantesRes.data ?? []).map((c) => c.cliente_id),
    ).size;

    return {
      ok: true as const,
      cliente: {
        nome: cliente.nome,
        primeiroNome: s.primeiroNome(cliente.nome),
        mesesEmDia: cliente.meses_em_dia,
        // O CPF/CNPJ não sai daqui: nenhuma tela usa e dado pessoal que não
        // precisa trafegar, não trafega.
      },
      campanha,
      regras,
      creditos,
      totalCreditos,
      saldo: totalCreditos - meusNumeros.length,
      meusNumeros,
      ocupados,
      participantes,
    };
  },
);

export const escolherNumeros = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        // A faixa real vem de digitos_cartela e é conferida no banco; aqui só
        // barramos entrada absurda antes de chegar lá.
        numeros: z.array(z.number().int().min(0).max(999999)).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const cliente = await s.clienteDaSessao();
    if (!cliente)
      return { ok: false as const, erro: "Sessão expirada. Entre novamente." };

    const campanha = await s.campanhaAtual();
    if (!campanha)
      return {
        ok: false as const,
        erro: "Nenhuma campanha aberta no momento.",
      };

    // Saldo, janela da campanha, faixa da cartela e gravação acontecem na mesma
    // transação. Antes o saldo era lido e só depois gravado, então duas
    // requisições simultâneas passavam as duas pela checagem.
    const { data: resultado, error } = await supabaseAdmin.rpc(
      "escolher_numeros",
      {
        p_cliente_id: cliente.id,
        p_campanha_id: campanha.id,
        p_numeros: data.numeros,
      },
    );

    if (error) {
      console.error("[escolher_numeros]", error);
      return {
        ok: false as const,
        erro: "Não foi possível confirmar seus números agora. Tente de novo.",
      };
    }

    const r = resultado as {
      ok: boolean;
      erro?: string;
      protocolo?: string;
      numeros?: number[];
      conflito?: boolean;
    };

    if (!r.ok) {
      return {
        ok: false as const,
        erro: r.erro ?? "Não foi possível confirmar seus números.",
      };
    }

    return {
      ok: true as const,
      protocolo: r.protocolo!,
      numeros: r.numeros ?? [],
    };
  });

export const buscarComprovante = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ protocolo: z.string().trim().min(3) }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const cliente = await s.clienteDaSessao();
    if (!cliente)
      return { ok: false as const, erro: "Sessão expirada. Entre novamente." };
    const campanha = await s.campanhaAtual();
    if (!campanha)
      return { ok: false as const, erro: "Campanha não encontrada." };
    const { data: numeros } = await supabaseAdmin
      .from("numeros")
      .select("numero, escolhido_em")
      .eq("cliente_id", cliente.id)
      .eq("campanha_id", campanha.id)
      .eq("protocolo", data.protocolo)
      .order("numero");
    return {
      ok: true as const,
      nome: cliente.nome,
      protocolo: data.protocolo,
      numeros: numeros ?? [],
      campanha,
    };
  });

export const carregarResultado = createServerFn({ method: "GET" }).handler(
  async () => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const campanha = await s.campanhaAtual();
    if (
      !campanha ||
      campanha.numero_sorteado === null ||
      !campanha.ganhador_cliente_id
    ) {
      return {
        ok: true as const,
        campanha,
        ganhador: null,
        apurada: false as const,
      };
    }
    const { data: ganhador } = await supabaseAdmin
      .from("clientes")
      .select("nome")
      .eq("id", campanha.ganhador_cliente_id)
      .maybeSingle();
    return {
      ok: true as const,
      campanha,
      ganhador: ganhador ? abreviarNome(ganhador.nome) : null,
      apurada: true as const,
    };
  },
);

// "Maria Aparecida Souza" -> "Maria S." — anuncia o ganhador sem expor o nome
// inteiro de quem não pediu para aparecer.
function abreviarNome(nome: string) {
  const partes = nome.trim().split(/\s+/);
  const primeiro = partes[0] ?? nome;
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : undefined;
  const inicial = ultimo?.[0];
  return inicial ? `${primeiro} ${inicial}.` : primeiro;
}

export const sair = createServerFn({ method: "POST" }).handler(async () => {
  const s = await import("./sorteio.server");
  await s.encerrarSessao();
  return { ok: true as const };
});

export const autoexcluir = createServerFn({ method: "POST" }).handler(
  async () => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const cliente = await s.clienteDaSessao();
    if (!cliente) return { ok: false as const };
    await supabaseAdmin
      .from("clientes")
      .update({ autoexcluido_em: new Date().toISOString() })
      .eq("id", cliente.id);
    await supabaseAdmin.from("sessoes").delete().eq("cliente_id", cliente.id);
    s.apagarCookieSessao();
    return { ok: true as const };
  },
);
