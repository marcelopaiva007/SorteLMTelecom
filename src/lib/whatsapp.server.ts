// Envio do código de acesso por WhatsApp.
//
// Dois transportes:
//   `meta`     — WhatsApp Cloud API, direto ou através do parceiro que detém o
//                contrato com a Meta. É o de produção.
//   `registro` — sem provedor: só anota no log que houve emissão. É o padrão,
//                para que o sistema não quebre antes das credenciais chegarem.
//
// Escolha por WHATSAPP_PROVEDOR; as variáveis estão listadas em .env.example.
//
// O transporte `meta` foi escrito contra o formato padrão da Cloud API e ainda
// não foi exercitado contra a conta real. Quando os endpoints do parceiro
// chegarem, é aqui que se ajusta — o resto do sistema não muda.

export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

/**
 * Modo demonstração: devolve o código de acesso na resposta da tela em vez de
 * mandar por WhatsApp.
 *
 * Existe porque, enquanto não há provedor configurado, ninguém consegue entrar
 * no ambiente de homologação. É perigoso por natureza — quem vê o código entra
 * na conta — então precisa de duas chaves para ligar e nunca liga em produção.
 */
export function modoDemo(): boolean {
  return (
    process.env["SORTEIO_MODO_DEMO"] === "1" &&
    process.env["NODE_ENV"] !== "production"
  );
}

type Envio = {
  whatsapp: string;
  codigo: string;
  primeiroNome: string;
};

type Transporte = (envio: Envio) => Promise<ResultadoEnvio>;

// O número precisa ir em E.164 sem o "+". A base guarda com o 55 na frente,
// mas nem sempre — então normalizamos aqui em vez de confiar no cadastro.
function normalizarNumero(whatsapp: string): string {
  const digitos = whatsapp.replace(/\D/g, "");
  if (digitos.startsWith("55")) return digitos;
  return `55${digitos}`;
}

function mascarar(whatsapp: string) {
  const d = (whatsapp || "").replace(/\D/g, "");
  return d.length < 4 ? "•••••" : `•••••${d.slice(-4)}`;
}

const transportes: Record<string, Transporte> = {
  // Sem provedor: registra que houve emissão, sem gravar o código no log.
  // Log de servidor é lido por muita gente; código de acesso é segredo.
  registro: async ({ whatsapp }) => {
    console.info(
      `[whatsapp] código emitido para ${mascarar(whatsapp)} (sem provedor configurado)`,
    );
    return { ok: true };
  },

  // WhatsApp Cloud API.
  //
  // O código vai duas vezes no mesmo envio: uma no corpo da mensagem e outra
  // no botão de copiar. É assim que o template de autenticação da Meta
  // funciona — o botão não herda o valor do corpo.
  //
  // Se o template aprovado não tiver botão OTP, ponha WHATSAPP_TEMPLATE_BOTAO=0
  // e o componente do botão não é enviado. Mandar componente que o template não
  // tem faz a Meta recusar a mensagem.
  meta: async ({ whatsapp, codigo }) => {
    const token = process.env["WHATSAPP_TOKEN"];
    const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    const template = process.env["WHATSAPP_TEMPLATE"];

    if (!token || !phoneNumberId || !template) {
      const faltando = [
        ...(!token ? ["WHATSAPP_TOKEN"] : []),
        ...(!phoneNumberId ? ["WHATSAPP_PHONE_NUMBER_ID"] : []),
        ...(!template ? ["WHATSAPP_TEMPLATE"] : []),
      ].join(", ");
      return { ok: false, erro: `Faltam variáveis de ambiente: ${faltando}.` };
    }

    const versao = process.env["WHATSAPP_API_VERSAO"] ?? "v21.0";
    const idioma = process.env["WHATSAPP_TEMPLATE_IDIOMA"] ?? "pt_BR";
    const comBotao = process.env["WHATSAPP_TEMPLATE_BOTAO"] !== "0";

    const componentes: unknown[] = [
      { type: "body", parameters: [{ type: "text", text: codigo }] },
    ];
    if (comBotao) {
      componentes.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: codigo }],
      });
    }

    try {
      const resposta = await fetch(
        `https://graph.facebook.com/${versao}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: normalizarNumero(whatsapp),
            type: "template",
            template: {
              name: template,
              language: { code: idioma },
              components: componentes,
            },
          }),
        },
      );

      if (!resposta.ok) {
        // O corpo do erro da Meta traz o motivo, e nele não vai o código.
        const corpo = await resposta.text();
        console.error(
          `[whatsapp] envio recusado para ${mascarar(whatsapp)}: ${resposta.status} ${corpo}`,
        );
        return { ok: false, erro: "O provedor recusou o envio da mensagem." };
      }

      return { ok: true };
    } catch (erro) {
      console.error(
        `[whatsapp] falha de rede para ${mascarar(whatsapp)}`,
        erro,
      );
      return { ok: false, erro: "Não foi possível falar com o provedor." };
    }
  },
};

export async function enviarCodigo(
  whatsapp: string | null,
  codigo: string,
  primeiroNome: string,
): Promise<ResultadoEnvio> {
  if (!whatsapp)
    return { ok: false, erro: "Cliente sem WhatsApp cadastrado no contrato." };

  const nome = process.env["WHATSAPP_PROVEDOR"] ?? "registro";
  const transporte = transportes[nome];
  if (!transporte)
    return { ok: false, erro: `Provedor de WhatsApp desconhecido: ${nome}.` };

  return transporte({ whatsapp, codigo, primeiroNome });
}
