import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminVisaoGeral } from "@/lib/admin.functions";
import {
  Aviso,
  Esqueleto,
  ErroAoCarregar,
  Etiqueta,
  Indicador,
  Painel,
  Vazio,
  texto,
} from "./ui";

const TOM_STATUS = {
  rascunho: "neutro",
  aberta: "ativo",
  encerrada: "alerta",
  apurada: "bom",
} as const;

function dataBR(iso: string) {
  return new Date(
    iso + (iso.length === 10 ? "T12:00:00" : ""),
  ).toLocaleDateString("pt-BR");
}

export function AbaVisaoGeral({ irPara }: { irPara: (aba: string) => void }) {
  const fn = useServerFn(adminVisaoGeral);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "visao-geral"],
    queryFn: () => fn({}),
  });

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Esqueleto linhas={3} />
        <Esqueleto linhas={4} />
      </div>
    );
  }
  if (error || !data) return <ErroAoCarregar />;

  if (!data.campanha) {
    return (
      <Painel titulo="Visão geral">
        <Vazio
          acao={
            <button
              className="titulo text-[12px] tracking-wide text-primary underline underline-offset-2"
              onClick={() => irPara("campanhas")}
            >
              Criar a primeira campanha
            </button>
          }
        >
          Nenhuma campanha aberta. Enquanto não houver uma, os clientes veem a
          tela de espera e nenhum evento do ERP vira crédito.
        </Vazio>
      </Painel>
    );
  }

  const c = data.campanha;
  const preenchida = data.cartela ? (data.escolhidos / data.cartela) * 100 : 0;
  const hoje = new Date().toISOString().slice(0, 10);
  const diasParaApuracao = Math.ceil(
    (new Date(c.data_apuracao + "T12:00:00").getTime() -
      new Date(hoje + "T12:00:00").getTime()) /
      86400000,
  );

  return (
    <div className="grid gap-4">
      {/* Contexto antes de número: qual campanha estes indicadores descrevem. */}
      <Painel
        titulo={c.nome}
        descricao={`${c.premio} · ${dataBR(c.inicio)} a ${dataBR(c.fim)}`}
        acao={
          <Etiqueta
            tom={TOM_STATUS[c.status as keyof typeof TOM_STATUS] ?? "neutro"}
          >
            {c.status}
          </Etiqueta>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Indicador
            rotulo="Cartela preenchida"
            valor={`${preenchida.toFixed(1)}%`}
            nota={`${data.escolhidos.toLocaleString("pt-BR")} de ${data.cartela.toLocaleString("pt-BR")} números`}
          />
          <Indicador
            rotulo="Participantes"
            valor={data.participantes.toLocaleString("pt-BR")}
            nota="clientes com pelo menos um crédito"
          />
          <Indicador
            rotulo={c.status === "apurada" ? "Número sorteado" : "Apuração"}
            valor={
              c.status === "apurada" && c.numero_sorteado !== null
                ? String(c.numero_sorteado).padStart(c.digitos_cartela, "0")
                : `${diasParaApuracao}d`
            }
            nota={
              c.status === "apurada"
                ? "resultado publicado para o cliente"
                : `em ${dataBR(c.data_apuracao)}`
            }
            alerta={c.status !== "apurada" && diasParaApuracao < 0}
          />
        </div>

        {c.status !== "apurada" && diasParaApuracao < 0 && (
          <Aviso tom="perigo">
            <span className="titulo text-[12px] tracking-widest">
              Apuração atrasada
            </span>
            <br />A data de apuração já passou e a campanha continua sem
            resultado. Enquanto isso, o cliente vê a tela de “ainda não
            apurada”.
          </Aviso>
        )}
      </Painel>

      <Painel titulo="Saúde da operação">
        <div className="grid gap-3 md:grid-cols-4">
          <Indicador
            rotulo="Números na espera"
            valor={data.naEspera.toLocaleString("pt-BR")}
            nota="concedidos e ainda não escolhidos"
            alerta={
              data.numerosConcedidos > 0 &&
              data.naEspera / data.numerosConcedidos > 0.5
            }
          />
          <Indicador
            rotulo="Clientes espelhados"
            valor={data.clientes.toLocaleString("pt-BR")}
            nota="somente leitura do ERP"
          />
          <Indicador
            rotulo="Eventos barrados"
            valor={data.bloqueados.toLocaleString("pt-BR")}
            nota="pelas travas das regras"
          />
          <Indicador
            rotulo="Última leitura do ERP"
            valor={
              data.ultimaLeitura
                ? new Date(data.ultimaLeitura).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"
            }
            nota={
              data.ultimaLeitura
                ? new Date(data.ultimaLeitura).toLocaleDateString("pt-BR")
                : "o conector ainda não chamou"
            }
            alerta={data.falhasSeguidas >= 3 || !data.ultimaLeitura}
          />
        </div>

        {data.numerosConcedidos > 0 &&
          data.naEspera / data.numerosConcedidos > 0.5 && (
            <Aviso tom="alerta">
              Mais da metade dos números concedidos não foi escolhida. Isso
              costuma ser problema de comunicação, não de sistema: o cliente
              ganhou e não soube.
            </Aviso>
          )}

        {data.falhasSeguidas >= 3 && (
          <Aviso tom="perigo">
            <span className="titulo text-[12px] tracking-widest">
              {data.falhasSeguidas} falhas seguidas na leitura do ERP
            </span>
            <br />
            Nenhum evento novo está entrando. Enquanto isso, cliente que paga em
            dia não recebe número.
          </Aviso>
        )}
      </Painel>

      <p className={texto.legenda}>
        Os detalhes de cada número estão nas abas de acompanhamento: quem
        recebeu crédito em{" "}
        <BotaoTexto onClick={() => irPara("auditoria")}>Auditoria</BotaoTexto>,
        o caso de um cliente específico em{" "}
        <BotaoTexto onClick={() => irPara("clientes")}>Clientes</BotaoTexto>, e
        o histórico de leituras em{" "}
        <BotaoTexto onClick={() => irPara("sincronizacao")}>
          Sincronização
        </BotaoTexto>
        .
      </p>
    </div>
  );
}

function BotaoTexto({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="text-primary underline underline-offset-2"
    >
      {children}
    </button>
  );
}
