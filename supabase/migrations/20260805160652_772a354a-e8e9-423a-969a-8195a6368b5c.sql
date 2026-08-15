
CREATE TYPE public.status_cliente AS ENUM ('ativo','cancelado','suspenso');
CREATE TYPE public.status_campanha AS ENUM ('rascunho','aberta','encerrada','apurada');
CREATE TYPE public.tipo_evento AS ENUM ('assinatura','reativacao','quitacao_debito','mensalidade_em_dia');

CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_id text NOT NULL UNIQUE,
  cpf_cnpj text NOT NULL UNIQUE,
  nome text NOT NULL,
  whatsapp text,
  status public.status_cliente NOT NULL DEFAULT 'ativo',
  data_ativacao date,
  data_cancelamento date,
  meses_em_dia integer NOT NULL DEFAULT 0,
  autoexcluido_em timestamptz,
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  inicio date NOT NULL,
  fim date NOT NULL,
  premio text NOT NULL,
  data_apuracao date NOT NULL,
  digitos_cartela integer NOT NULL DEFAULT 4,
  criterio_apuracao text NOT NULL,
  criterio_congelado_em timestamptz NOT NULL DEFAULT now(),
  status public.status_campanha NOT NULL DEFAULT 'aberta',
  numero_sorteado integer,
  ganhador_cliente_id uuid REFERENCES public.clientes(id),
  extracao_federal jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.campanhas TO anon, authenticated;
GRANT ALL ON public.campanhas TO service_role;
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campanhas sao publicas" ON public.campanhas FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  tipo_evento public.tipo_evento NOT NULL,
  quantidade integer NOT NULL,
  carencia_dias integer NOT NULL DEFAULT 0,
  limite_meses integer
);
GRANT SELECT ON public.regras TO anon, authenticated;
GRANT ALL ON public.regras TO service_role;
ALTER TABLE public.regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regras sao publicas" ON public.regras FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo public.tipo_evento NOT NULL,
  competencia text,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  chave_idempotente text NOT NULL,
  payload_erp jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT eventos_chave_idempotente_key UNIQUE (chave_idempotente)
);
GRANT ALL ON public.eventos TO service_role;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.creditos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  evento_id uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creditos_evento_campanha_key UNIQUE (evento_id, campanha_id)
);
GRANT ALL ON public.creditos TO service_role;
ALTER TABLE public.creditos ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.numeros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  escolhido_em timestamptz NOT NULL DEFAULT now(),
  protocolo text,
  CONSTRAINT numeros_campanha_numero_key UNIQUE (campanha_id, numero)
);
CREATE INDEX numeros_cliente_idx ON public.numeros (campanha_id, cliente_id);
GRANT ALL ON public.numeros TO service_role;
ALTER TABLE public.numeros ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.codigos_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.codigos_acesso TO service_role;
ALTER TABLE public.codigos_acesso ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sessoes (
  token text PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sessoes TO service_role;
ALTER TABLE public.sessoes ENABLE ROW LEVEL SECURITY;

INSERT INTO public.campanhas (id, nome, inicio, fim, premio, data_apuracao, digitos_cartela, criterio_apuracao, criterio_congelado_em, status)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Campanha Agosto 2026',
  '2026-08-01','2026-08-29',
  'Moto Honda Biz 0km',
  '2026-08-30', 4,
  'Ganha o número igual aos 4 últimos dígitos do 1º prêmio da Loteria Federal de 30/08/2026; não havendo igual, o mais próximo acima.',
  '2026-07-25 09:00:00-03', 'aberta'
);

INSERT INTO public.regras (campanha_id, tipo_evento, quantidade, carencia_dias, limite_meses) VALUES
('11111111-1111-1111-1111-111111111111','assinatura',10,0,NULL),
('11111111-1111-1111-1111-111111111111','reativacao',8,0,NULL),
('11111111-1111-1111-1111-111111111111','quitacao_debito',5,0,NULL),
('11111111-1111-1111-1111-111111111111','mensalidade_em_dia',3,0,6);

