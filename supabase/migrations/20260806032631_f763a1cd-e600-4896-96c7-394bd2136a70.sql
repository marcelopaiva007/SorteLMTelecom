-- perfis
CREATE TABLE public.perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text,
  papel text NOT NULL DEFAULT 'admin',
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.perfis TO authenticated;
GRANT ALL ON public.perfis TO service_role;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis WHERE user_id = _user_id AND papel = 'admin'
  );
$$;

CREATE POLICY "perfil proprio" ON public.perfis FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin le perfis" ON public.perfis FOR SELECT TO authenticated USING (public.is_admin());

-- configuracoes
CREATE TABLE public.configuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  valor text NOT NULL,
  descricao text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.configuracoes TO authenticated;
GRANT SELECT ON public.configuracoes TO anon;
GRANT ALL ON public.configuracoes TO service_role;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "configuracoes sao publicas" ON public.configuracoes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin edita configuracoes" ON public.configuracoes FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin cria configuracoes" ON public.configuracoes FOR INSERT TO authenticated WITH CHECK (public.is_admin());

INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('cnpj', '12.345.678/0001-90', 'CNPJ exibido no selo de campanha oficial'),
  ('razao_social', 'LM Telecom Provedor de Internet LTDA', 'Razão social exibida no selo');

-- eventos bloqueados pelas travas
CREATE TABLE public.eventos_bloqueados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo tipo_evento NOT NULL,
  motivo text NOT NULL,
  detalhe text,
  chave_idempotente text,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.eventos_bloqueados TO authenticated;
GRANT ALL ON public.eventos_bloqueados TO service_role;
ALTER TABLE public.eventos_bloqueados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le bloqueados" ON public.eventos_bloqueados FOR SELECT TO authenticated USING (public.is_admin());

-- histórico de sincronizações com o ERP
CREATE TABLE public.sincronizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL DEFAULT 'aguardando_conector_erp',
  status text NOT NULL DEFAULT 'sucesso',
  clientes_lidos integer NOT NULL DEFAULT 0,
  eventos_lidos integer NOT NULL DEFAULT 0,
  duplicados_barrados integer NOT NULL DEFAULT 0,
  erro text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  terminado_em timestamptz
);
GRANT SELECT ON public.sincronizacoes TO authenticated;
GRANT ALL ON public.sincronizacoes TO service_role;
ALTER TABLE public.sincronizacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le sincronizacoes" ON public.sincronizacoes FOR SELECT TO authenticated USING (public.is_admin());

-- escada do bom pagador nas regras
ALTER TABLE public.regras
  ADD COLUMN bonus_a_cada_meses integer NOT NULL DEFAULT 0,
  ADD COLUMN bonus_quantidade integer NOT NULL DEFAULT 0,
  ADD COLUMN teto_quantidade integer;

UPDATE public.regras SET bonus_a_cada_meses = 6, bonus_quantidade = 1, teto_quantidade = 6
  WHERE tipo_evento = 'mensalidade_em_dia';

-- administradores podem editar campanhas e regras
CREATE POLICY "admin edita campanhas" ON public.campanhas FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin cria campanhas" ON public.campanhas FOR INSERT TO authenticated WITH CHECK (public.is_admin());
GRANT INSERT, UPDATE ON public.campanhas TO authenticated;

CREATE POLICY "admin edita regras" ON public.regras FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin cria regras" ON public.regras FOR INSERT TO authenticated WITH CHECK (public.is_admin());
GRANT INSERT, UPDATE ON public.regras TO authenticated;

-- leitura administrativa das tabelas operacionais
GRANT SELECT ON public.clientes TO authenticated;
GRANT SELECT ON public.creditos TO authenticated;
GRANT SELECT ON public.eventos TO authenticated;
GRANT SELECT ON public.numeros TO authenticated;
CREATE POLICY "admin le clientes" ON public.clientes FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin le creditos" ON public.creditos FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin le eventos" ON public.eventos FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin le numeros" ON public.numeros FOR SELECT TO authenticated USING (public.is_admin());