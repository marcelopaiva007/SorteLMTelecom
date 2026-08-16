-- 1. O painel deixa de depender da chave service_role.
-- 2. A campanha escolhe como será apurada: Loteria Federal ou sorteio próprio.

-- ---------------------------------------------------------------------------
-- PARTE 0 — As colunas novas, antes de qualquer função que as leia
-- ---------------------------------------------------------------------------

CREATE TYPE public.modo_apuracao AS ENUM ('loteria_federal', 'sorteio_proprio');

ALTER TABLE public.campanhas
  ADD COLUMN modo_apuracao public.modo_apuracao NOT NULL DEFAULT 'loteria_federal',
  -- O registro do que sustenta o resultado. Para a Loteria Federal, o concurso
  -- e os prêmios; para o sorteio próprio, quando foi, onde está a gravação e
  -- quem auditou.
  ADD COLUMN apuracao jsonb;

-- ---------------------------------------------------------------------------
-- PARTE 1 — Painel sem service_role
-- ---------------------------------------------------------------------------
--
-- Três telas do painel liam o banco com a chave service_role, que precisa estar
-- no ambiente da hospedagem. Faltando ela, a Visão geral, a chave do ERP e o
-- processamento de eventos quebravam — o resto do painel funcionava, porque usa
-- o token do próprio administrador.
--
-- Nada disso precisava de service_role: são leituras de administrador
-- autenticado. Passam a ser funções SECURITY DEFINER que conferem `is_admin`
-- por dentro, então valem para quem está logado como admin e para mais ninguém.
-- A service_role continua obrigatória só onde não existe usuário: a porta do
-- ERP, que é chamada por outro sistema.

-- Tudo que a Visão geral mostra, numa consulta só.
CREATE OR REPLACE FUNCTION public.resumo_visao_geral()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campanha public.campanhas%ROWTYPE;
  v_escolhidos integer := 0;
  v_participantes integer := 0;
  v_concedidos integer := 0;
  v_falhas integer := 0;
  v_status text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  SELECT * INTO v_campanha
    FROM public.campanhas
   WHERE status = 'aberta'
   ORDER BY inicio DESC
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_campanha
      FROM public.campanhas
     ORDER BY inicio DESC
     LIMIT 1;
  END IF;

  IF v_campanha.id IS NOT NULL THEN
    SELECT count(*) INTO v_escolhidos
      FROM public.numeros WHERE campanha_id = v_campanha.id;

    SELECT count(DISTINCT cliente_id), coalesce(sum(quantidade), 0)
      INTO v_participantes, v_concedidos
      FROM public.creditos WHERE campanha_id = v_campanha.id;
  END IF;

  -- Falhas seguidas na leitura do ERP, olhando da mais recente para trás.
  FOR v_status IN
    SELECT status FROM public.sincronizacoes
     ORDER BY iniciado_em DESC LIMIT 5
  LOOP
    EXIT WHEN v_status <> 'falha';
    v_falhas := v_falhas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'campanha', CASE WHEN v_campanha.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_campanha.id,
      'nome', v_campanha.nome,
      'premio', v_campanha.premio,
      'status', v_campanha.status,
      'inicio', v_campanha.inicio,
      'fim', v_campanha.fim,
      'data_apuracao', v_campanha.data_apuracao,
      'digitos_cartela', v_campanha.digitos_cartela,
      'numero_sorteado', v_campanha.numero_sorteado,
      'modo_apuracao', v_campanha.modo_apuracao
    ) END,
    'cartela', CASE WHEN v_campanha.id IS NULL THEN 0
                    ELSE power(10, v_campanha.digitos_cartela)::bigint END,
    'escolhidos', v_escolhidos,
    'participantes', v_participantes,
    'numeros_concedidos', v_concedidos,
    -- Crédito concedido que o cliente ainda não transformou em número.
    'na_espera', greatest(0, v_concedidos - v_escolhidos),
    'bloqueados', (SELECT count(*) FROM public.eventos_bloqueados),
    'clientes', (SELECT count(*) FROM public.clientes),
    'ultima_leitura', (SELECT max(iniciado_em) FROM public.sincronizacoes),
    'falhas_seguidas', v_falhas
  );
END;
$$;

-- A chave do ERP, para o administrador entregar ao time do ERP.
CREATE OR REPLACE FUNCTION public.ler_chave_erp()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.segredos%ROWTYPE;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  SELECT * INTO v FROM public.segredos WHERE chave = 'erp_chave_ingestao';
  RETURN jsonb_build_object(
    'chave', v.valor,
    'atualizado_em', v.atualizado_em
  );
