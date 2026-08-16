-- ONDA 2 — O motor do sorteio.
--
-- Até aqui o sistema tinha telas para dados que ninguém produzia: a tabela
-- `regras` era editável no painel mas nenhuma linha de código a lia, `creditos`
-- só tinha o que veio do seed, `eventos_bloqueados` nunca recebia registro e
-- não existia forma de apurar uma campanha.
--
-- Esta migration põe as três engrenagens no lugar:
--   1. concessão de crédito a partir de evento, lendo `regras`;
--   2. apuração pela Loteria Federal, com volta ao início da cartela;
--   3. congelamento dos pesos e trilha de auditoria das ações do painel.

-- ---------------------------------------------------------------------------
-- 1. Crédito passa a ser explicável: de qual regra veio e como foi calculado
-- ---------------------------------------------------------------------------

ALTER TABLE public.creditos
  ADD COLUMN regra_id uuid REFERENCES public.regras(id),
  ADD COLUMN detalhe jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Reprocessar um evento não pode duplicar o registro de bloqueio.
CREATE UNIQUE INDEX eventos_bloqueados_chave_motivo_idx
  ON public.eventos_bloqueados (chave_idempotente, motivo)
  WHERE chave_idempotente IS NOT NULL;

CREATE INDEX regras_campanha_tipo_idx ON public.regras (campanha_id, tipo_evento);

-- ---------------------------------------------------------------------------
-- 2. Concessão de crédito
-- ---------------------------------------------------------------------------

