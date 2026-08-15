// Envio do código de acesso por WhatsApp.
//
// O provedor ainda não foi escolhido (Meta Cloud API, Zenvia, Twilio…). Este
// módulo é a costura: quando a decisão sair, basta implementar um transporte
// novo e apontar WHATSAPP_PROVEDOR para ele. Nada acima daqui muda.

export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

/**
 * Modo demonstração: devolve o código de acesso na resposta da tela em vez de
 * mandar por WhatsApp.
 *
 * Existe porque, enquanto não há provedor contratado, ninguém consegue entrar
 * no ambiente de homologação. É perigoso por natureza — quem vê o código entra
 * na conta — então precisa de duas chaves para ligar e nunca liga em produção.
 */
export function modoDemo(): boolean {
  return (
    process.env["SORTEIO_MODO_DEMO"] === "1" &&
    process.env["NODE_ENV"] !== "production"
  );
}

type Transporte = (whatsapp: string, texto: string) => Promise<ResultadoEnvio>;

const transportes: Record<string, Transporte> = {
  // Sem provedor: registra que houve emissão, sem gravar o código no log.
  // Log de servidor é lido por muita gente; código de acesso é segredo.
  registro: async (whatsapp) => {
    console.info(
      `[whatsapp] código emitido para ${mascarar(whatsapp)} (sem provedor configurado)`,
    );
    return { ok: true };
  },
};

function mascarar(whatsapp: string) {
  const d = (whatsapp || "").replace(/\D/g, "");
  return d.length < 4 ? "•••••" : `•••••${d.slice(-4)}`;
}

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

  const texto =
    `Olá, ${primeiroNome}. Seu código de acesso ao Sorteio LM é ${codigo}. ` +
    `Ele vale por 10 minutos. A L&M Telecom nunca pede este código por telefone.`;

  return transporte(whatsapp, texto);
}
