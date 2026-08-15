// A matemática dos pesos, em um lugar só.
//
// Estas funções espelham public.conceder_creditos. Enquanto a escada estava
// escrita à mão em três arquivos, a tela de entrada anunciava 05/04/03/02, o
// regulamento prometia 10/8/5/3 e o banco pagava um terceiro valor. Qualquer
// mudança aqui tem que andar junto com a função no banco.

export type Regra = {
  tipo_evento: string;
  quantidade: number;
  carencia_dias: number;
  limite_meses: number | null;
  bonus_a_cada_meses: number;
  bonus_quantidade: number;
  teto_quantidade: number | null;
};

export const ROTULO_REGRA: Record<string, string> = {
  assinatura: "Assinar plano novo",
  reativacao: "Reativar contrato cancelado",
  quitacao_debito: "Quitar débito em atraso",
  mensalidade_em_dia: "Pagar a mensalidade em dia",
};

/** Quantos números o gatilho paga na enésima vez (1 = primeira). */
export function numerosNaOrdem(regra: Regra, ordem: number): number {
  const posicao = Math.max(ordem, 1);
  const passos =
    regra.bonus_a_cada_meses > 0
      ? Math.floor((posicao - 1) / regra.bonus_a_cada_meses)
      : 0;
  const quantidade = regra.quantidade + passos * regra.bonus_quantidade;
  return regra.teto_quantidade !== null
    ? Math.min(quantidade, regra.teto_quantidade)
    : quantidade;
}

/** Total acumulado por quem aciona o gatilho todo mês, durante N meses. */
export function acumuladoEmMeses(regra: Regra | undefined, meses = 12): number {
  if (!regra) return 0;
  let total = 0;
  for (let m = 1; m <= meses; m++) total += numerosNaOrdem(regra, m);
  return total;
}

/** Quantos meses seguidos ainda faltam para subir um degrau. */
export function mesesParaProximoBonus(
  regra: Regra | undefined,
  mesesEmDia: number,
): number | null {
  if (!regra || regra.bonus_a_cada_meses <= 0) return null;
  const restante = Math.max(mesesEmDia, 0) % regra.bonus_a_cada_meses;
  return regra.bonus_a_cada_meses - restante;
}

/** Frase pronta para a tela: "10 — assinar plano novo". */
export function descreverRegra(regra: Regra): string {
  const base = `${String(regra.quantidade).padStart(2, "0")} — ${
    ROTULO_REGRA[regra.tipo_evento] ?? regra.tipo_evento
  }`;
  if (regra.bonus_a_cada_meses > 0 && regra.bonus_quantidade > 0) {
    const teto =
      regra.teto_quantidade !== null ? `, teto ${regra.teto_quantidade}` : "";
    return `${base} (+${regra.bonus_quantidade} a cada ${regra.bonus_a_cada_meses} meses seguidos${teto})`;
  }
  return base;
}
