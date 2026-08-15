# Como aplicar as migrations das Ondas 1 e 2

As duas migrations criam tabelas, colunas e funções que o código já chama. Enquanto não
forem aplicadas, o login e a cartela quebram em runtime: o código pede funções que o banco
ainda não tem.

Projeto Supabase: `oiamktffakkqfhvprjns`

**Ordem importa.** Onda 1 primeiro, Onda 2 depois.

| Ordem | Arquivo |
|---|---|
| 1º | `supabase/migrations/20260815120000_onda1_seguranca.sql` |
| 2º | `supabase/migrations/20260815160000_onda2_motor.sql` |

---

## Antes de começar: uma conferência

A Onda 2 cria um índice que exige **no máximo uma campanha aberta**. Se houver duas, a
migration falha. Rode isto primeiro no SQL Editor:

```sql
SELECT id, nome, status FROM public.campanhas WHERE status = 'aberta';
```

Se voltar **mais de uma linha**, encerre as extras antes de seguir:

```sql
UPDATE public.campanhas SET status = 'encerrada' WHERE id = '<id-da-campanha-extra>';
```

Se voltar zero ou uma linha, pode seguir.

---

## Caminho A — SQL Editor do Supabase (mais simples)

1. Abra <https://supabase.com/dashboard/project/oiamktffakkqfhvprjns/sql/new>
2. Abra `supabase/migrations/20260815120000_onda1_seguranca.sql`, copie **o arquivo inteiro**,
   cole no editor e clique em **Run**.
3. Confira que terminou sem erro. Repita o passo 2 com
   `supabase/migrations/20260815160000_onda2_motor.sql`.

O editor roda o arquivo inteiro de uma vez. Se der erro no meio, o Supabase desfaz o que
tinha feito naquele arquivo — corrija a causa e rode o arquivo de novo, do começo.

> **Não rode o mesmo arquivo duas vezes depois de dar certo.** As migrations usam
> `ALTER TABLE ... ADD COLUMN` e `CREATE TABLE` sem `IF NOT EXISTS`, então a segunda
> execução acusa que a coluna ou a tabela já existe. Isso é proteção, não defeito.

---

## Caminho B — Supabase CLI

Se preferir versionar pelo CLI, na sua máquina (não neste ambiente, que não tem o CLI):

```bash
npm install -g supabase
supabase login
supabase link --project-ref oiamktffakkqfhvprjns
supabase db push
```

O `db push` aplica só as migrations que ainda não estão registradas. Se as três primeiras
migrations do projeto tiverem sido aplicadas pelo Lovable sem passar pelo CLI, ele vai tentar
reaplicá-las e falhar — nesse caso use o Caminho A.

---

## Depois: conferir que ficou tudo de pé

Rode no SQL Editor. As três consultas têm que voltar linhas.

```sql
-- 1. As funções novas existem?
SELECT proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND proname IN (
     'consumir_limite', 'emitir_codigo_acesso', 'consumir_codigo_acesso',
     'escolher_numeros', 'limpar_expirados',
     'conceder_creditos', 'processar_eventos_pendentes', 'apurar_campanha',
     'registrar_auditoria'
   )
 ORDER BY proname;
-- Esperado: 9 linhas.

-- 2. As colunas e tabelas novas existem?
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (
     (table_name = 'codigos_acesso' AND column_name IN ('tentativas','invalidado_em')) OR
     (table_name = 'creditos'       AND column_name IN ('regra_id','detalhe'))
   )
 ORDER BY table_name, column_name;
-- Esperado: 4 linhas.

-- 3. As travas estão ativas?
SELECT tgname FROM pg_trigger
 WHERE tgname IN ('eventos_creditam', 'regras_congeladas');
-- Esperado: 2 linhas.
```

---

## Por último: ligar o motor na base que já existe

Os eventos do seed foram criados antes do motor existir e já têm crédito, mas rode assim
mesmo para pegar qualquer evento solto:

**Painel → Sincronização → "Processar eventos pendentes"**

Deve reportar quase tudo como "já processado". Se aparecerem bloqueados, a aba
**Auditoria** mostra o motivo de cada um.

---

## O que muda no comportamento depois de aplicar

Três coisas passam a ser diferentes e é melhor não descobrir de surpresa:

1. **Os pesos da campanha aberta ficam congelados.** O painel deixa de salvar alterações em
   `regras` de campanha que não esteja em rascunho. Para testar outra configuração, crie
   campanha nova em rascunho.
2. **Só uma campanha aberta por vez.** Abrir a segunda passa a dar erro com explicação.
3. **Ninguém entra sem o código chegar.** Como o código de acesso não volta mais para a
   tela, o ambiente de preview precisa de `SORTEIO_MODO_DEMO=1` nas variáveis da Vercel
   enquanto não houver provedor de WhatsApp contratado. **Em produção, não defina essa
   variável.**
