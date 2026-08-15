import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const docSchema = z.object({ documento: z.string().trim().min(11).max(20) });

export const solicitarCodigo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => docSchema.parse(d))
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const cliente = await s.clientePorDocumento(data.documento);
    if (!cliente) {
      return { ok: false as const, erro: "Não encontramos esse CPF/CNPJ na base da L&M Telecom." };
    }
    if (cliente.autoexcluido_em) {
      return {
        ok: false as const,
        erro: "Este CPF/CNPJ pediu autoexclusão dos sorteios. Fale com o atendimento da LM.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    await supabaseAdmin.from("codigos_acesso").insert({
      cliente_id: cliente.id,
      codigo,
      expira_em: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    return {
      ok: true as const,
      whatsapp: s.mascararWhatsapp(cliente.whatsapp),
      nome: s.primeiroNome(cliente.nome),
      codigoDemo: codigo,
    };
  });

export const validarCodigo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ documento: z.string().trim(), codigo: z.string().trim().length(6) }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cliente = await s.clientePorDocumento(data.documento);
    if (!cliente) return { ok: false as const, erro: "CPF/CNPJ inválido." };
    const { data: registro } = await supabaseAdmin
      .from("codigos_acesso")
      .select("*")
      .eq("cliente_id", cliente.id)
      .eq("codigo", data.codigo)
      .is("usado_em", null)
      .gt("expira_em", new Date().toISOString())
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!registro) return { ok: false as const, erro: "Código incorreto ou expirado." };
    await supabaseAdmin
      .from("codigos_acesso")
      .update({ usado_em: new Date().toISOString() })
      .eq("id", registro.id);
    const token = crypto.randomUUID() + "." + crypto.randomUUID();
    await supabaseAdmin.from("sessoes").insert({
      token,
      cliente_id: cliente.id,
      expira_em: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    return { ok: true as const, token };
  });

export const carregarPainel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cliente = await s.clienteDaSessao(data.token);
    if (!cliente) return { ok: false as const };
    const campanha = await s.campanhaAtual();

    const [creditosRes, meusRes, ocupadosRes, participantesRes] = await Promise.all([
      supabaseAdmin
        .from("creditos")
        .select("id, quantidade, criado_em, eventos(tipo, competencia, ocorrido_em)")
        .eq("cliente_id", cliente.id)
        .eq("campanha_id", s.CAMPANHA_ID)
        .order("criado_em", { ascending: false }),
      supabaseAdmin
        .from("numeros")
        .select("numero, escolhido_em, protocolo")
        .eq("cliente_id", cliente.id)
        .eq("campanha_id", s.CAMPANHA_ID)
        .order("numero"),
      supabaseAdmin.from("numeros").select("numero").eq("campanha_id", s.CAMPANHA_ID),
      supabaseAdmin
        .from("creditos")
        .select("cliente_id")
        .eq("campanha_id", s.CAMPANHA_ID),
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
    const participantes = new Set((participantesRes.data ?? []).map((c) => c.cliente_id)).size;

    return {
      ok: true as const,
      cliente: {
        nome: cliente.nome,
        primeiroNome: s.primeiroNome(cliente.nome),
        mesesEmDia: cliente.meses_em_dia,
        documento: cliente.cpf_cnpj,
      },
      campanha,
      creditos,
      totalCreditos,
      saldo: totalCreditos - meusNumeros.length,
      meusNumeros,
      ocupados,
      participantes,
    };
  });

export const escolherNumeros = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(10),
        numeros: z.array(z.number().int().min(0).max(9999)).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cliente = await s.clienteDaSessao(data.token);
    if (!cliente) return { ok: false as const, erro: "Sessão expirada. Entre novamente." };

    const [{ data: creditos }, { data: meus }] = await Promise.all([
      supabaseAdmin
        .from("creditos")
        .select("quantidade")
        .eq("cliente_id", cliente.id)
        .eq("campanha_id", s.CAMPANHA_ID),
      supabaseAdmin
        .from("numeros")
        .select("numero")
        .eq("cliente_id", cliente.id)
        .eq("campanha_id", s.CAMPANHA_ID),
    ]);
    const saldo =
      (creditos ?? []).reduce((a, c) => a + c.quantidade, 0) - (meus ?? []).length;
    const escolhidos = Array.from(new Set(data.numeros));
    if (escolhidos.length > saldo) {
      return { ok: false as const, erro: `Você tem apenas ${saldo} número(s) disponível(is).` };
    }

    const protocolo =
      "LM-" +
      new Date().toISOString().slice(2, 10).replace(/-/g, "") +
      "-" +
      String(Math.floor(1000 + Math.random() * 9000));

    const { error } = await supabaseAdmin.from("numeros").insert(
      escolhidos.map((numero) => ({
        campanha_id: s.CAMPANHA_ID,
        numero,
        cliente_id: cliente.id,
        protocolo,
      })),
    );
    if (error) {
      return {
        ok: false as const,
        erro: "Algum dos números acabou de ser escolhido por outro cliente. Atualize a cartela.",
      };
    }
    return { ok: true as const, protocolo, numeros: escolhidos.sort((a, b) => a - b) };
  });

export const buscarComprovante = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(10), protocolo: z.string().min(3) }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cliente = await s.clienteDaSessao(data.token);
    if (!cliente) return { ok: false as const };
    const { data: numeros } = await supabaseAdmin
      .from("numeros")
      .select("numero, escolhido_em")
      .eq("cliente_id", cliente.id)
      .eq("campanha_id", s.CAMPANHA_ID)
      .eq("protocolo", data.protocolo)
      .order("numero");
    const campanha = await s.campanhaAtual();
    return {
      ok: true as const,
      nome: cliente.nome,
      protocolo: data.protocolo,
      numeros: numeros ?? [],
      campanha,
    };
  });

export const carregarResultado = createServerFn({ method: "GET" }).handler(async () => {
  const s = await import("./sorteio.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const campanha = await s.campanhaAtual();
  if (!campanha || campanha.numero_sorteado === null) {
    return { ok: true as const, campanha, ganhador: null, apurada: false as const };
  }
  const { data: ganhador } = await supabaseAdmin
    .from("clientes")
    .select("nome")
    .eq("id", campanha.ganhador_cliente_id ?? "")
    .maybeSingle();
  return {
    ok: true as const,
    campanha,
    ganhador: ganhador ? s.primeiroNome(ganhador.nome) + " " + ganhador.nome.split(" ").slice(-1)[0]?.[0] + "." : null,
    apurada: true as const,
  };
});

export const autoexcluir = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./sorteio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cliente = await s.clienteDaSessao(data.token);
    if (!cliente) return { ok: false as const };
    await supabaseAdmin
      .from("clientes")
      .update({ autoexcluido_em: new Date().toISOString() })
      .eq("id", cliente.id);
    await supabaseAdmin.from("sessoes").delete().eq("cliente_id", cliente.id);
    return { ok: true as const };
  });
