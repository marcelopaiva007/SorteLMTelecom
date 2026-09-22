# Sorte Fibra LM

**Sistema de Sorteios para Clientes L&M Telecom**

Plataforma de sorteios gratuitos onde clientes ganham números por comportamento (assinar plano, pagar em dia, quitar débito) e escolhem quais números desejam participar — sem compra, sem urgência, apenas confiança.

## Stack Técnico

- **Frontend:** TanStack Start + React 19 + TypeScript + Tailwind CSS
- **Backend:** Nitro (Vite) com SSR
- **Database:** Supabase (PostgreSQL) + RLS
- **Auth:** Supabase Auth + WhatsApp verification
- **UI:** shadcn/ui + Radix UI

## Setup Local

### Pré-requisitos
- Node.js 20+ ou Bun
- Git

### Instalação

```bash
# Clone e entre no diretório
git clone https://github.com/marcelopaiva007/SorteLMTelecom.git
cd SorteLMTelecom

# Instale dependências (npm ou bun)
npm install
# ou
bun install

# Configure variáveis de ambiente
cp .env.example .env.local
# Edite .env.local e preencha SUPABASE_SERVICE_ROLE_KEY
```

### Variáveis de Ambiente

Copie `.env.example` para `.env.local` e preencha:

```env
SUPABASE_URL=https://oiamktffakkqfhvprjns.supabase.co
SUPABASE_PROJECT_ID=oiamktffakkqfhvprjns
VITE_SUPABASE_URL=https://oiamktffakkqfhvprjns.supabase.co
VITE_SUPABASE_PROJECT_ID=oiamktffakkqfhvprjns
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_bXqeCK-lv2LMhYLxYYCc9A_Ho73TF1I
SUPABASE_SERVICE_ROLE_KEY=<sua_chave_service_role>
```

A chave `SUPABASE_SERVICE_ROLE_KEY` está no painel do Supabase: **Settings → API → Service role**.

### Desenvolvimento

```bash
# Inicia dev server (hot reload)
npm run dev

# Acessa em http://localhost:5173
```

### Build

```bash
# Build otimizado para produção
npm run build

# Preview da build
npm run preview
```

## Estrutura do Projeto

```
src/
├── routes/           # Páginas TanStack Router
│  ├── index.tsx     # Entrada (login CPF/CNPJ + código)
│  ├── saldo.tsx     # Saldo de créditos do cliente
│  ├── cartela.tsx   # Grade de números para escolher
│  ├── meus-numeros.tsx
│  ├── resultado.tsx
│  ├── ajustes.tsx
│  └── painel.tsx    # Admin dashboard
├── components/
│  ├── lm/           # Componentes específicos do Sorte LM
│  │  └── admin/AbaApostas.tsx  # Controle de apostas multi-jogador
│  └── ui/           # UI components (shadcn)
├── lib/
│  ├── sorteio.functions.ts
│  ├── sorteio.server.ts
│  ├── admin.functions.ts
│  ├── apostas.ts            # Regras puras das apostas (leitura de números, valores)
│  └── apostas.functions.ts  # Registro e controle das apostas do pleito
├── integrations/supabase/
│  ├── client.ts     # Cliente Supabase (browser)
│  ├── client.server.ts
│  └── auth-middleware.ts
└── server.ts        # Entrada do servidor (Nitro)

supabase/
├── config.toml      # Config local do Supabase
└── migrations/      # Migrations do banco de dados
```

## Banco de Dados (Supabase)

### Tabelas Principais

- **clientes** - Dados de clientes da L&M Telecom (CPF/CNPJ, status, créditos)
- **campanhas** - Definição de campanhas de sorteio (prêmio, datas, cartela)
- **creditos** - Créditos ganhos por cliente (assinar, pagar em dia, quitar débito)
- **numeros** - Números escolhidos pelos clientes na cartela
- **eventos** - Log de eventos (assinar, pagar, quitar) com idempotência
- **jogadores** - Participantes das apostas (cliente da L&M ou não)
- **apostas** - Apostas registradas no pleito (protocolo, canal, situação, valor)
- **aposta_numeros** - Números de cada aposta, um dono por número no pleito

### RLS (Row Level Security)

- Clientes leem apenas seus dados
- Cartela expõe quais números estão ocupados (anônimo)
- Só Edge Functions escrevem em `creditos`

## Controle de Apostas (multi-jogador)

