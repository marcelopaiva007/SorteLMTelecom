import {
  deleteCookie,
  getCookie,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const COOKIE_SESSAO = "sorteio_lm_sessao";
const DIAS_DE_SESSAO = 7;

export function soDigitos(v: string) {
  return (v || "").replace(/\D/g, "");
}

// --- sessão -----------------------------------------------------------------
// O token nunca chega ao JavaScript da página: vive num cookie httpOnly e o
// navegador o reenvia sozinho. Um XSS não consegue lê-lo, e o logout apaga a
// linha em `sessoes`, então o token morre no servidor e não só no aparelho.

export function gravarCookieSessao(token: string) {
  setCookie(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DIAS_DE_SESSAO * 24 * 60 * 60,
  });
}

export function lerCookieSessao(): string | null {
  return getCookie(COOKIE_SESSAO) ?? null;
}

export function apagarCookieSessao() {
  deleteCookie(COOKIE_SESSAO, { path: "/" });
}

export async function encerrarSessao() {
  const token = lerCookieSessao();
  apagarCookieSessao();
  if (token) await supabaseAdmin.from("sessoes").delete().eq("token", token);
}

export async function abrirSessao(clienteId: string) {
  const token = crypto.randomUUID() + "." + crypto.randomUUID();
  const { error } = await supabaseAdmin.from("sessoes").insert({
    token,
    cliente_id: clienteId,
    expira_em: new Date(
      Date.now() + DIAS_DE_SESSAO * 24 * 3600 * 1000,
    ).toISOString(),
  });
  if (error) return null;
  gravarCookieSessao(token);
  return token;
}

export async function clienteDaSessao() {
  const token = lerCookieSessao();
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from("sessoes")
    .select("cliente_id, expira_em")
    .eq("token", token)
    .maybeSingle();
  if (!data || new Date(data.expira_em) < new Date()) return null;
  const { data: cliente } = await supabaseAdmin
    .from("clientes")
    .select("*")
    .eq("id", data.cliente_id)
    .maybeSingle();
  if (!cliente || cliente.autoexcluido_em) return null;
  return cliente;
}

// --- limites de taxa --------------------------------------------------------

export function ipDaRequisicao() {
  try {
    // A aplicação roda atrás do proxy da Vercel, então o x-forwarded-for é o
    // único endereço real disponível.
    return getRequestIP({ xForwardedFor: true }) ?? "desconhecido";
  } catch {
    return "desconhecido";
  }
}

export async function dentroDoLimite(
  chave: string,
  maximo: number,
  janelaSegundos: number,
) {
  const { data, error } = await supabaseAdmin.rpc("consumir_limite", {
    p_chave: chave,
    p_maximo: maximo,
    p_janela_segundos: janelaSegundos,
  });
  // Falha na checagem trata como estouro: em dúvida, barrar é o lado seguro.
  if (error) return false;
  return data === true;
}

// --- códigos de acesso ------------------------------------------------------

export function gerarCodigo() {
  // Math.random é previsível o bastante para ser adivinhado; código de acesso
  // precisa de gerador criptográfico.
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return String(100000 + ((buffer[0] ?? 0) % 900000));
}

// --- consultas --------------------------------------------------------------

export async function clientePorDocumento(cpfCnpj: string) {
  const { data } = await supabaseAdmin
    .from("clientes")
    .select("*")
    .eq("cpf_cnpj", soDigitos(cpfCnpj))
    .maybeSingle();
  return data;
}

/**
 * A campanha que as telas do cliente mostram.
 *
 * Era um UUID fixo no código, então o painel deixava criar campanhas que o
 * cliente nunca veria. Agora vale a campanha aberta — e o banco garante que só
 * existe uma por vez. Sem campanha aberta, cai na última já encerrada, para que
 * a tela de resultado continue mostrando o último sorteio.
 */
export async function campanhaAtual() {
  const { data: aberta } = await supabaseAdmin
    .from("campanhas")
    .select("*")
    .eq("status", "aberta")
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (aberta) return aberta;

  const { data: ultima } = await supabaseAdmin
    .from("campanhas")
    .select("*")
    .neq("status", "rascunho")
    .order("data_apuracao", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ultima;
}

export async function regrasDaCampanha(campanhaId: string) {
  const { data } = await supabaseAdmin
    .from("regras")
    .select(
      "tipo_evento, quantidade, carencia_dias, limite_meses, bonus_a_cada_meses, bonus_quantidade, teto_quantidade",
    )
    .eq("campanha_id", campanhaId)
    .order("quantidade", { ascending: false });
  return data ?? [];
}

export function mascararWhatsapp(w: string | null) {
  const d = soDigitos(w ?? "");
  if (d.length < 6) return "•••••";
  return `(${d.slice(2, 4)}) ••••-${d.slice(-4)}`;
}

export function primeiroNome(nome: string) {
  return nome.split(" ")[0] ?? nome;
}

export const ROTULO_EVENTO: Record<string, string> = {
  assinatura: "Assinatura de plano novo",
  reativacao: "Reativação de contrato",
  quitacao_debito: "Quitação de débito em atraso",
  mensalidade_em_dia: "Mensalidade paga em dia",
};
