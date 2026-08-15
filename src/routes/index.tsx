import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Layout, SeloOficial } from "@/components/lm/Layout";
import {
  sessaoAtiva,
  solicitarCodigo,
  validarCodigo,
} from "@/lib/sorteio.functions";
import { formatarDocumento } from "@/lib/sessao";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sorteio LM — números grátis para clientes L&M Telecom" },
      {
        name: "description",
        content:
          "Entre com seu CPF/CNPJ e escolha seus números do Sorteio LM. Você ganha números por ser bom cliente: participar não custa nada.",
      },
      { property: "og:title", content: "Sorteio LM — L&M Telecom" },
      {
        property: "og:description",
        content:
          "Ganhe números por comportamento e escolha os seus na cartela. Sem compra.",
      },
    ],
  }),
  component: Entrada,
});

function Entrada() {
  const navigate = useNavigate();
  const pedirCodigo = useServerFn(solicitarCodigo);
  const conferir = useServerFn(validarCodigo);
  const checarSessao = useServerFn(sessaoAtiva);

  const [documento, setDocumento] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"documento" | "codigo">("documento");
  const [aviso, setAviso] = useState<string | null>(null);
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const { data: sessao } = useQuery({
    queryKey: ["sessao"],
    queryFn: () => checarSessao({}),
  });

  useEffect(() => {
    if (sessao?.ativa) navigate({ to: "/saldo" });
  }, [sessao, navigate]);

  async function enviarDocumento(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const r = await pedirCodigo({
      data: { documento: documento.replace(/\D/g, "") },
    });
    setCarregando(false);
    if (!r.ok) return setErro(r.erro);
    setAviso(r.aviso);
    setCodigoDemo("codigoDemo" in r ? (r.codigoDemo ?? null) : null);
    setEtapa("codigo");
  }

  async function enviarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const r = await conferir({
      data: { documento: documento.replace(/\D/g, ""), codigo },
    });
    setCarregando(false);
    if (!r.ok) return setErro(r.erro);
    navigate({ to: "/saldo" });
  }

  return (
    <Layout comNav={false}>
      <div className="space-y-5">
        <SeloOficial />

        <div>
          <h1 className="text-3xl leading-none">Sorteio LM</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O sorteio de quem é cliente. Você{" "}
            <strong className="text-foreground">ganha</strong> números por
            assinar, reativar, quitar e pagar em dia — e escolhe quais quer.
            Nunca se compra número.
          </p>
        </div>

        {etapa === "documento" ? (
          <form
            onSubmit={enviarDocumento}
            className="space-y-3 border border-border bg-card p-4"
          >
            <label
              htmlFor="documento"
              className="titulo block text-[11px] tracking-widest text-muted-foreground"
            >
              CPF ou CNPJ do contrato
            </label>
            <input
              id="documento"
              inputMode="numeric"
              autoComplete="off"
              value={documento}
              onChange={(e) => setDocumento(formatarDocumento(e.target.value))}
              placeholder="000.000.000-00"
              className="num w-full border border-border bg-background px-3 py-3 text-lg outline-none focus:border-primary focus-visible:border-primary"
            />
            <button
              disabled={carregando || documento.replace(/\D/g, "").length < 11}
              className="titulo w-full border border-primary bg-primary px-4 py-3 text-sm tracking-widest text-primary-foreground disabled:opacity-40"
            >
              {carregando ? "Enviando…" : "Receber código no WhatsApp"}
            </button>
            <p className="text-[11px] text-muted-foreground">
              Sem senha e sem cadastro. Só entra quem já é cliente da L&M
              Telecom.
            </p>
          </form>
        ) : (
          <form
            onSubmit={enviarCodigo}
            className="space-y-3 border border-border bg-card p-4"
          >
            <p className="text-sm text-muted-foreground">{aviso}</p>
            <label
              htmlFor="codigo"
              className="titulo block text-[11px] tracking-widest text-muted-foreground"
            >
              Código de 6 dígitos
            </label>
            <input
              id="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              placeholder="______"
              className="num w-full border border-border bg-background px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-primary focus-visible:border-primary"
            />
            <button
              disabled={carregando || codigo.length !== 6}
              className="titulo w-full border border-primary bg-primary px-4 py-3 text-sm tracking-widest text-primary-foreground disabled:opacity-40"
            >
              {carregando ? "Conferindo…" : "Entrar"}
            </button>
            {codigoDemo && (
              <>
                <div className="serrilha" />
                <p className="text-[11px] text-muted-foreground">
                  Ambiente de demonstração: o envio por WhatsApp está desligado.
                  Seu código é{" "}
                  <span className="num text-primary">{codigoDemo}</span>.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setEtapa("documento");
                setCodigo("");
                setCodigoDemo(null);
                setErro(null);
              }}
              className="titulo text-[11px] tracking-widest text-primary underline"
            >
              Trocar CPF/CNPJ
            </button>
          </form>
        )}

        {erro && (
          <p className="border border-destaque bg-destaque/10 px-3 py-2 text-[12px] text-destaque">
            {erro}
          </p>
        )}

        <ComoSeGanha />
      </div>
    </Layout>
  );
}

// Os pesos vêm da tabela `regras` — trazê-los para cá é trabalho da Onda 2.
// Até lá, estes números são os mesmos do regulamento em /ajustes e da migration
// inicial; antes a tela anunciava metade (05/04/03/02) do que o regulamento
// prometia (10/8/5/3).
function ComoSeGanha() {
  return (
    <div className="space-y-2 border border-border bg-card p-4">
      <h2 className="text-base">Como se ganha número</h2>
      <ul className="num space-y-1 text-[13px] text-muted-foreground">
        <li>10 — assinar plano novo</li>
        <li>08 — reativar contrato cancelado</li>
        <li>05 — quitar débito em atraso</li>
        <li>
          03 — pagar a mensalidade em dia (+1 a cada 6 meses seguidos, teto 6)
        </li>
      </ul>
    </div>
  );
}
