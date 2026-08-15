-- ONDA 1 — Segurança do acesso e integridade da escolha de números.
--
-- Fecha, no banco, o que não dá para garantir só no código da aplicação:
--   1. força bruta e reemissão em massa de códigos de acesso;
--   2. corrida entre a checagem de saldo e a gravação dos números;
--   3. escolha de número fora da janela da campanha ou fora da faixa da cartela;
--   4. colisão de protocolo entre clientes diferentes.

-- ---------------------------------------------------------------------------
-- 1. Códigos de acesso: contador de tentativas e invalidação explícita
-- ---------------------------------------------------------------------------

ALTER TABLE public.codigos_acesso
  ADD COLUMN tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN invalidado_em timestamptz;

CREATE INDEX codigos_acesso_cliente_idx
  ON public.codigos_acesso (cliente_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- 2. Índices que faltavam nas consultas quentes
-- ---------------------------------------------------------------------------

CREATE INDEX creditos_cliente_campanha_idx ON public.creditos (cliente_id, campanha_id);
CREATE INDEX eventos_cliente_idx ON public.eventos (cliente_id);
CREATE INDEX sessoes_expira_idx ON public.sessoes (expira_em);

-- ---------------------------------------------------------------------------
-- 3. Limite de taxa genérico, por chave livre (documento, IP, o que for)
-- ---------------------------------------------------------------------------

CREATE TABLE public.limites_acesso (
  chave text PRIMARY KEY,
  janela_inicio timestamptz NOT NULL DEFAULT now(),
  contador integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.limites_acesso TO service_role;
ALTER TABLE public.limites_acesso ENABLE ROW LEVEL SECURITY;

-- Devolve true quando a chamada cabe dentro do limite e false quando estoura.
-- A janela é deslizante por reinício: o primeiro acesso depois do prazo zera o
-- contador. Chamada única e atômica, sem leitura anterior.
CREATE OR REPLACE FUNCTION public.consumir_limite(
  p_chave text,
  p_maximo integer,
  p_janela_segundos integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contador integer;
BEGIN
  INSERT INTO public.limites_acesso AS l (chave, janela_inicio, contador)
  VALUES (p_chave, now(), 1)
  ON CONFLICT (chave) DO UPDATE
    SET contador = CASE
          WHEN l.janela_inicio < now() - make_interval(secs => p_janela_segundos) THEN 1
          ELSE l.contador + 1
        END,
        janela_inicio = CASE
          WHEN l.janela_inicio < now() - make_interval(secs => p_janela_segundos) THEN now()
          ELSE l.janela_inicio
        END
  RETURNING l.contador INTO v_contador;

  RETURN v_contador <= p_maximo;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Emissão de código: invalida os anteriores antes de criar o novo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.emitir_codigo_acesso(
  p_cliente_id uuid,
  p_codigo text,
  p_expira_em timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.codigos_acesso
     SET invalidado_em = now()
   WHERE cliente_id = p_cliente_id
     AND usado_em IS NULL
     AND invalidado_em IS NULL;

  INSERT INTO public.codigos_acesso (cliente_id, codigo, expira_em)
  VALUES (p_cliente_id, p_codigo, p_expira_em);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Consumo de código: no máximo 5 erros por código, depois ele morre
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consumir_codigo_acesso(
  p_cliente_id uuid,
  p_codigo text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registro public.codigos_acesso%ROWTYPE;
BEGIN
  -- Serializa as tentativas do mesmo cliente: sem isso, N requisições
  -- paralelas contam como uma tentativa só.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cliente_id::text, 0));

  SELECT * INTO v_registro
    FROM public.codigos_acesso
   WHERE cliente_id = p_cliente_id
     AND usado_em IS NULL
     AND invalidado_em IS NULL
     AND expira_em > now()
   ORDER BY criado_em DESC
   LIMIT 1
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_registro.codigo <> p_codigo THEN
    UPDATE public.codigos_acesso
       SET tentativas = tentativas + 1,
           invalidado_em = CASE WHEN tentativas + 1 >= 5 THEN now() ELSE NULL END
     WHERE id = v_registro.id;
    RETURN false;
  END IF;

  UPDATE public.codigos_acesso SET usado_em = now() WHERE id = v_registro.id;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Escolha de números numa única transação
-- ---------------------------------------------------------------------------

-- Protocolo vem de sequência: duas confirmações nunca recebem o mesmo código,
-- o que o sufixo aleatório anterior não garantia.
CREATE SEQUENCE public.protocolo_seq START 1;
GRANT USAGE ON SEQUENCE public.protocolo_seq TO service_role;

CREATE OR REPLACE FUNCTION public.escolher_numeros(
  p_cliente_id uuid,
  p_campanha_id uuid,
  p_numeros integer[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campanha public.campanhas%ROWTYPE;
  v_pedidos integer[];
  v_quantidade integer;
  v_maximo integer;
  v_creditos integer;
  v_escolhidos integer;
  v_saldo integer;
  v_protocolo text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT array_agg(DISTINCT n ORDER BY n) INTO v_pedidos FROM unnest(p_numeros) AS n;
  v_quantidade := coalesce(array_length(v_pedidos, 1), 0);

  IF v_quantidade = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Selecione ao menos um número.');
  END IF;

  SELECT * INTO v_campanha FROM public.campanhas WHERE id = p_campanha_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Campanha não encontrada.');
  END IF;

  IF v_campanha.status <> 'aberta' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Esta campanha não está aberta para escolha de números.'
    );
  END IF;

  IF v_hoje < v_campanha.inicio OR v_hoje > v_campanha.fim THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Fora do período da campanha.');
  END IF;

  v_maximo := (power(10, v_campanha.digitos_cartela) - 1)::integer;
  IF EXISTS (SELECT 1 FROM unnest(v_pedidos) AS n WHERE n < 0 OR n > v_maximo) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', format('Esta cartela vai de 0 a %s.', v_maximo)
    );
  END IF;

  -- Serializa as escolhas deste cliente nesta campanha. Trava por par
  -- (cliente, campanha) em vez de travar as linhas de crédito, porque o
  -- cliente pode não ter nenhuma linha para travar.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_cliente_id::text || ':' || p_campanha_id::text, 0)
  );

  SELECT coalesce(sum(quantidade), 0) INTO v_creditos
    FROM public.creditos
   WHERE cliente_id = p_cliente_id AND campanha_id = p_campanha_id;

  SELECT count(*) INTO v_escolhidos
    FROM public.numeros
   WHERE cliente_id = p_cliente_id AND campanha_id = p_campanha_id;

  v_saldo := v_creditos - v_escolhidos;

  IF v_quantidade > v_saldo THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', format('Você tem %s número(s) disponível(is).', v_saldo),
      'saldo', v_saldo
    );
  END IF;

  v_protocolo := 'LM-'
    || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD')
    || '-'
    || lpad(nextval('public.protocolo_seq')::text, 6, '0');

  BEGIN
    INSERT INTO public.numeros (campanha_id, numero, cliente_id, protocolo)
    SELECT p_campanha_id, n, p_cliente_id, v_protocolo FROM unnest(v_pedidos) AS n;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'ok', false,
        'erro', 'Algum número acabou de ser escolhido por outro cliente. Atualize a cartela.',
        'conflito', true
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'protocolo', v_protocolo,
    'numeros', to_jsonb(v_pedidos)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Faxina de sessões, códigos e limites vencidos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.limpar_expirados()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.sessoes WHERE expira_em < now();
  DELETE FROM public.codigos_acesso WHERE expira_em < now() - interval '7 days';
  DELETE FROM public.limites_acesso WHERE janela_inicio < now() - interval '1 day';
$$;

-- ---------------------------------------------------------------------------
-- 8. Nada disso é chamável pelo navegador: só pelo servidor
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.consumir_limite(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.emitir_codigo_acesso(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consumir_codigo_acesso(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escolher_numeros(uuid, uuid, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.limpar_expirados() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consumir_limite(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.emitir_codigo_acesso(uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.consumir_codigo_acesso(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.escolher_numeros(uuid, uuid, integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.limpar_expirados() TO service_role;
