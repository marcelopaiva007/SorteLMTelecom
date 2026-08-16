# Migrations do banco

Projeto Supabase: `oiamktffakkqfhvprjns`

## Situação

**Todas as migrations já estão aplicadas em produção**, na ordem abaixo, e
registradas em `supabase_migrations.schema_migrations` — o `supabase db push`
não vai tentar reaplicá-las.

| Ordem | Arquivo                              | O que trouxe                                                                     |
| ----- | ------------------------------------ | -------------------------------------------------------------------------------- |
| 1º    | `20260815120000_onda1_seguranca.sql` | Travas de código de acesso, limite de taxa, escolha de números numa transação só |
| 2º    | `20260815160000_onda2_motor.sql`     | Concessão de crédito a partir de evento, apuração, pesos congelados, auditoria   |
| 3º    | `20260815200000_onda3_escala.sql`    | Contagem e agregação no banco, no lugar de contar no navegador                   |
| 4º    | `20260816010000_chave_do_erp.sql`    | Tabela `segredos`, onde vive a chave de integração do ERP                        |

Conferido depois de aplicar: 17 funções novas, as triggers `eventos_creditam` e
`regras_congeladas` ativas, a escada do bom pagador batendo com os testes de
`src/lib/regras.test.ts` (base 2, 16 meses em dia → 4 números, no teto), a trava
de campanha única recusando a segunda campanha aberta e a de pesos recusando
alteração em campanha já aberta.

---

## Aplicar uma migration nova

**Ordem importa** e nenhuma migration é idempotente: elas usam `CREATE TABLE` e
`ALTER TABLE ... ADD COLUMN` sem `IF NOT EXISTS`, então rodar duas vezes acusa
que a coisa já existe. Isso é proteção, não defeito.

### Caminho A — SQL Editor do Supabase

1. Abra <https://supabase.com/dashboard/project/oiamktffakkqfhvprjns/sql/new>
2. Cole **o arquivo inteiro** e clique em **Run**. O editor roda tudo numa
   transação: se der erro no meio, nada fica pela metade.
3. Registre que foi aplicada, para o CLI não tentar de novo:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('<timestamp do arquivo>', '<nome depois do underscore>');
```

### Caminho B — Supabase CLI

Na sua máquina (este ambiente não tem o CLI):

```bash
npm install -g supabase
supabase login
supabase link --project-ref oiamktffakkqfhvprjns
supabase db push
```

---

## Conferir que está tudo de pé

```sql
-- 17 funções, as duas triggers e a tabela de segredos.
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public') AS funcoes,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname IN ('eventos_creditam', 'regras_congeladas')) AS triggers,
  (SELECT count(*) FROM public.segredos
    WHERE chave = 'erp_chave_ingestao') AS chave_do_erp;
-- Esperado: 18 (17 + is_admin), 2, 1.
```

---

## O que mudou de comportamento

1. **Os pesos da campanha aberta ficam congelados.** O banco recusa alteração em
   `regras` de campanha que não esteja em rascunho. Para testar outra
   configuração, crie campanha nova em rascunho.
2. **Só uma campanha aberta por vez.** Abrir a segunda dá erro com explicação.
3. **Todo evento novo vira crédito sozinho**, na hora em que entra, pela trigger
   `eventos_creditam`. O botão "Processar eventos pendentes" no painel só serve
   para carga inicial e retomada depois de falha.
4. **Ninguém entra sem o código chegar.** Como o código de acesso não volta mais
   para a tela, o ambiente de preview precisa de `SORTEIO_MODO_DEMO=1` nas
   variáveis da Vercel enquanto não houver provedor de WhatsApp contratado.
   **Em produção, não defina essa variável.**
