-- Controle de apostas multi-jogador do pleito.
--
-- Um pleito é uma campanha (public.campanhas). Cada jogador registra apostas
-- nesse pleito e cada aposta carrega os números apostados. Os números são
-- exclusivos dentro do pleito: dois jogadores nunca ficam com o mesmo número,
-- e a cartela de créditos (public.numeros) entra na mesma checagem para que o
-- pleito não termine com dois donos do número sorteado.
--
-- Cancelar uma aposta devolve os números dela para o pleito; o histórico fica
-- registrado (quem registrou, quando, por qual canal e por que foi cancelada).

CREATE TYPE public.status_aposta AS ENUM ('registrada', 'confirmada', 'cancelada');
CREATE TYPE public.canal_aposta AS ENUM ('balcao', 'whatsapp', 'app', 'importacao');

-- jogadores ------------------------------------------------------------------
-- Participante do pleito. Pode ser cliente da L&M (cliente_id preenchido) ou
-- alguém de fora, registrado no balcão.
CREATE TABLE public.jogadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  apelido text,
  documento text,
  whatsapp text,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX jogadores_documento_unico
  ON public.jogadores (documento)
  WHERE documento IS NOT NULL;
CREATE INDEX jogadores_nome_idx ON public.jogadores (lower(nome));
GRANT SELECT, INSERT, UPDATE ON public.jogadores TO authenticated;
GRANT ALL ON public.jogadores TO service_role;
ALTER TABLE public.jogadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le jogadores" ON public.jogadores
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin cria jogadores" ON public.jogadores
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin edita jogadores" ON public.jogadores
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- apostas --------------------------------------------------------------------
CREATE TABLE public.apostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  jogador_id uuid NOT NULL REFERENCES public.jogadores(id) ON DELETE CASCADE,
  protocolo text NOT NULL UNIQUE,
  quantidade integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  valor_total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  canal public.canal_aposta NOT NULL DEFAULT 'balcao',
  status public.status_aposta NOT NULL DEFAULT 'registrada',
  observacao text,
  registrada_por uuid,
  registrada_por_email text,
  registrada_em timestamptz NOT NULL DEFAULT now(),
  cancelada_em timestamptz,
  cancelada_por uuid,
  motivo_cancelamento text
);
CREATE INDEX apostas_pleito_idx ON public.apostas (campanha_id, registrada_em DESC);
CREATE INDEX apostas_jogador_idx ON public.apostas (campanha_id, jogador_id);
GRANT SELECT, INSERT, UPDATE ON public.apostas TO authenticated;
GRANT ALL ON public.apostas TO service_role;
ALTER TABLE public.apostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le apostas" ON public.apostas
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin cria apostas" ON public.apostas
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin edita apostas" ON public.apostas
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- números da aposta ----------------------------------------------------------
-- ativo = false quando a aposta é cancelada; o índice parcial abaixo é o que
-- garante um único dono por número enquanto a aposta vale.
CREATE TABLE public.aposta_numeros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aposta_id uuid NOT NULL REFERENCES public.apostas(id) ON DELETE CASCADE,
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX aposta_numeros_pleito_unico
  ON public.aposta_numeros (campanha_id, numero)
  WHERE ativo;
CREATE INDEX aposta_numeros_aposta_idx ON public.aposta_numeros (aposta_id);
GRANT SELECT, INSERT, UPDATE ON public.aposta_numeros TO authenticated;
GRANT ALL ON public.aposta_numeros TO service_role;
ALTER TABLE public.aposta_numeros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le aposta_numeros" ON public.aposta_numeros
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin cria aposta_numeros" ON public.aposta_numeros
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin edita aposta_numeros" ON public.aposta_numeros
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- integridade do número dentro do pleito -------------------------------------
CREATE OR REPLACE FUNCTION public.aposta_numero_valido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campanha_id uuid;
  v_digitos integer;
  v_status public.status_campanha;
  v_dono text;
