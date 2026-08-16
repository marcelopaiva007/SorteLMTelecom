// Anexa o token do administrador logado a cada chamada de função de servidor.
//
// Roda no navegador, como middleware global de TODA função de servidor — está
// registrado em `src/start.ts`. É por isso que ele é crítico: se lançar, nenhuma
// chamada sai do navegador, e o sistema inteiro morre sem deixar uma única linha
// no log do servidor. Era exatamente o que acontecia, porque a versão gerada
// importa o cliente que exige `VITE_*` em tempo de build.
//
// Sessão ausente não é erro: o visitante da área do cliente não tem login do
// Supabase, e as funções públicas não pedem token.

import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/lib/supabase.browser";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;

    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch (erro) {
      // Nada aqui pode derrubar a chamada: sem token, a função de servidor
      // decide sozinha se precisa de autenticação.
      console.error("[auth] não foi possível ler a sessão", erro);
    }

    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
