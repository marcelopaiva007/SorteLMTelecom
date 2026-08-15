import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

function useEmpresa() {
  const { data } = useQuery({
    queryKey: ["configuracoes-publicas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes").select("chave, valor");
      return Object.fromEntries((data ?? []).map((c) => [c.chave, c.valor])) as Record<
        string,
        string
      >;
    },
  });
  return {
    cnpj: data?.["cnpj"] ?? "",
    razaoSocial: data?.["razao_social"] ?? "L&M Telecom",
    endereco: data?.["endereco"] ?? "",
    telefone: data?.["telefone"] ?? "",
    sac: data?.["sac"] ?? "",
    email: data?.["email"] ?? "",
    site: data?.["site"] ?? "",
    atendimento: data?.["atendimento"] ?? "",
    slogan: data?.["slogan"] ?? "",
  };
}

export function Marca({ altura = "h-8" }: { altura?: string }) {
  return (
    <>
      <img
        src="/marca/logo-claro.png"
        alt="L&M Telecom"
        className={`marca-clara w-auto ${altura}`}
      />
      <img
        src="/marca/logo-escuro.png"
        alt="L&M Telecom"
        className={`marca-escura w-auto ${altura}`}
      />
    </>
  );
}

export function SeloOficial() {
  const { cnpj, razaoSocial, endereco, telefone, sac, email, site, atendimento } = useEmpresa();
  return (
    <div className="border border-primary/40 bg-primary/5 px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-[3px] block h-2 w-2 shrink-0 bg-primary" />
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="titulo text-[11px] tracking-wide text-foreground">
            Campanha oficial L&amp;M Telecom
          </span>
          <br />
          {razaoSocial}
          {cnpj && (
            <>
              {" "}
              — CNPJ <span className="num">{cnpj}</span>
            </>
          )}
          {endereco && (
            <>
              <br />
              {endereco}
            </>
          )}
          {(telefone || sac) && (
            <>
              <br />
              <span className="num">{telefone}</span>
              {sac && (
                <>
                  {" · SAC "}
                  <span className="num">{sac}</span>
                </>
              )}
            </>
          )}
          {(email || site) && (
            <>
              <br />
              {email}
              {site && ` · ${site}`}
            </>
          )}
          {atendimento && (
            <>
              <br />
              {atendimento}
            </>
          )}
        </p>
      </div>
    </div>
  );
}


export function CriterioCongelado({
  criterio,
  congeladoEm,
}: {
  criterio: string;
  congeladoEm: string;
}) {
  return (
    <div className="border border-border bg-card p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="titulo border border-primary px-1.5 py-0.5 text-[10px] tracking-widest text-primary">
          Critério congelado
        </span>
        <span className="text-[10px] text-muted-foreground">
          desde{" "}
          <span className="num">
            {new Date(congeladoEm).toLocaleDateString("pt-BR")}
          </span>
        </span>
      </div>
      <p className="text-[12px] leading-snug text-muted-foreground">{criterio}</p>
    </div>
  );
}

export function Progresso({ valor }: { valor: number }) {
  return (
    <div className="h-2 w-full border border-border bg-muted">
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${Math.min(100, Math.max(0, valor))}%` }}
      />
    </div>
  );
}

function Rodape() {
  const { slogan, telefone, sac } = useEmpresa();
  return (
    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
      {slogan && (
        <>
          <span className="titulo tracking-wide text-foreground">{slogan}</span>
          <br />
        </>
      )}
      {telefone && <span className="num">{telefone}</span>}
      {sac && (
        <>
          {" · SAC "}
          <span className="num">{sac}</span>
        </>
      )}
    </p>
  );
}

const ABAS = [

  { to: "/saldo", label: "Saldo" },
  { to: "/cartela", label: "Cartela" },
  { to: "/meus-numeros", label: "Meus nºs" },
  { to: "/resultado", label: "Resultado" },
  { to: "/ajustes", label: "Ajustes" },
] as const;

export function Layout({ children, comNav = true }: { children: ReactNode; comNav?: boolean }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col border-x border-border bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card px-4 py-3">
        <Marca />
      </header>

      {comNav && (
        <nav className="sticky top-[57px] z-10 grid grid-cols-5 border-b border-border bg-background">
          {ABAS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="titulo border-r border-border px-1 py-2 text-center text-[11px] tracking-tight text-muted-foreground last:border-r-0 data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
            >
              {a.label}
            </Link>
          ))}
        </nav>
      )}

      <main className="flex-1 px-4 py-4">{children}</main>

      <footer className="mt-6 border-t border-border bg-card px-4 py-3">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Participar não custa nada. Prêmio não conversível em dinheiro.
        </p>
        <Rodape />
      </footer>

    </div>
  );
}