BEGIN
  SELECT a.campanha_id INTO v_campanha_id FROM public.apostas a WHERE a.id = NEW.aposta_id;
  IF v_campanha_id IS NULL THEN
    RAISE EXCEPTION 'Aposta % não encontrada.', NEW.aposta_id;
  END IF;
  -- o pleito do número é sempre o da aposta, nunca outro
  NEW.campanha_id := v_campanha_id;

  SELECT c.digitos_cartela, c.status INTO v_digitos, v_status
  FROM public.campanhas c WHERE c.id = v_campanha_id;

  IF v_status IN ('encerrada', 'apurada') THEN
    RAISE EXCEPTION 'O pleito já foi encerrado; não aceita novas apostas.';
  END IF;

  IF NEW.numero >= power(10, v_digitos)::integer THEN
    RAISE EXCEPTION 'Número % fora da cartela do pleito (0 a %).',
      NEW.numero, power(10, v_digitos)::integer - 1;
  END IF;

  SELECT cl.nome INTO v_dono
  FROM public.numeros n
  JOIN public.clientes cl ON cl.id = n.cliente_id
  WHERE n.campanha_id = v_campanha_id AND n.numero = NEW.numero;
  IF v_dono IS NOT NULL THEN
    RAISE EXCEPTION 'Número % já está na cartela de créditos de %.', NEW.numero, v_dono;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER aposta_numeros_valida
  BEFORE INSERT ON public.aposta_numeros
  FOR EACH ROW EXECUTE FUNCTION public.aposta_numero_valido();

-- a cartela de créditos também respeita os números já apostados
CREATE OR REPLACE FUNCTION public.numero_livre_de_aposta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.aposta_numeros an
    WHERE an.campanha_id = NEW.campanha_id AND an.numero = NEW.numero AND an.ativo
  ) THEN
    RAISE EXCEPTION 'Número % já foi apostado neste pleito.', NEW.numero;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER numeros_livre_de_aposta
  BEFORE INSERT ON public.numeros
  FOR EACH ROW EXECUTE FUNCTION public.numero_livre_de_aposta();

-- quantidade da aposta sempre igual aos números ativos dela ------------------
CREATE OR REPLACE FUNCTION public.sincronizar_quantidade_aposta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta_id uuid := COALESCE(NEW.aposta_id, OLD.aposta_id);
BEGIN
  UPDATE public.apostas a
  SET quantidade = (
    SELECT count(*) FROM public.aposta_numeros an
    WHERE an.aposta_id = v_aposta_id AND an.ativo
  )
  WHERE a.id = v_aposta_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER aposta_numeros_sincroniza_quantidade
  AFTER INSERT OR UPDATE OF ativo OR DELETE ON public.aposta_numeros
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_quantidade_aposta();

-- cancelar devolve os números; reabrir tenta retomá-los -----------------------
CREATE OR REPLACE FUNCTION public.aplicar_status_aposta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
    NEW.cancelada_em := COALESCE(NEW.cancelada_em, now());
  ELSIF NEW.status <> 'cancelada' AND OLD.status = 'cancelada' THEN
    NEW.cancelada_em := NULL;
    NEW.cancelada_por := NULL;
    NEW.motivo_cancelamento := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER apostas_aplica_status
  BEFORE UPDATE OF status ON public.apostas
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_status_aposta();

CREATE OR REPLACE FUNCTION public.liberar_numeros_da_aposta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- o índice parcial barra a reabertura se o número já foi para outro jogador
    UPDATE public.aposta_numeros
    SET ativo = (NEW.status <> 'cancelada')
    WHERE aposta_id = NEW.id AND ativo <> (NEW.status <> 'cancelada');
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER apostas_libera_numeros
  AFTER UPDATE OF status ON public.apostas
  FOR EACH ROW EXECUTE FUNCTION public.liberar_numeros_da_aposta();

-- ajustes do módulo ----------------------------------------------------------
INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('apostas_limite_por_jogador', '0',
   'Máximo de números por jogador no pleito. 0 = sem limite.'),
  ('apostas_valor_por_numero', '0',
   'Valor informado por número ao registrar uma aposta. 0 = sem cobrança.')
ON CONFLICT (chave) DO NOTHING;

