// Cliente do Supabase com service_role, para o servidor.
//
// Existe em vez de usar `@/integrations/supabase/client.server` pelo mesmo motivo
// do cliente do navegador: aquele arquivo é gerado automaticamente e exige que
// `SUPABASE_URL` esteja no ambiente da hospedagem. A URL é pública e agora vem de
// `supabase/config`, com valor embutido, então falta de configuração deixa de
// derrubar o servidor por causa dela.
//
// A `SUPABASE_SERVICE_ROLE_KEY` continua sendo obrigatória e sem valor embutido:
// ela dá acesso irrestrito ao banco, passa por cima de toda a RLS e não pode
// morar no repositório. Sem ela, este módulo lança com uma mensagem que diz
// exatamente o que fazer.
//
// SEGURANÇA: só use dentro de handlers de servidor. Importe com `await import`
// em arquivos que vão para o bundle do navegador (rotas e *.functions.ts).

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SUPABASE_URL } from "@/integrations/supabase/config";

function fetchDoSupabase(chave: string): typeof fetch {
  const opaca =
    chave.startsWith("sb_publishable_") || chave.startsWith("sb_secret_");

  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((valor, nome) =>
        headers.set(nome, valor),
      );
    }

    if (opaca && headers.get("Authorization") === `Bearer ${chave}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", chave);
    return fetch(input, { ...init, headers });
  };
}

function criar() {
  const chave = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!chave) {
    const mensagem =
      "SUPABASE_SERVICE_ROLE_KEY não está definida no ambiente do servidor. " +
      "Defina-a nas variáveis da hospedagem (Supabase → Project Settings → " +
      "API keys → service_role). Sem ela nenhuma função de servidor funciona.";
    console.error(`[Supabase] ${mensagem}`);
    throw new Error(mensagem);
  }

  return createClient<Database>(SUPABASE_URL, chave, {
    global: { fetch: fetchDoSupabase(chave) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let instancia: ReturnType<typeof criar> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof criar>, {
  get(_, prop, receiver) {
    instancia ??= criar();
    return Reflect.get(instancia, prop, receiver);
  },
});
