// Cliente do Supabase para o navegador.
//
// Existe em vez de usar `@/integrations/supabase/client` porque aquele arquivo é
// gerado automaticamente e depende de `VITE_*` resolvida em tempo de build. Sem
// as variáveis na hospedagem, ele lança na primeira propriedade acessada e
// derruba a aplicação inteira. Aqui a configuração vem de `supabase/config`, que
// tem valor embutido — ver o comentário de lá para por que isso é seguro.
//
// No navegador este cliente serve só para o login do painel administrativo. Os
// dados do cliente final não passam por ele: vão por funções de servidor.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "@/integrations/supabase/config";

/**
 * As chaves novas do Supabase (`sb_publishable_…`) são opacas, não são JWT. O
 * cliente manda `Authorization: Bearer <chave>` por padrão e o PostgREST recusa;
 * o certo é a chave ir só no cabeçalho `apikey`.
 */
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
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: fetchDoSupabase(SUPABASE_PUBLISHABLE_KEY) },
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let instancia: ReturnType<typeof criar> | undefined;

/** Criado na primeira propriedade acessada, para não tocar em localStorage no SSR. */
export const supabase = new Proxy({} as ReturnType<typeof criar>, {
  get(_, prop, receiver) {
    instancia ??= criar();
    return Reflect.get(instancia, prop, receiver);
  },
});