-- registro atômico da aposta -------------------------------------------------
-- Uma aposta e seus números entram numa transação só: se um número já era de
-- outro jogador, nada é gravado e o operador recebe o motivo.
CREATE SEQUENCE public.apostas_protocolo_seq;

CREATE OR REPLACE FUNCTION public.registrar_aposta(
  _campanha_id uuid,
  _jogador_id uuid,
  _numeros integer[],
  _canal public.canal_aposta DEFAULT 'balcao',
  _valor_total numeric DEFAULT 0,
  _observacao text DEFAULT NULL,
  _registrada_por_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.status_campanha;
  v_limite integer;
  v_ja_tem integer;
  v_protocolo text;
  v_aposta_id uuid;
  v_quantidade integer;
  v_conflitos text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  SELECT status INTO v_status FROM public.campanhas WHERE id = _campanha_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Pleito não encontrado.';
  END IF;
  IF v_status IN ('encerrada', 'apurada') THEN
    RAISE EXCEPTION 'O pleito já foi encerrado; não aceita novas apostas.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jogadores WHERE id = _jogador_id AND ativo) THEN
    RAISE EXCEPTION 'Jogador não encontrado ou inativo.';
  END IF;

  SELECT count(DISTINCT n) INTO v_quantidade FROM unnest(_numeros) AS n;
  IF v_quantidade = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um número.';
  END IF;

  SELECT COALESCE(NULLIF(valor, '')::integer, 0) INTO v_limite
  FROM public.configuracoes WHERE chave = 'apostas_limite_por_jogador';

  IF COALESCE(v_limite, 0) > 0 THEN
    SELECT COALESCE(sum(a.quantidade), 0) INTO v_ja_tem
    FROM public.apostas a
    WHERE a.campanha_id = _campanha_id
      AND a.jogador_id = _jogador_id
      AND a.status <> 'cancelada';
    IF v_ja_tem + v_quantidade > v_limite THEN
      RAISE EXCEPTION 'Limite de % números por jogador neste pleito (o jogador já tem %).',
        v_limite, v_ja_tem;
    END IF;
  END IF;

  -- conflito conhecido vira mensagem legível; o índice parcial cobre a corrida
  SELECT string_agg(x.n::text, ', ' ORDER BY x.n) INTO v_conflitos
  FROM (
    SELECT DISTINCT n
    FROM unnest(_numeros) AS n
    WHERE EXISTS (
            SELECT 1 FROM public.aposta_numeros an
            WHERE an.campanha_id = _campanha_id AND an.numero = n AND an.ativo
          )
       OR EXISTS (
            SELECT 1 FROM public.numeros nu
            WHERE nu.campanha_id = _campanha_id AND nu.numero = n
          )
    LIMIT 12
  ) x;
  IF v_conflitos IS NOT NULL THEN
    RAISE EXCEPTION 'Estes números já têm dono neste pleito: %.', v_conflitos;
  END IF;

  v_protocolo := 'AP-'
    || to_char(timezone('America/Sao_Paulo', now()), 'YYMMDD')
    || '-'
    || lpad(nextval('public.apostas_protocolo_seq')::text, 5, '0');

  INSERT INTO public.apostas (
    campanha_id, jogador_id, protocolo, valor_total, canal, observacao,
    registrada_por, registrada_por_email
  )
  VALUES (
    _campanha_id, _jogador_id, v_protocolo, COALESCE(_valor_total, 0), _canal,
    NULLIF(btrim(COALESCE(_observacao, '')), ''), auth.uid(), _registrada_por_email
  )
  RETURNING id INTO v_aposta_id;

  INSERT INTO public.aposta_numeros (aposta_id, campanha_id, numero)
  SELECT DISTINCT v_aposta_id, _campanha_id, n FROM unnest(_numeros) AS n;

  RETURN jsonb_build_object(
    'aposta_id', v_aposta_id,
    'protocolo', v_protocolo,
    'quantidade', v_quantidade
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_aposta(uuid, uuid, integer[], public.canal_aposta, numeric, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_aposta(uuid, uuid, integer[], public.canal_aposta, numeric, text, text)
  TO authenticated, service_role;
