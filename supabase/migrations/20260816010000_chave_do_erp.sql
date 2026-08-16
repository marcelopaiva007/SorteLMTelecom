-- Chave de integração do ERP guardada no banco.
--
-- Antes ela só existia como variável de ambiente na hospedagem, e isso deixava
-- a integração parada até alguém abrir o painel da Vercel: sem a variável, o
-- endpoint /api/erp/eventos responde 503 e nenhum evento entra.
--
-- Aqui a chave passa a morar numa tabela que só a service_role enxerga. É a
-- mesma fronteira de segurança da variável de ambiente — quem tem a chave de
-- service_role já tem o banco inteiro —, com duas vantagens: dá para configurar
-- e girar sem depender do painel da hospedagem, e o próprio painel do Sorteio LM
-- consegue mostrar a chave para quem vai passá-la ao time do ERP.
--
-- A variável de ambiente continua tendo precedência: quem preferir manter o
-- segredo fora do banco define ERP_CHAVE_INGESTAO e esta tabela é ignorada.

CREATE TABLE public.segredos (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  descricao text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- RLS ligada e nenhuma policy: nem anon nem authenticated leem uma linha. Só a
-- service_role, que passa por cima da RLS, e apenas do lado do servidor.
ALTER TABLE public.segredos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.segredos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.segredos TO service_role;

COMMENT ON TABLE public.segredos IS
  'Segredos de integração. Nunca exponha por RLS: só a service_role lê.';