-- Processa um evento e devolve o que aconteceu com ele. É idempotente: chamar
-- duas vezes para o mesmo evento credita uma vez só, porque `creditos` tem
-- UNIQUE (evento_id, campanha_id).
--
-- Leitura das colunas de `regras`, para não restar dúvida:
--   quantidade         números concedidos na primeira vez
--   carencia_dias      janela em que o MESMO gatilho não volta a pagar. É o que
--                      impede o ciclo cancelar-e-voltar de virar fábrica de
--                      números.
--   limite_meses       teto de quantas vezes este gatilho paga na campanha
--   bonus_a_cada_meses / bonus_quantidade / teto_quantidade
--                      a escada do bom pagador: a cada N meses em dia soma-se
--                      um bônus, até um teto.
CREATE OR REPLACE FUNCTION public.conceder_creditos(p_evento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento public.eventos%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_campanha public.campanhas%ROWTYPE;
  v_regra public.regras%ROWTYPE;
  v_data date;
  v_ordem integer;
  v_passos integer;
  v_quantidade integer;
  v_creditados integer;
  v_motivo text;
  v_detalhe text;
BEGIN
  SELECT * INTO v_evento FROM public.eventos WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'evento_inexistente');
  END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id = v_evento.cliente_id;
  IF NOT FOUND OR v_cliente.autoexcluido_em IS NOT NULL THEN
    v_motivo := 'cliente_inelegivel';
    v_detalhe := 'Cliente autoexcluído dos sorteios ou fora da base.';
  END IF;

  v_data := (v_evento.ocorrido_em AT TIME ZONE 'America/Sao_Paulo')::date;

  IF v_motivo IS NULL THEN
    -- Só campanha aberta credita. Evento de fora da janela fica registrado
    -- como bloqueado, não some.
    SELECT * INTO v_campanha
      FROM public.campanhas
     WHERE status = 'aberta' AND v_data BETWEEN inicio AND fim
     ORDER BY inicio DESC
     LIMIT 1;

    IF NOT FOUND THEN
      v_motivo := 'fora_de_campanha';
      v_detalhe := format('Evento de %s não cai em nenhuma campanha aberta.', v_data);
    END IF;
  END IF;

  IF v_motivo IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.creditos
       WHERE evento_id = v_evento.id AND campanha_id = v_campanha.id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'ja_creditado');
    END IF;

    SELECT * INTO v_regra
      FROM public.regras
     WHERE campanha_id = v_campanha.id AND tipo_evento = v_evento.tipo;

    IF NOT FOUND THEN
      v_motivo := 'sem_regra';
      v_detalhe := format('A campanha não define peso para o gatilho %s.', v_evento.tipo);
    END IF;
  END IF;

  IF v_motivo IS NULL AND v_regra.carencia_dias > 0 THEN
    IF EXISTS (
      SELECT 1
        FROM public.creditos c
        JOIN public.eventos e ON e.id = c.evento_id
       WHERE c.cliente_id = v_cliente.id
         AND e.tipo = v_evento.tipo
         AND e.id <> v_evento.id
         AND e.ocorrido_em > v_evento.ocorrido_em - make_interval(days => v_regra.carencia_dias)
    ) THEN
      v_motivo := 'carencia_reativacao';
      v_detalhe := format(
        'O mesmo gatilho já pagou nos últimos %s dias.',
        v_regra.carencia_dias
      );
    END IF;
  END IF;

  IF v_motivo IS NULL AND v_regra.limite_meses IS NOT NULL THEN
    SELECT count(*) INTO v_creditados
      FROM public.creditos c
      JOIN public.eventos e ON e.id = c.evento_id
     WHERE c.cliente_id = v_cliente.id
       AND c.campanha_id = v_campanha.id
       AND e.tipo = v_evento.tipo;

    IF v_creditados >= v_regra.limite_meses THEN
      v_motivo := 'limite_por_cpf';
      v_detalhe := format(
        'Este gatilho já pagou %s de %s vezes permitidas na campanha.',
        v_creditados, v_regra.limite_meses
      );
    END IF;
  END IF;

  IF v_motivo IS NOT NULL THEN
    INSERT INTO public.eventos_bloqueados
      (cliente_id, tipo, motivo, detalhe, chave_idempotente, ocorrido_em)
    VALUES
      (v_evento.cliente_id, v_evento.tipo, v_motivo, v_detalhe,
       v_evento.chave_idempotente, v_evento.ocorrido_em)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', false, 'motivo', v_motivo, 'detalhe', v_detalhe);
  END IF;

  -- Escada do bom pagador. Para mensalidade em dia, a posição na escada é a
  -- contagem de meses seguidos em dia que o ERP informa; para os demais
  -- gatilhos não há escada, então a posição é sempre a primeira.
  v_ordem := CASE
    WHEN v_evento.tipo = 'mensalidade_em_dia' THEN greatest(coalesce(v_cliente.meses_em_dia, 1), 1)
    ELSE 1
  END;

  v_passos := CASE
    WHEN v_regra.bonus_a_cada_meses > 0
      THEN floor((v_ordem - 1)::numeric / v_regra.bonus_a_cada_meses)::integer
    ELSE 0
  END;

  v_quantidade := v_regra.quantidade + v_passos * v_regra.bonus_quantidade;
  IF v_regra.teto_quantidade IS NOT NULL THEN
    v_quantidade := least(v_quantidade, v_regra.teto_quantidade);
  END IF;

  IF v_quantidade <= 0 THEN
    INSERT INTO public.eventos_bloqueados
      (cliente_id, tipo, motivo, detalhe, chave_idempotente, ocorrido_em)
    VALUES
      (v_evento.cliente_id, v_evento.tipo, 'peso_zerado',
       'A regra desta campanha concede zero número para este gatilho.',
       v_evento.chave_idempotente, v_evento.ocorrido_em)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', false, 'motivo', 'peso_zerado');
  END IF;

  INSERT INTO public.creditos
    (cliente_id, evento_id, campanha_id, quantidade, regra_id, detalhe)
  VALUES
    (v_evento.cliente_id, v_evento.id, v_campanha.id, v_quantidade, v_regra.id,
     jsonb_build_object(
       'base', v_regra.quantidade,
       'ordem', v_ordem,
       'passos', v_passos,
       'bonus_por_passo', v_regra.bonus_quantidade,
       'teto', v_regra.teto_quantidade
     ))
  ON CONFLICT (evento_id, campanha_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'quantidade', v_quantidade,
    'campanha_id', v_campanha.id
  );
END;
$$;

-- Passa por todos os eventos que ainda não viraram crédito nem bloqueio.
-- Serve para carga inicial e para a tela de sincronização do painel.
CREATE OR REPLACE FUNCTION public.processar_eventos_pendentes(p_limite integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_resultado jsonb;
  v_creditados integer := 0;
  v_bloqueados integer := 0;
  v_ignorados integer := 0;
BEGIN
  FOR v_id IN
    SELECT e.id
      FROM public.eventos e
     WHERE NOT EXISTS (SELECT 1 FROM public.creditos c WHERE c.evento_id = e.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.eventos_bloqueados b
          WHERE b.chave_idempotente = e.chave_idempotente
       )
     ORDER BY e.ocorrido_em
     LIMIT p_limite
  LOOP
    v_resultado := public.conceder_creditos(v_id);
    IF (v_resultado ->> 'ok')::boolean THEN
      v_creditados := v_creditados + 1;
    ELSIF v_resultado ->> 'motivo' = 'ja_creditado' THEN
      v_ignorados := v_ignorados + 1;
    ELSE
      v_bloqueados := v_bloqueados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'creditados', v_creditados,
    'bloqueados', v_bloqueados,
    'ignorados', v_ignorados
  );
END;
$$;

