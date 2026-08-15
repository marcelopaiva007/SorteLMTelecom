import { describe, expect, it } from "vitest";
import {
  acumuladoEmMeses,
  descreverRegra,
  mesesParaProximoBonus,
  numerosNaOrdem,
  type Regra,
} from "./regras";

// Estes testes travam a escada do bom pagador, que decide quantos números cada
// cliente ganha. A mesma conta existe em public.conceder_creditos — se um lado
// mudar sem o outro, a tela passa a prometer um número e o banco a pagar outro,
// que foi exatamente o defeito que originou este módulo.

const mensalidade: Regra = {
  tipo_evento: "mensalidade_em_dia",
  quantidade: 3,
  carencia_dias: 0,
  limite_meses: 6,
  bonus_a_cada_meses: 6,
  bonus_quantidade: 1,
  teto_quantidade: 6,
};

const assinatura: Regra = {
  tipo_evento: "assinatura",
  quantidade: 10,
  carencia_dias: 0,
  limite_meses: null,
  bonus_a_cada_meses: 0,
  bonus_quantidade: 0,
  teto_quantidade: null,
};

describe("numerosNaOrdem", () => {
  it("paga a quantidade base na primeira vez", () => {
    expect(numerosNaOrdem(mensalidade, 1)).toBe(3);
  });

  it("mantém o valor até fechar o ciclo de bônus", () => {
    for (const mes of [1, 2, 3, 4, 5, 6]) {
      expect(numerosNaOrdem(mensalidade, mes)).toBe(3);
    }
  });

  it("sobe um degrau ao entrar no sétimo mês", () => {
    expect(numerosNaOrdem(mensalidade, 7)).toBe(4);
    expect(numerosNaOrdem(mensalidade, 13)).toBe(5);
  });

  it("para de subir no teto", () => {
    expect(numerosNaOrdem(mensalidade, 19)).toBe(6);
    expect(numerosNaOrdem(mensalidade, 240)).toBe(6);
  });

  it("trata ordem zero ou negativa como a primeira vez", () => {
    expect(numerosNaOrdem(mensalidade, 0)).toBe(3);
    expect(numerosNaOrdem(mensalidade, -5)).toBe(3);
  });

  it("ignora a escada quando a regra não tem bônus", () => {
    expect(numerosNaOrdem(assinatura, 1)).toBe(10);
    expect(numerosNaOrdem(assinatura, 99)).toBe(10);
  });
});

describe("acumuladoEmMeses", () => {
  it("soma os doze primeiros meses do bom pagador", () => {
    // 6 meses a 3 números, mais 6 meses a 4.
    expect(acumuladoEmMeses(mensalidade, 12)).toBe(6 * 3 + 6 * 4);
  });

  it("devolve zero quando não há regra", () => {
    expect(acumuladoEmMeses(undefined, 12)).toBe(0);
  });

  it("mantém o fiel de 12 meses à frente de quem acabou de assinar", () => {
    // É o alarme de "pesos invertidos" do painel: se esta relação virar, o
    // sistema passa a ensinar a base a cancelar e voltar.
    expect(acumuladoEmMeses(mensalidade, 12)).toBeGreaterThan(
      assinatura.quantidade,
    );
  });
});

describe("mesesParaProximoBonus", () => {
  it("conta quantos meses faltam para o próximo degrau", () => {
    expect(mesesParaProximoBonus(mensalidade, 0)).toBe(6);
    expect(mesesParaProximoBonus(mensalidade, 1)).toBe(5);
    expect(mesesParaProximoBonus(mensalidade, 5)).toBe(1);
  });

  it("reinicia a contagem ao fechar um ciclo", () => {
    expect(mesesParaProximoBonus(mensalidade, 6)).toBe(6);
    expect(mesesParaProximoBonus(mensalidade, 12)).toBe(6);
  });

  it("não promete degrau quando a regra não tem escada", () => {
    expect(mesesParaProximoBonus(assinatura, 10)).toBeNull();
    expect(mesesParaProximoBonus(undefined, 10)).toBeNull();
  });
});

describe("descreverRegra", () => {
  it("descreve a escada por extenso", () => {
    expect(descreverRegra(mensalidade)).toBe(
      "03 — Pagar a mensalidade em dia (+1 a cada 6 meses seguidos, teto 6)",
    );
  });

  it("descreve gatilho sem escada só com a quantidade", () => {
    expect(descreverRegra(assinatura)).toBe("10 — Assinar plano novo");
  });
});
