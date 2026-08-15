import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AbaCampanhas } from "@/components/lm/admin/AbaCampanhas";
import { AbaPesos } from "@/components/lm/admin/AbaPesos";
import { AbaSincronizacao } from "@/components/lm/admin/AbaSincronizacao";
import { AbaAuditoria } from "@/components/lm/admin/AbaAuditoria";
import { AbaEfeito } from "@/components/lm/admin/AbaEfeito";
import { AbaAjustes } from "@/components/lm/admin/AbaAjustes";
import { botao } from "@/components/lm/admin/ui";
import { Marca } from "@/components/lm/Layout";

export const Route = createFileRoute("/painel")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel administrativo — Sorteio LM" },
      {
        name: "description",
        content:
          "Painel da L&M Telecom para gerir campanhas, pesos dos gatilhos, sincronização com o ERP, auditoria de créditos e efeito no negócio.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Painel administrativo — Sorteio LM" },
      {
        property: "og:description",
        content: "Gestão interna das campanhas do Sorteio LM.",
      },
    ],
  }),
  component: Painel,
});

const ABAS = [
  { id: "campanhas", label: "Campanhas" },
  { id: "pesos", label: "Pesos dos gatilhos" },
  { id: "sincronizacao", label: "Sincronização" },
  { id: "auditoria", label: "Auditoria" },
  { id: "efeito", label: "Efeito no negócio" },
  { id: "ajustes", label: "Ajustes" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

function Painel() {
  const [sessao, setSessao] = useState<{ email: string } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<AbaId>("campanhas");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session ? { email: data.session.user.email ?? "" } : null);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSessao(s ? { email: s.user.email ?? "" } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="titulo text-[13px] text-muted-foreground">Carregando…</span>
      </div>
    );
  }

  if (!sessao) return <Entrar />;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-4">
          <Marca />
          <span className="titulo border border-border px-2 py-0.5 text-[11px] tracking-widest text-muted-foreground">
            Painel administrativo
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="num text-[12px] text-muted-foreground">{sessao.email}</span>
          <Link to="/" className="text-[12px] text-muted-foreground underline underline-offset-2">
            ver telas do cliente
          </Link>
          <button
            className={botao.secundario}
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            Sair
          </button>
        </div>
      </header>

      <nav className="flex border-b border-border bg-card px-6">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={
              "titulo border-b-2 px-4 py-2 text-[12px] tracking-tight " +
              (aba === a.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground")
            }
          >
            {a.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {aba === "campanhas" && <AbaCampanhas />}
        {aba === "pesos" && <AbaPesos />}
        {aba === "sincronizacao" && <AbaSincronizacao />}
        {aba === "auditoria" && <AbaAuditoria />}
        {aba === "efeito" && <AbaEfeito />}
        {aba === "ajustes" && <AbaAjustes />}
      </main>

      <footer className="border-t border-border bg-card px-6 py-3">
        <p className="text-[11px] text-muted-foreground">
          Participar não custa nada. Prêmio não conversível em dinheiro.
        </p>
      </footer>
    </div>
  );
}

function Entrar() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setErro("E-mail ou senha incorretos.");
    setEnviando(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm border border-border bg-card p-6"
      >
        <Marca />
        <h1 className="titulo mt-4 text-[18px]">Painel administrativo</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Acesso restrito à equipe da L&M Telecom. O acesso do cliente é por CPF e código, em outra
          tela.
        </p>

        <div className="mt-5 grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              E-mail
            </span>
            <input
              type="email"
              autoComplete="username"
              className={botao.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              className={botao.input}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </label>
        </div>

        {erro && (
          <p className="mt-3 border border-destaque bg-destaque/10 p-2 text-[12px] text-destaque">
            {erro}
          </p>
        )}

        <button type="submit" disabled={enviando} className={botao.primario + " mt-4 w-full"}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
