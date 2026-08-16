import type { ReactNode } from "react";

/**
 * Peças do painel administrativo.
 *
 * A escala de texto é fixa e curta de propósito. O painel tinha 14 tamanhos
 * diferentes, com a maior parte espremida entre 11 e 13px — três degraus que o
 * olho não distingue, mas que multiplicam decisões e achatam a hierarquia.
 * Aqui são cinco, com salto de verdade:
 *
 *   rótulo    11px condensada maiúscula   nome de campo, cabeçalho de coluna
 *   legenda   12px                        nota, ajuda, texto secundário
 *   corpo     14px                        tabela, formulário, leitura
 *   destaque  16px                        título de painel, texto que pesa
 *   número    28px / 44px monoespaçada    indicador e display
 */
export const texto = {
  rotulo: "titulo text-[11px] uppercase tracking-[0.1em] text-muted-foreground",
  legenda: "text-[12px] text-muted-foreground",
  corpo: "text-[14px]",
  destaque: "text-[16px]",
};

// Altura de 38px nos controles. O painel é ferramenta de trabalho: densidade
// não pode custar precisão, e os campos estavam em 30px.
const controle = "px-3 py-2 text-[14px]";

export const botao = {
  primario: `titulo border border-primary bg-primary ${controle} tracking-wide text-primary-foreground disabled:opacity-50`,
  secundario: `titulo border border-border bg-card ${controle} tracking-wide text-foreground disabled:opacity-50`,
  // Para o que não tem volta. Azul é ação comum; isto não é.
  perigo: `titulo border border-destaque bg-destaque ${controle} tracking-wide text-destaque-foreground disabled:opacity-50`,
  link: "titulo text-[12px] tracking-wide text-primary underline underline-offset-2",
  input: `w-full border border-border bg-card ${controle} text-foreground outline-none focus:border-primary`,
};

