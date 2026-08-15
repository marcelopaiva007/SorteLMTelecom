import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CAMPANHA_ID = "11111111-1111-1111-1111-111111111111";

export function soDigitos(v: string) {
  return (v || "").replace(/\D/g, "");
}

export async function clientePorDocumento(cpfCnpj: string) {
  const { data } = await supabaseAdmin
    .from("clientes")
    .select("*")
    .eq("cpf_cnpj", soDigitos(cpfCnpj))
    .maybeSingle();
  return data;
}

export async function clienteDaSessao(token: string) {
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

export async function campanhaAtual() {
  const { data } = await supabaseAdmin
    .from("campanhas")
    .select("*")
    .eq("id", CAMPANHA_ID)
    .maybeSingle();
  return data;
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