-- Evento novo credita sozinho. Quando o conector do ERP chegar, ele só precisa
-- inserir em `eventos` — o resto acontece aqui.
CREATE OR REPLACE FUNCTION public.creditar_evento_novo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.conceder_creditos(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER eventos_creditam
  AFTER INSERT ON public.eventos
  FOR EACH ROW EXECUTE FUNCTION public.creditar_evento_novo();

-- ---------------------------------------------------------------------------
-- 3. Apuração
-- ---------------------------------------------------------------------------

-- Uma campanha aberta por vez. Sem isto, duas campanhas abertas fazem o mesmo
-- evento cair em qualquer uma das duas.
CREATE UNIQUE INDEX campanhas_uma_aberta_idx
  ON public.campanhas (status)
  WHERE status = 'aberta';

-- A busca do ganhador: sobe a partir do número sorteado até achar o primeiro
-- número com dono e, ao chegar ao fim da cartela, recomeça do zero. É o que a
-- tela de resultado promete ao cliente desde o começo.
--
-- Uma vez apurada, a campanha trava: chamar de novo devolve erro em vez de
-- trocar o ganhador.
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
  SELECT * INTO v_campanha FROM public.campanhas WHERE id = p_campanha_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Campanha não encontrada.');
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

  -- Os últimos dígitos do 1º prêmio, na largura da cartela.
  v_base := right(lpad(v_primeiro, v_campanha.digitos_cartela, '0'), v_campanha.digitos_cartela)::integer;

  SELECT n.numero, n.cliente_id INTO v_numero, v_ganhador
    FROM public.numeros n
   WHERE n.campanha_id = p_campanha_id AND n.numero >= v_base
   ORDER BY n.numero
   LIMIT 1;

  IF NOT FOUND THEN
    -- Passou do fim da cartela: continua do começo.
    SELECT n.numero, n.cliente_id INTO v_numero, v_ganhador
      FROM public.numeros n
     WHERE n.campanha_id = p_campanha_id
     ORDER BY n.numero
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum número foi escolhido nesta campanha.');
  END IF;

  UPDATE public.campanhas
     SET numero_sorteado = v_numero,
         ganhador_cliente_id = v_ganhador,
         status = 'apurada',
         extracao_federal = jsonb_build_object(
           'concurso', p_concurso,
           'data', p_data_extracao,
           'premios', to_jsonb(p_premios),
           'numero_base', v_base,
           'apurado_em', now()
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

-- ---------------------------------------------------------------------------
-- 4. Pesos congelados e trilha de auditoria
-- ---------------------------------------------------------------------------

-- O critério de apuração já era protegido na aplicação. Os pesos, que decidem
-- quantos números cada cliente ganha, não eram — e são o que realmente importa.
-- A trava fica no banco para valer mesmo se a aplicação errar.
CREATE OR REPLACE FUNCTION public.travar_regras_congeladas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_campanha_id uuid := coalesce(NEW.campanha_id, OLD.campanha_id);
  v_status public.status_campanha;
BEGIN
  SELECT status INTO v_status FROM public.campanhas WHERE id = v_campanha_id;

  IF v_status IS DISTINCT FROM 'rascunho' THEN
    RAISE EXCEPTION
      'Os pesos desta campanha estão congelados desde a abertura e não podem mudar.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER regras_congeladas
  BEFORE INSERT OR UPDATE OR DELETE ON public.regras
  FOR EACH ROW EXECUTE FUNCTION public.travar_regras_congeladas();

CREATE TABLE public.auditoria_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  acao text NOT NULL,
  alvo text,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_admin_criado_idx ON public.auditoria_admin (criado_em DESC);
GRANT SELECT ON public.auditoria_admin TO authenticated;
GRANT ALL ON public.auditoria_admin TO service_role;
ALTER TABLE public.auditoria_admin ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le auditoria" ON public.auditoria_admin
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.registrar_auditoria(
  p_acao text,
  p_alvo text DEFAULT NULL,
  p_antes jsonb DEFAULT NULL,
  p_depois jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores registram auditoria.';
  END IF;

  INSERT INTO public.auditoria_admin (user_id, email, acao, alvo, antes, depois)
  VALUES (
    auth.uid(),
    (SELECT email FROM public.perfis WHERE user_id = auth.uid()),
    p_acao, p_alvo, p_antes, p_depois
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissões
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.conceder_creditos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.processar_eventos_pendentes(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apurar_campanha(uuid, text, date, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_auditoria(text, text, jsonb, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.conceder_creditos(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.processar_eventos_pendentes(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.apurar_campanha(uuid, text, date, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria(text, text, jsonb, jsonb) TO authenticated, service_role;
