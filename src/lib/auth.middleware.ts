// Autenticação das funções de servidor do painel.
//
// Existe em vez de usar `@/integrations/supabase/auth-middleware` porque aquele
// arquivo é gerado automaticamente e exige `SUPABASE_URL` e
// `SUPABASE_PUBLISHABLE_KEY` no ambiente do servidor. Sem elas, ele lança antes
// de olhar o token — e como este middleware guarda TODA função do painel, o
// resultado era o painel abrir e nenhuma aba funcionar.
//
// Os dois valores são públicos e agora vêm de `supabase/config`, com valor
// embutido. O que autentica de fato continua sendo o token do usuário: o cliente
// é criado com a chave publicável e o `Authorization` do chamador, então a RLS
// enxerga exatamente o usuário logado — nunca mais que isso.

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "@/integrations/supabase/config";

/** Chave nova do Supabase é opaca: vai em `apikey`, não em `Authorization`. */
function fetchDoSupabase(chave: string, token: string): typeof fetch {
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

    // O bearer aqui é o do usuário, não o da chave: é ele que a RLS lê.
    headers.set("Authorization", `Bearer ${token}`);
    if (opaca) headers.set("apikey", chave);
    return fetch(input, { ...init, headers });
  };
}

export const requireSupabaseAuth = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const request = getRequest();
  if (!request?.headers) {
    throw new Error("Unauthorized: No request headers available");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Unauthorized: No authorization header provided");
  }
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Only Bearer tokens are supported");
  }

  const token = authHeader.slice("Bearer ".length);
  if (!token) {
    throw new Error("Unauthorized: No token provided");
  }
  if (token.split(".").length !== 3) {
    throw new Error("Unauthorized: Invalid token");
  }

  const supabase = createClient<Database>(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        fetch: fetchDoSupabase(SUPABASE_PUBLISHABLE_KEY, token),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Error("Unauthorized: Invalid token");
  }
  if (!data.claims.sub) {
    throw new Error("Unauthorized: No user ID found in token");
  }

  return next({
    context: { supabase, userId: data.claims.sub, claims: data.claims },
  });
});
