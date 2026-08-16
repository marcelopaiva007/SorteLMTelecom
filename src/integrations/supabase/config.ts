// De onde saem a URL e a chave publicável do Supabase.
//
// Estes dois valores são públicos por natureza: a chave publicável existe para
// viajar dentro do bundle, no navegador de qualquer visitante, e é a RLS que
// protege os dados — não o segredo da chave. O que é secreto de verdade é a
// service_role, que só o servidor lê e que nunca aparece aqui.
//
// Eles ficam com valor embutido porque `VITE_*` é resolvido em tempo de build:
// se a variável não estiver definida na hospedagem no momento em que o bundle é
// gerado, ela não existe no navegador e o cliente do Supabase lança na primeira
// linha — derrubando a aplicação inteira antes de qualquer requisição, sem
// deixar rastro no log do servidor. Foi exatamente o que aconteceu.
//
// A variável de ambiente continua tendo precedência, para quem apontar o
// projeto para outra instância do Supabase.

const URL_PADRAO = "https://oiamktffakkqfhvprjns.supabase.co";
const CHAVE_PADRAO = "sb_publishable_bXqeCK-lv2LMhYLxYYCc9A_Ho73TF1I";

function doAmbiente(chave: string): string | undefined {
  // `import.meta.env` só existe no bundle do navegador; `process.env` só no
  // servidor. Cada lado ignora o outro sem quebrar.
  const daBuild =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined> | undefined)?.[
          `VITE_${chave}`
        ]
      : undefined;
  const doServidor =
    typeof process !== "undefined" ? process.env?.[chave] : undefined;
  return daBuild || doServidor;
}

export const SUPABASE_URL = doAmbiente("SUPABASE_URL") || URL_PADRAO;
export const SUPABASE_PUBLISHABLE_KEY =
  doAmbiente("SUPABASE_PUBLISHABLE_KEY") || CHAVE_PADRAO;