Um **pleito** é uma campanha. O módulo registra as apostas de vários jogadores
nesse pleito e mantém o controle de quem ficou com o quê.

### Como funciona

1. **Jogador** - quem aposta. Pode ser cliente da L&M (ligado a `clientes`) ou
   alguém cadastrado no balcão. CPF/CNPJ repetido reaproveita o cadastro.
2. **Aposta** - um jogador, N números, um protocolo (`AP-AAMMDD-00001`), o canal
   (balcão, WhatsApp, app, importação) e a situação (registrada, confirmada,
   cancelada).
3. **Números** - exclusivos dentro do pleito. O mesmo número nunca fica com dois
   jogadores, e a cartela de créditos (`numeros`) entra na mesma checagem: o
   pleito não termina com dois donos do número sorteado.
4. **Cancelamento** - devolve os números do jogador para a cartela e guarda o
   motivo. Nada é apagado; o histórico fica para auditoria.

### Travas do banco

Todas valem mesmo que alguém escreva direto no Supabase:

- `aposta_numeros_pleito_unico` - índice parcial com um dono por número ativo
- `registrar_aposta(...)` - grava aposta e números numa transação só
- número fora da cartela do pleito é recusado (`digitos_cartela`)
- pleito `encerrada`/`apurada` não aceita aposta nova
- RLS: só administradores (`is_admin()`) leem e escrevem

### Ajustes (tabela `configuracoes`)

- `apostas_limite_por_jogador` - teto de números por jogador no pleito (0 = sem limite)
- `apostas_valor_por_numero` - valor sugerido por número ao registrar (0 = sem cobrança)

### Onde fica

Painel administrativo → aba **Apostas**: indicadores do pleito, registro de
aposta (com "sorte da casa" e conferência dos números ocupados), ranking dos
jogadores, lista de apostas com busca e exportação em CSV.

## Deploy

### Vercel (Recomendado)

1. **Conectar GitHub:**
   - Vá para https://vercel.com
   - Clique em "Add New Project"
   - Selecione `marcelopaiva007/SorteLMTelecom`

2. **Configurar variáveis de ambiente:**
   - No painel do Vercel, vá para **Settings → Environment Variables**
   - Adicione as variáveis do `.env.example`
   - **Importante:** `SUPABASE_SERVICE_ROLE_KEY` vem do painel Supabase

3. **Deploy:**
   - Clique em "Deploy"
   - Espere 2-3 minutos

4. **Domínio:**
   - URL padrão: `sortelmtelecom.vercel.app`
   - Configure domínio customizado em Settings → Domains

### Redeploy Automático

Todo push para `main` no GitHub redeploya automaticamente no Vercel.

## Segurança

- ✅ RLS ativado no Supabase
- ✅ Service role key nunca commitado
- ✅ CPF/CNPJ não expostos em cartela
- ✅ Verificação por WhatsApp (simula envio)
- ✅ Sem compra, sem payment gateway

## Telas do Cliente

1. **Entrada** - CPF/CNPJ + código (6 dígitos)
2. **Meu Saldo** - Saldo destacado + origem dos créditos
3. **Cartela** - Grade de números (ocupados riscados, escolhidos com borda)
4. **Meus Números** - Histórico de números escolhidos
5. **Resultado** - Número sorteado + ganhador
6. **Ajustes** - Regulamento, autoexclusão

## Admin Dashboard

Acesso via `/painel`:
- Gerenciamento de campanhas
- Controle de apostas multi-jogador do pleito
- Sincronização com ERP
- Auditoria de eventos
- Efeitos de crédito
- Pesos (nunca alterar após início)

## Variáveis de Ambiente por Ambiente

### Desenvolvimento (.env.local)
```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=<sua_chave>
# Outras variáveis
```

### Vercel (Settings → Environment Variables)
- `SUPABASE_URL`
- `SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Scripts Disponíveis

```bash
npm run dev           # Desenvolvimento (hot reload)
npm run build         # Build otimizado
npm run preview       # Visualizar build local
npm run lint          # ESLint
npm run format        # Prettier
```

## Contato & Suporte

Projeto criado com Lovable + TanStack Start. Integração com L&M Telecom Supabase.

---

**Deploy em produção:** https://vercel.com  
**Gerenciador de banco:** https://supabase.com  
**Repositório:** https://github.com/marcelopaiva007/SorteLMTelecom