INSERT INTO public.clientes (erp_id, cpf_cnpj, nome, whatsapp, status, data_ativacao, meses_em_dia)
SELECT
  'ERP' || lpad(i::text, 5, '0'),
  CASE WHEN i = 1 THEN '12345678909' ELSE lpad(((10000000000::bigint + i::bigint * 76543219) % 100000000000)::text, 11, '0') END,
  (ARRAY['Ana','Bruno','Carla','Diego','Eliane','Fábio','Gisele','Hugo','Isabel','João','Karina','Lucas','Marta','Nelson','Olívia','Paulo','Queila','Rafael','Sônia','Tiago'])[1 + (i % 20)]
    || ' ' ||
  (ARRAY['Almeida','Barbosa','Cardoso','Duarte','Esteves','Ferreira','Gomes','Henrique','Iglesias','Jardim','Klein','Lopes','Macedo','Nunes','Oliveira'])[1 + (i % 15)],
  '55' || lpad((11900000000::bigint + i::bigint * 137)::text, 11, '0'),
  'ativo',
  date '2024-01-10' + (i * 11),
  3 + (i % 14)
FROM generate_series(1, 40) i;

INSERT INTO public.eventos (cliente_id, tipo, competencia, ocorrido_em, chave_idempotente, payload_erp)
SELECT c.id, 'assinatura', to_char(c.data_ativacao,'YYYY-MM'), c.data_ativacao, c.erp_id || ':assinatura', jsonb_build_object('origem','erp','contrato',c.erp_id)
FROM public.clientes c;

INSERT INTO public.eventos (cliente_id, tipo, competencia, ocorrido_em, chave_idempotente, payload_erp)
SELECT c.id, 'mensalidade_em_dia', comp.competencia, (comp.competencia || '-10')::date, c.erp_id || ':mensalidade:' || comp.competencia, jsonb_build_object('origem','erp')
FROM public.clientes c
CROSS JOIN (VALUES ('2026-06'),('2026-07'),('2026-08')) AS comp(competencia);

INSERT INTO public.eventos (cliente_id, tipo, competencia, ocorrido_em, chave_idempotente, payload_erp)
SELECT c.id, 'quitacao_debito', '2026-07', '2026-07-18', c.erp_id || ':quitacao:2026-07', jsonb_build_object('origem','erp')
FROM public.clientes c WHERE c.meses_em_dia % 4 = 0;

INSERT INTO public.creditos (cliente_id, evento_id, campanha_id, quantidade, criado_em)
SELECT e.cliente_id, e.id, '11111111-1111-1111-1111-111111111111',
  CASE
    WHEN e.tipo = 'assinatura' THEN 10
    WHEN e.tipo = 'reativacao' THEN 8
    WHEN e.tipo = 'quitacao_debito' THEN 5
    ELSE LEAST(6, 3 + (c.meses_em_dia / 6))
  END,
  e.ocorrido_em
FROM public.eventos e
JOIN public.clientes c ON c.id = e.cliente_id;

WITH saldos AS (
  SELECT cliente_id, GREATEST(0, floor(SUM(quantidade) * 0.55)::int) AS q
  FROM public.creditos GROUP BY cliente_id
),
slots AS (
  SELECT cliente_id, row_number() OVER (ORDER BY random()) AS rn
  FROM saldos, generate_series(1, saldos.q)
),
sorteados AS (
  SELECT n, row_number() OVER (ORDER BY random()) AS rn
  FROM (SELECT DISTINCT (random() * 9999)::int AS n FROM generate_series(1, 6000)) s
)
INSERT INTO public.numeros (campanha_id, numero, cliente_id, escolhido_em, protocolo)
SELECT '11111111-1111-1111-1111-111111111111', sorteados.n, slots.cliente_id,
       now() - (slots.rn || ' minutes')::interval,
       'LM-' || lpad(slots.rn::text, 6, '0')
FROM slots JOIN sorteados ON sorteados.rn = slots.rn;
