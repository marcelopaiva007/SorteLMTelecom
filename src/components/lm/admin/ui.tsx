import type { ReactNode } from "react";

export const botao = {
  primario:
    "titulo border border-primary bg-primary px-4 py-2 text-[12px] tracking-wide text-primary-foreground disabled:opacity-50",
  secundario:
    "titulo border border-border bg-card px-4 py-2 text-[12px] tracking-wide text-foreground disabled:opacity-50",
  link: "titulo text-[11px] tracking-wide text-primary underline underline-offset-2",
  input:
    "w-full border border-border bg-card px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-primary",
};

export function Painel({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border border-border bg-card p-4">
      <h2 className="titulo mb-3 border-b border-border pb-2 text-[14px] tracking-tight">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function Aviso({
  tom = "neutro",
  children,
}: {
  tom?: "neutro" | "destaque";
  children: ReactNode;
}) {
  const cor =
    tom === "destaque"
      ? "border-destaque bg-destaque/10 text-destaque"
      : "border-border bg-muted text-muted-foreground";
  return <div className={`mt-3 border ${cor} p-3 text-[12px] leading-snug`}>{children}</div>;
}

export function Indicador({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`border p-3 ${alerta ? "border-destaque bg-destaque/10" : "border-border bg-card"}`}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={`num mt-1 text-2xl ${alerta ? "text-destaque" : "text-foreground"}`}>
        {valor}
      </div>
      {nota && <div className="mt-1 text-[11px] text-muted-foreground">{nota}</div>}
    </div>
  );
}
