// Regras puras do controle de apostas do pleito.
// Vive fora do servidor de propósito: a tela do painel usa as mesmas funções
// para prever o que será gravado antes de mandar a aposta.

export type CanalAposta = "balcao" | "whatsapp" | "app" | "importacao";
export type StatusAposta = "registrada" | "confirmada" | "cancelada";

export const CANAIS: { id: CanalAposta; rotulo: string }[] = [
  { id: "balcao", rotulo: "Balcão" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "app", rotulo: "App do cliente" },
  { id: "importacao", rotulo: "Importação" },
];

export const ROTULO_CANAL: Record<CanalAposta, string> = {
  balcao: "Balcão",
  whatsapp: "WhatsApp",
  app: "App do cliente",
  importacao: "Importação",
};

export const ROTULO_STATUS: Record<StatusAposta, string> = {
  registrada: "Registrada",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

/** Teto por aposta: protege o balcão de colar uma lista gigante por engano. */
export const MAX_NUMEROS_POR_APOSTA = 500;

/** Maior intervalo aceito num token do tipo "100-140". */
const MAX_INTERVALO = 200;

export type LeituraNumeros = {
  numeros: number[];
  invalidos: string[];
  repetidos: number[];
  foraDaCartela: number[];
};

/**
 * Lê números soltos do jeito que o operador digita: "7, 12 99", uma lista
 * colada com quebras de linha, ou intervalos ("100-110"). Devolve o que deu
 * para aproveitar e, separadamente, o que precisa ser mostrado como problema.
 */
export function interpretarNumeros(
  texto: string,
  digitos: number,
): LeituraNumeros {
  const teto = Math.pow(10, digitos) - 1;
  const numeros: number[] = [];
  const vistos = new Set<number>();
  const repetidos = new Set<number>();
  const foraDaCartela = new Set<number>();
  const invalidos: string[] = [];

  const guardar = (n: number) => {
    if (n > teto) {
      foraDaCartela.add(n);
      return;
    }
    if (vistos.has(n)) {
      repetidos.add(n);
      return;
    }
    vistos.add(n);
    numeros.push(n);
  };

  for (const bruto of texto.split(/[^0-9-]+/)) {
    const token = bruto.trim();
    if (!token) continue;

    const intervalo = /^(\d+)-(\d+)$/.exec(token);
    if (intervalo) {
      const de = Number(intervalo[1]);
      const ate = Number(intervalo[2]);
      if (de > ate || ate - de + 1 > MAX_INTERVALO) {
        invalidos.push(token);
        continue;
      }
      for (let n = de; n <= ate; n++) guardar(n);
      continue;
    }

    if (/^\d+$/.test(token)) {
      guardar(Number(token));
      continue;
    }

    invalidos.push(token);
  }

  return {
    numeros: numeros.sort((a, b) => a - b),
    invalidos,
    repetidos: Array.from(repetidos).sort((a, b) => a - b),
    foraDaCartela: Array.from(foraDaCartela).sort((a, b) => a - b),
  };
}

/** Números livres do pleito, em ordem aleatória — o "sorte da casa" do balcão. */
export function sortearLivres(
  quantidade: number,
  digitos: number,
  ocupados: Set<number>,
): number[] {
  const teto = Math.pow(10, digitos);
  const escolhidos: number[] = [];
  const usados = new Set(ocupados);
  // Com a cartela quase cheia o sorteio às cegas patina; a partir daí vale
  // varrer os livres de uma vez.
  const livres = teto - usados.size;
  if (livres <= 0) return [];

  if (quantidade > livres / 4) {
    const candidatos: number[] = [];
    for (let n = 0; n < teto; n++) if (!usados.has(n)) candidatos.push(n);
    while (escolhidos.length < quantidade && candidatos.length) {
      const i = Math.floor(Math.random() * candidatos.length);
      escolhidos.push(candidatos.splice(i, 1)[0]!);
    }
    return escolhidos.sort((a, b) => a - b);
  }

  while (escolhidos.length < quantidade) {
    const n = Math.floor(Math.random() * teto);
    if (usados.has(n)) continue;
    usados.add(n);
    escolhidos.push(n);
  }
  return escolhidos.sort((a, b) => a - b);
}

/** Lê "1.234,56" e "1234.56" com o mesmo resultado. */
export function lerValor(texto: string): number {
  const limpo = texto.trim();
  if (!limpo) return 0;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor >= 0 ? valor : 0;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "0007, 0012, 0099 +4" — cabe numa célula de tabela. */
export function resumirNumeros(
  numeros: number[],
  digitos: number,
  limite = 6,
): string {
  if (!numeros.length) return "—";
  const mostrados = numeros
    .slice(0, limite)
    .map((n) => String(n).padStart(digitos, "0"))
    .join(", ");
  const resto = numeros.length - limite;
  return resto > 0 ? `${mostrados} +${resto}` : mostrados;
}