export function Painel({
  titulo,
  descricao,
  acao,
  tom = "neutro",
  children,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  tom?: "neutro" | "perigo";
  children: ReactNode;
}) {
  const moldura =
    tom === "perigo" ? "border-destaque border-2" : "border-border border";
  return (
    <section className={`${moldura} bg-card`}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h2
          className={`titulo text-[16px] tracking-tight ${tom === "perigo" ? "text-destaque" : ""}`}
        >
          {titulo}
        </h2>
        {descricao && <p className={texto.legenda}>{descricao}</p>}
        {acao && <div className="ml-auto">{acao}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Campo({
  label,
  ajuda,
  children,
}: {
  label: string;
  ajuda?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={texto.rotulo}>{label}</span>
      {children}
      {ajuda && (
        <span className="text-[12px] text-muted-foreground">{ajuda}</span>
      )}
    </label>
  );
}

const TONS_AVISO = {
  neutro: "border-border bg-muted text-muted-foreground",
  alerta: "border-premio bg-premio/10 text-premio-texto",
  perigo: "border-destaque bg-destaque/10 text-destaque",
  bom: "border-border bg-primary/5 text-muted-foreground",
} as const;

export function Aviso({
  tom = "neutro",
  children,
}: {
  tom?: keyof typeof TONS_AVISO;
  children: ReactNode;
}) {
  return (
    <div
      className={`mt-3 border ${TONS_AVISO[tom]} p-3 text-[13px] leading-snug`}
    >
      {children}
    </div>
  );
}

const TONS_ETIQUETA = {
  neutro: "border-border bg-muted text-muted-foreground",
  ativo: "border-primary bg-primary/10 text-primary",
  alerta: "border-premio bg-premio/10 text-premio-texto",
  perigo: "border-destaque bg-destaque/10 text-destaque",
  bom: "border-border bg-primary/5 text-primary",
} as const;

/** Estado em forma, não só em palavra: status de campanha, motivo de bloqueio. */
export function Etiqueta({
  tom = "neutro",
  children,
}: {
  tom?: keyof typeof TONS_ETIQUETA;
  children: ReactNode;
}) {
  return (
    <span
      className={`titulo inline-block border px-1.5 py-0.5 text-[10px] tracking-[0.08em] ${TONS_ETIQUETA[tom]}`}
    >
      {children}
    </span>
  );
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
      <div className={texto.rotulo}>{rotulo}</div>
      <div
        className={`num mt-1 text-[28px] leading-none ${alerta ? "text-destaque" : "text-foreground"}`}
      >
        {valor}
      </div>
      {nota && (
        <div className="mt-1.5 text-[12px] text-muted-foreground">{nota}</div>
      )}
    </div>
  );
}

/** Número grande com a variação em evidência — para quando a conclusão é a variação. */
export function IndicadorVariacao({
  rotulo,
  variacao,
  valor,
  nota,
}: {
  rotulo: string;
  variacao: number | null;
  valor: string;
  nota?: string;
}) {
  const semBase = variacao === null;
  const subiu = !semBase && variacao > 0;
  const desceu = !semBase && variacao < 0;
  const cor = subiu
    ? "text-primary"
    : desceu
      ? "text-destaque"
      : "text-muted-foreground";
  const seta = subiu ? "▲" : desceu ? "▼" : "—";

  return (
    <div className="border border-border bg-card p-3">
      <div className={texto.rotulo}>{rotulo}</div>
      <div
        className={`num mt-1 flex items-baseline gap-2 text-[28px] leading-none ${cor}`}
      >
        <span aria-hidden="true" className="text-[16px]">
          {seta}
        </span>
        <span>
          {semBase ? "—" : `${variacao > 0 ? "+" : ""}${variacao.toFixed(0)}%`}
        </span>
      </div>
      <div className="mt-1.5 text-[12px] text-muted-foreground">
        <span className="num">{valor}</span>
        {nota && <> · {nota}</>}
      </div>
    </div>
  );
}

/** Linhas cinza no lugar de tabela vazia: carregando não é o mesmo que "não há nada". */
export function Esqueleto({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="grid gap-2" aria-hidden="true">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="h-8 animate-pulse bg-muted" />
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

/**
 * Estado vazio que explica e oferece saída.
 *
 * "Nenhum registro" não ajuda ninguém: o vazio precisa dizer por que está
 * vazio e qual é o próximo passo.
 */
export function Vazio({
  children,
  acao,
}: {
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-border p-6 text-center">
      <p className="text-[13px] text-muted-foreground">{children}</p>
      {acao && <div className="mt-3 flex justify-center">{acao}</div>}
    </div>
  );
}

/**
 * Confirmação para o que não tem volta.
 *
 * Além do botão vermelho, exige digitar o nome do alvo. É a prática de sistemas
 * que lidam com ação irreversível: o passo extra existe para quebrar o
 * automatismo de clicar em "confirmar", não para punir o operador.
 */
export function ConfirmacaoPerigosa({
  alvo,
  aviso,
  rotuloAcao,
  digitado,
  aoDigitar,
  aoConfirmar,
  aoCancelar,
  ocupado,
}: {
  alvo: string;
  aviso: ReactNode;
  rotuloAcao: string;
  digitado: string;
  aoDigitar: (v: string) => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  ocupado?: boolean;
}) {
  const confere = digitado.trim().toLowerCase() === alvo.trim().toLowerCase();
  return (
    <div className="border-2 border-destaque bg-destaque/10 p-4">
      <p className="text-[14px] leading-snug text-destaque">{aviso}</p>
      <div className="mt-3">
        <Campo label={`Para confirmar, digite: ${alvo}`}>
          <input
            className={botao.input}
            value={digitado}
            onChange={(e) => aoDigitar(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Campo>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={botao.perigo}
          disabled={!confere || ocupado}
          onClick={aoConfirmar}
        >
          {ocupado ? "Executando…" : rotuloAcao}
        </button>
        <button
          className={botao.secundario}
          onClick={aoCancelar}
          disabled={ocupado}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function ErroAoCarregar({ children }: { children?: ReactNode }) {
  return (
    <div className="border border-destaque bg-destaque/10 p-4 text-[13px] text-destaque">
      {children ??
        "Não foi possível carregar estes dados. Atualize a página e tente de novo."}
    </div>
  );
}

/**
 * Tabela com cabeçalho fixo, contraste de linha e rodapé de contagem.
 *
 * O rodapé existe porque as listas do painel são cortadas em 500 ou 200 linhas
 * e nada dizia isso — quem procurava um cliente antigo achava que ele não
 * existia.
 */
export function Tabela({
  colunas,
  vazio,
  carregando,
  total,
  limite,
  children,
}: {
  colunas: {
    titulo: string;
    alinhamento?: "esquerda" | "direita";
    largura?: string;
  }[];
  vazio: string;
  carregando?: boolean;
  total: number;
  limite?: number;
  children: ReactNode;
}) {
  if (carregando) return <Esqueleto linhas={5} />;
  if (total === 0) return <Vazio>{vazio}</Vazio>;

  return (
    <div className="border border-border">
      <div className="max-h-[460px] overflow-auto">
        <table className="w-full text-[14px]">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="border-b border-border">
              {colunas.map((c) => (
                <th
                  key={c.titulo}
                  className={`titulo px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-muted-foreground ${
                    c.alinhamento === "direita" ? "text-right" : "text-left"
                  } ${c.largura ?? ""}`}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-muted/40">
            {children}
          </tbody>
        </table>
      </div>
      <div className="flex items-baseline justify-between border-t border-border bg-card px-3 py-2 text-[12px] text-muted-foreground">
        <span>
          <span className="num">{total}</span> registro{total === 1 ? "" : "s"}
        </span>
        {limite !== undefined && total >= limite && (
          <span className="text-premio-texto">
            lista cortada em <span className="num">{limite}</span> — refine a
            busca
          </span>
        )}
      </div>
    </div>
  );
}

export const celula = "px-3 py-2 align-top";
