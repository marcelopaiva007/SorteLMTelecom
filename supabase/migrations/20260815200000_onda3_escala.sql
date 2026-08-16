-- ONDA 3 — Escala.
--
-- A API do Supabase devolve no máximo ~1.000 linhas por requisição. Vários
-- pontos do código faziam `select` sem paginação e contavam o array em
-- JavaScript, então:
--   * a cartela mostrava como livres números que já tinham dono;
--   * o contador de participantes travava perto de um número fixo;
--   * "clientes espelhados", "eventos do dia" e "duplicados barrados" ficavam
--     errados no painel.
--
-- Contar e agregar é trabalho do banco. Estas funções tiram isso do navegador.

-- ---------------------------------------------------------------------------
-- 1. Números da cartela
-- ---------------------------------------------------------------------------

-- Totais da campanha sem trazer uma linha por número escolhido.
CREATE OR REPLACE FUNCTION public.estatisticas_campanha(p_campanha_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ocupados', (
      SELECT count(*) FROM public.numeros WHERE campanha_id = p_campanha_id
    ),
    'participantes', (
      SELECT count(DISTINCT cliente_id)
        FROM public.creditos WHERE campanha_id = p_campanha_id
    )
  );
$$;

-- A cartela navega de centena em centena, então busca só a centena visível.
-- Antes vinha a cartela inteira de uma vez — e vinha cortada.
CREATE OR REPLACE FUNCTION public.numeros_ocupados_bloco(
  p_campanha_id uuid,
  p_inicio integer,
  p_fim integer
) RETURNS integer[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(numero ORDER BY numero), '{}')
    FROM public.numeros
   WHERE campanha_id = p_campanha_id
     AND numero BETWEEN p_inicio AND p_fim;
$$;

-- "Sorte da casa" sorteia números livres.
--
-- Antes o navegador montava um array de até 10^6 posições e fazia busca linear
-- dentro do laço — o celular do cliente travava. Aqui é sorteio com repescagem:
-- tenta números aleatórios e, se a cartela estiver cheia demais para isso valer
-- a pena, varre o que sobrou.
CREATE OR REPLACE FUNCTION public.sortear_numeros_livres(
  p_campanha_id uuid,
  p_quantidade integer
) RETURNS integer[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_escolhidos integer[] := '{}';
  v_n integer;
  v_faltam integer;
BEGIN
  IF p_quantidade <= 0 THEN RETURN '{}'; END IF;

  SELECT (power(10, digitos_cartela) - 1)::integer INTO v_max
    FROM public.campanhas WHERE id = p_campanha_id;
  IF v_max IS NULL THEN RETURN '{}'; END IF;

  FOR i IN 1..(p_quantidade * 40) LOOP
    EXIT WHEN coalesce(array_length(v_escolhidos, 1), 0) >= p_quantidade;
    v_n := floor(random() * (v_max + 1))::integer;
    CONTINUE WHEN v_n = ANY(v_escolhidos);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.numeros
       WHERE campanha_id = p_campanha_id AND numero = v_n
    );
    v_escolhidos := v_escolhidos || v_n;
  END LOOP;

  v_faltam := p_quantidade - coalesce(array_length(v_escolhidos, 1), 0);
  IF v_faltam > 0 THEN
    SELECT v_escolhidos || coalesce(array_agg(n ORDER BY n), '{}')
      INTO v_escolhidos
      FROM (
        SELECT g.n
          FROM generate_series(0, v_max) AS g(n)
         WHERE NOT EXISTS (
                 SELECT 1 FROM public.numeros x
                  WHERE x.campanha_id = p_campanha_id AND x.numero = g.n
               )
           AND NOT (g.n = ANY(v_escolhidos))
         LIMIT v_faltam
      ) AS s;
  END IF;

  RETURN v_escolhidos;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Indicadores do painel
-- ---------------------------------------------------------------------------

-- Os contadores da aba de sincronização, contados no banco. "Hoje" passa a ser
-- o dia em America/Sao_Paulo: antes era UTC, então virava três horas cedo.
CREATE OR REPLACE FUNCTION public.resumo_operacional()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  RETURN jsonb_build_object(
    'clientes', (SELECT count(*) FROM public.clientes),
    'eventos', (SELECT count(*) FROM public.eventos),
    'eventos_hoje', (
      SELECT count(*) FROM public.eventos
       WHERE (ocorrido_em AT TIME ZONE 'America/Sao_Paulo')::date
           = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ),
    'bloqueados_duplicados', (
      SELECT count(*) FROM public.eventos_bloqueados
       WHERE motivo = 'duplicado_idempotente'
    )
  );
END;
$$;

-- A aba "Efeito no negócio" agregada por mês no banco, em vez de trazer a
-- tabela de eventos inteira (e truncada) para somar no navegador.
CREATE OR REPLACE FUNCTION public.efeito_no_negocio()
RETURNS TABLE (
  mes text,
  assinatura bigint,
  reativacao bigint,
  quitacao_debito bigint,
  mensalidade_em_dia bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  RETURN QUERY
  SELECT to_char(e.ocorrido_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'),
         count(*) FILTER (WHERE e.tipo = 'assinatura'),
         count(*) FILTER (WHERE e.tipo = 'reativacao'),
         count(*) FILTER (WHERE e.tipo = 'quitacao_debito'),
         count(*) FILTER (WHERE e.tipo = 'mensalidade_em_dia')
    FROM public.eventos e
   GROUP BY 1
   ORDER BY 1;
END;
$$;

-- Busca da auditoria no banco. Antes o filtro rodava em JavaScript depois de um
-- limite de 500, então só encontrava dentro dos 500 registros mais recentes.
CREATE OR REPLACE FUNCTION public.buscar_creditos(
  p_busca text DEFAULT '',
  p_limite integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  quantidade integer,
  criado_em timestamptz,
  nome text,
  documento text,
  erp_id text,
  tipo public.tipo_evento,
  competencia text,
  chave text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_termo text := '%' || lower(trim(coalesce(p_busca, ''))) || '%';
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  RETURN QUERY
  SELECT c.id, c.quantidade, c.criado_em,
         cl.nome, cl.cpf_cnpj, cl.erp_id,
         e.tipo, e.competencia, e.chave_idempotente
    FROM public.creditos c
    JOIN public.clientes cl ON cl.id = c.cliente_id
    JOIN public.eventos e ON e.id = c.evento_id
   WHERE trim(coalesce(p_busca, '')) = ''
      OR lower(cl.nome) LIKE v_termo
      OR lower(cl.cpf_cnpj) LIKE v_termo
      OR lower(cl.erp_id) LIKE v_termo
      OR lower(e.tipo::text) LIKE v_termo
      OR lower(e.chave_idempotente) LIKE v_termo
   ORDER BY c.criado_em DESC
   LIMIT p_limite;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Índices para as buscas acima
-- ---------------------------------------------------------------------------

CREATE INDEX eventos_ocorrido_idx ON public.eventos (ocorrido_em);
CREATE INDEX creditos_criado_idx ON public.creditos (criado_em DESC);
CREATE INDEX eventos_bloqueados_motivo_idx ON public.eventos_bloqueados (motivo);

-- ---------------------------------------------------------------------------
-- 4. Permissões
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.estatisticas_campanha(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.numeros_ocupados_bloco(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sortear_numeros_livres(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resumo_operacional() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.efeito_no_negocio() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.buscar_creditos(text, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.estatisticas_campanha(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.numeros_ocupados_bloco(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sortear_numeros_livres(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.resumo_operacional() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.efeito_no_negocio() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.buscar_creditos(text, integer) TO authenticated, service_role;
