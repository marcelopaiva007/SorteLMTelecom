import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CriterioCongelado, Layout, SeloOficial } from "@/components/lm/Layout";
import { usePainel } from "@/hooks/usePainel";
import { autoexcluir } from "@/lib/sorteio.functions";
import { limparToken } from "@/lib/sessao";

export const Route = createFileRoute("/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes e regulamento — Sorteio LM" },
      {
        name: "description",
        content: "Avisos, regulamento da campanha e autoexclusão dos sorteios em um clique, sem afetar seu contrato com a L&M Telecom.",
      },
      { property: "og:title", content: "Ajustes e regulamento — Sorteio LM" },
      { property: "og:description", content: "Regulamento, avisos e autoexclusão do Sorteio LM." },
    ],
  }),
  component: Ajustes,
});

function Ajustes() {
  const { data, token } = usePainel();
  const navigate = useNavigate();
  const excluir = useServerFn(autoexcluir);
  const [confirmando, setConfirmando] = useState(false);

  async function sair() {
    limparToken();
    navigate({ to: "/" });
  }

  async function pedirAutoexclusao() {
    if (!token) return;
    await excluir({ data: { token } });
    limparToken();
    navigate({ to: "/" });
  }

  const campanha = data && data.ok ? data.campanha : null;

  return (
    <Layout>
      <div className="space-y-4">
        <h1 className="text-2xl leading-none">Ajustes</h1>

        <SeloOficial />

        {campanha && (
          <CriterioCongelado
            criterio={campanha.criterio_apuracao}
            congeladoEm={campanha.criterio_congelado_em}
          />
        )}

        <div className="border border-border bg-card p-4">
          <h2 className="text-base">Regulamento resumido</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-muted-foreground">
            <li>Participar não custa nada. Não existe venda de número nem pacote extra.</li>
            <li>
              Números são concedidos por comportamento: assinatura (10), reativação (8), quitação de
              débito (5) e mensalidade em dia (3 por mês, +1 a cada 6 meses seguidos, teto 6).
            </li>
            <li>Cada número da cartela pertence a um único cliente.</li>
            <li>
              O prêmio é entregue em espécie do produto e{" "}
              <strong className="text-foreground">não é conversível em dinheiro</strong>.
            </li>
            <li>Não há divulgação pública de participantes; só o ganhador é anunciado.</li>
            <li>O critério de apuração é congelado antes da abertura e não muda.</li>
          </ul>
        </div>

        <div className="border border-border bg-card p-4">
          <h2 className="text-base">Avisos</h2>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Avisamos pelo WhatsApp cadastrado no contrato quando você ganha novos números e quando a
            campanha é apurada. Nada de mensagens de urgência.
          </p>
        </div>

        <div className="border border-destaque bg-card p-4">
          <h2 className="text-base text-destaque">Autoexclusão</h2>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Você pode sair dos sorteios em um clique. Você{" "}
            <strong className="text-foreground">continua cliente da LM normalmente</strong>: seu
            plano, sua internet e seu atendimento não mudam em nada.
          </p>
          {!confirmando ? (
            <button
              onClick={() => setConfirmando(true)}
              className="titulo mt-3 w-full border border-destaque px-4 py-3 text-[12px] tracking-widest text-destaque"
            >
              Quero me autoexcluir dos sorteios
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-[12px]">Confirma a autoexclusão?</p>
              <div className="flex gap-2">
                <button
                  onClick={pedirAutoexclusao}
                  className="titulo flex-1 border border-destaque bg-destaque px-3 py-3 text-[12px] tracking-widest text-destaque-foreground"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setConfirmando(false)}
                  className="titulo flex-1 border border-border px-3 py-3 text-[12px] tracking-widest text-muted-foreground"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={sair}
          className="titulo w-full border border-border px-4 py-3 text-[12px] tracking-widest text-muted-foreground"
        >
          Sair desta sessão
        </button>
      </div>
    </Layout>
  );
}