END;
$$;

-- Gira a chave. O valor novo é gerado no banco para não trafegar duas vezes.
CREATE OR REPLACE FUNCTION public.girar_chave_erp()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nova text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  -- 32 bytes de aleatoriedade, em base64 sem os caracteres que atrapalham em
  -- cabeçalho HTTP.
  v_nova := 'erp_' || translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=', '-_'
  );

  INSERT INTO public.segredos (chave, valor, descricao, atualizado_em)
  VALUES ('erp_chave_ingestao', v_nova,
          'Cabeçalho x-erp-chave em POST /api/erp/eventos', now())
  ON CONFLICT (chave) DO UPDATE
    SET valor = excluded.valor, atualizado_em = now();

  RETURN jsonb_build_object('chave', v_nova);
END;
$$;

-- Processamento manual de eventos pendentes, para o botão do painel.
CREATE OR REPLACE FUNCTION public.processar_eventos_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  RETURN public.processar_eventos_pendentes(5000);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resumo_visao_geral() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ler_chave_erp() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.girar_chave_erp() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.processar_eventos_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.resumo_visao_geral() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ler_chave_erp() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.girar_chave_erp() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.processar_eventos_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- PARTE 2 — Como a campanha é apurada
-- ---------------------------------------------------------------------------
--
-- Até aqui só existia um caminho: os últimos dígitos do 1º prêmio da Loteria
-- Federal. Passa a existir também o sorteio próprio — feito em estúdio, com
-- transmissão ao vivo e auditores internos.
--
-- A escolha é da campanha e é feita na criação, junto com o critério de
-- apuração, porque é parte da promessa que o cliente lê antes de escolher os
-- números. Depois que a campanha abre, o modo congela: mudar a forma de sortear
-- com o jogo rolando é trocar a regra no meio do jogo.

CREATE OR REPLACE FUNCTION public.travar_modo_apuracao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'rascunho' AND NEW.modo_apuracao IS DISTINCT FROM OLD.modo_apuracao THEN
    RAISE EXCEPTION
      'A forma de apuração está congelada desde a abertura da campanha e não pode mudar.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER campanhas_modo_congelado
  BEFORE UPDATE ON public.campanhas
  FOR EACH ROW EXECUTE FUNCTION public.travar_modo_apuracao();

-- Busca do ganhador a partir de um número base: sobe até o primeiro número com
-- dono e, no fim da cartela, recomeça do zero. É a mesma regra nos dois modos —
-- o que muda é de onde vem o número base.
CREATE OR REPLACE FUNCTION public.ganhador_a_partir_de(
  p_campanha_id uuid,
  p_base integer
) RETURNS TABLE (numero integer, cliente_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.numero, n.cliente_id
    FROM public.numeros n
   WHERE n.campanha_id = p_campanha_id AND n.numero >= p_base
   ORDER BY n.numero
   LIMIT 1;
$$;

-- Apuração pela Loteria Federal. Substitui a versão anterior: passa a exigir
-- que a campanha esteja no modo certo e grava em `apuracao`.
CREATE OR REPLACE FUNCTION public.apurar_campanha(
  p_campanha_id uuid,
  p_concurso text,
  p_data_extracao date,
  p_premios text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campanha public.campanhas%ROWTYPE;
  v_primeiro text;
  v_base integer;
  v_numero integer;
  v_ganhador uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  SELECT * INTO v_campanha FROM public.campanhas WHERE id = p_campanha_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Campanha não encontrada.');
  END IF;

  IF v_campanha.modo_apuracao <> 'loteria_federal' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Esta campanha foi criada para sorteio próprio, não para a Loteria Federal.'
    );
  END IF;

  IF v_campanha.status = 'apurada' OR v_campanha.numero_sorteado IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Esta campanha já foi apurada. O resultado não pode ser refeito.'
    );
  END IF;

  IF v_campanha.status = 'rascunho' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Uma campanha em rascunho não tem o que apurar.');
  END IF;

  v_primeiro := regexp_replace(coalesce(p_premios[1], ''), '\D', '', 'g');
  IF v_primeiro = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Informe o 1º prêmio da extração da Loteria Federal.');
  END IF;

  v_base := right(lpad(v_primeiro, v_campanha.digitos_cartela, '0'), v_campanha.digitos_cartela)::integer;

  SELECT g.numero, g.cliente_id INTO v_numero, v_ganhador
    FROM public.ganhador_a_partir_de(p_campanha_id, v_base) g;

  IF v_numero IS NULL THEN
    SELECT g.numero, g.cliente_id INTO v_numero, v_ganhador
      FROM public.ganhador_a_partir_de(p_campanha_id, 0) g;
  END IF;

  IF v_numero IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum número foi escolhido nesta campanha.');
  END IF;

  UPDATE public.campanhas
     SET numero_sorteado = v_numero,
         ganhador_cliente_id = v_ganhador,
         status = 'apurada',
         apuracao = jsonb_build_object(
           'modo', 'loteria_federal',
           'concurso', p_concurso,
           'data', p_data_extracao,
           'premios', to_jsonb(p_premios),
           'numero_base', v_base,
           'apurado_em', now(),
           'apurado_por', (SELECT email FROM public.perfis WHERE user_id = auth.uid())
         )
   WHERE id = p_campanha_id;

  RETURN jsonb_build_object(
    'ok', true,
    'numero_base', v_base,
    'numero_sorteado', v_numero,
    'ganhador_cliente_id', v_ganhador
  );
END;
$$;

-- Apuração por sorteio próprio: o número sai ao vivo, no estúdio, e o operador
-- informa aqui o que foi sorteado. A prova não é a extração da Caixa, é a
-- gravação da transmissão mais a assinatura dos auditores — por isso os dois
-- são obrigatórios.
CREATE OR REPLACE FUNCTION public.apurar_campanha_propria(
  p_campanha_id uuid,
  p_numero integer,
  p_realizado_em timestamptz,
  p_transmissao text,
  p_auditores text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campanha public.campanhas%ROWTYPE;
  v_maximo integer;
  v_numero integer;
  v_ganhador uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  SELECT * INTO v_campanha FROM public.campanhas WHERE id = p_campanha_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Campanha não encontrada.');
  END IF;

  IF v_campanha.modo_apuracao <> 'sorteio_proprio' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Esta campanha foi criada para apuração pela Loteria Federal.'
    );
  END IF;

  IF v_campanha.status = 'apurada' OR v_campanha.numero_sorteado IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Esta campanha já foi apurada. O resultado não pode ser refeito.'
    );
  END IF;

  IF v_campanha.status = 'rascunho' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Uma campanha em rascunho não tem o que apurar.');
  END IF;

  v_maximo := (power(10, v_campanha.digitos_cartela) - 1)::integer;
  IF p_numero IS NULL OR p_numero < 0 OR p_numero > v_maximo THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', format('O número sorteado precisa estar entre 0 e %s.', v_maximo)
    );
  END IF;

  IF coalesce(trim(p_transmissao), '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Informe o link da gravação da transmissão: é ela que sustenta o resultado.'
    );
  END IF;

  IF coalesce(array_length(p_auditores, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Informe ao menos um auditor presente ao sorteio.'
    );
  END IF;

  SELECT g.numero, g.cliente_id INTO v_numero, v_ganhador
    FROM public.ganhador_a_partir_de(p_campanha_id, p_numero) g;

  IF v_numero IS NULL THEN
    SELECT g.numero, g.cliente_id INTO v_numero, v_ganhador
      FROM public.ganhador_a_partir_de(p_campanha_id, 0) g;
  END IF;

  IF v_numero IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum número foi escolhido nesta campanha.');
  END IF;

  UPDATE public.campanhas
     SET numero_sorteado = v_numero,
         ganhador_cliente_id = v_ganhador,
         status = 'apurada',
         apuracao = jsonb_build_object(
           'modo', 'sorteio_proprio',
           'numero_base', p_numero,
           'realizado_em', p_realizado_em,
           'transmissao', trim(p_transmissao),
           'auditores', to_jsonb(p_auditores),
           'apurado_em', now(),
           'apurado_por', (SELECT email FROM public.perfis WHERE user_id = auth.uid())
         )
   WHERE id = p_campanha_id;

  RETURN jsonb_build_object(
    'ok', true,
    'numero_base', p_numero,
    'numero_sorteado', v_numero,
    'ganhador_cliente_id', v_ganhador
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ganhador_a_partir_de(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apurar_campanha(uuid, text, date, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apurar_campanha_propria(uuid, integer, timestamptz, text, text[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ganhador_a_partir_de(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apurar_campanha(uuid, text, date, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apurar_campanha_propria(uuid, integer, timestamptz, text, text[]) TO authenticated, service_role;
