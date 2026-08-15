# Sorte Fibra LM — Auditoria para tomada de decisão

Base: commit `178b855` · Análise em 15/08/2026

---

## Veredito

**O sistema é hoje uma demonstração navegável, não um produto operável.** As telas existem e
são boas. O motor que faz um sorteio funcionar — conceder números, apurar o ganhador,
conversar com o ERP — ainda não foi escrito.

Isso foi verificado no código, não deduzido: nada no sistema escreve em `creditos`,
`eventos`, `eventos_bloqueados` ou `sincronizacoes`, e nada grava `numero_sorteado` ou
`ganhador_cliente_id`. Os créditos que aparecem nas telas vieram todos do seed da migration.

---

## 1. O que existe e o que falta

| Peça | Situação |
|---|---|
| 7 telas do cliente + 6 abas do painel | ✅ Prontas e coerentes |
| Modelo de dados (idempotência, RLS, regras) | ✅ Bem desenhado |
| Login por CPF + código | ⚠️ Existe, mas inseguro (§2) |
| Escolha de números na cartela | ⚠️ Existe, mas com corrida e sem trava de campanha |
| **Motor de créditos** (evento → número) | ❌ **Não existe** |
| **Apuração** (Loteria Federal → ganhador) | ❌ **Não existe** |
| **Conector do ERP** | ❌ Não existe |
| **Envio de WhatsApp** | ❌ Simulado |
| Multi-campanha | ❌ Cliente está preso a uma campanha fixa no código |

**Consequência prática para o negócio:** o painel deixa o gestor editar os "pesos dos
gatilhos", mas **nenhuma linha de código lê essa tabela para conceder créditos**. Mudar os
pesos hoje não muda nada. O mesmo vale para a aba de eventos bloqueados e para a de
sincronização — telas prontas para dados que ninguém produz.

---

## 2. Os 5 riscos que impedem ir ao ar

Em ordem de gravidade. Os três primeiros são impeditivos absolutos.

**1. Qualquer pessoa que saiba um CPF entra na conta do cliente.**
O código de 6 dígitos é devolvido ao navegador e impresso na tela
(`sorteio.functions.ts:31`, `index.tsx:126`). CPF não é segredo. Isso é controle total de
conta de terceiro.

**2. A base de clientes pode ser varrida por fora.**
Ao digitar um CPF qualquer, o sistema responde se ele é cliente da LM e devolve **nome e
final do WhatsApp antes de qualquer autenticação**. Serve de lista pronta para golpe contra
os assinantes, e é exposição de dado pessoal sem base legal (LGPD).

**3. Não dá para encerrar uma campanha.**
Sem rotina de apuração, a campanha de agosto/2026 não tem como ser apurada. Se a data
chegar, não há botão, não há função, não há ganhador.

**4. A cartela mostra como livres números que já têm dono.**
O sistema busca todos os números ocupados numa consulta sem paginação, e a API do Supabase
corta em ~1.000 linhas. Com a cartela cheia, o cliente escolhe um número já vendido, o
sistema recusa, e a culpa parece ser dele. Os contadores do painel têm o mesmo defeito.

**5. Falta a autorização legal da promoção.**
Prêmio grátis vinculado a consumo (assinar, pagar em dia, quitar) é promoção comercial na
modalidade sorteio e **depende de autorização prévia da SPA/MF** (Lei 5.768/1971, pedido
pelo sistema SCPC). O número do Certificado de Autorização precisa aparecer em todo material
de divulgação — e o selo do sistema hoje não tem esse campo. Também faltam regulamento
integral, controle de entrega do prêmio e o prazo de prescrição de 180 dias.
*(Não é parecer jurídico — é o que o software precisa suportar para o jurídico aprovar.)*

---

## 3. As decisões que dependem de você

Estas quatro não são técnicas: são de produto. Tudo depois delas é execução.

**Decisão 1 — De onde vêm os eventos do ERP?**
Webhook do ERP empurrando, ou o Sorteio LM puxando por API/arquivo em horário fixo?
*Recomendação: puxar por rotina agendada.* É mais simples de auditar, não depende do ERP
saber falar com a gente, e o histórico de leituras (que o painel já sabe exibir) fica natural.

**Decisão 2 — Qual provedor de WhatsApp?**
Meta Cloud API (mais barato, mais burocrático) ou intermediário tipo Zenvia/Twilio (mais
caro, entra no ar em dias). *Recomendação: intermediário para a primeira campanha.* O código
OTP é o gargalo do sistema inteiro; não vale travar o lançamento em aprovação de template.

**Decisão 3 — Uma campanha por vez, ou várias simultâneas?**
Hoje o código assume uma só, fixa. *Recomendação: uma por vez, mas resolvida por data no
banco.* Custa quase o mesmo que a solução fixa e destrava campanhas futuras sem deploy.

**Decisão 4 — Quando entra o pedido de autorização na SPA/MF?**
Ele leva semanas e trava a divulgação. *Recomendação: iniciar agora, em paralelo ao
desenvolvimento* — é o item de caminho crítico mais longo e o único que não acelera com mais
programador.

---

## 4. Por onde começar

Esforço estimado em semanas de uma pessoa desenvolvedora.

### Onda 1 — Segurança (≈1 semana) — **fazer antes de qualquer cliente real**
- Parar de devolver o código de acesso; integrar WhatsApp.
- Limite de tentativas e resposta neutra no login (fecha os riscos 1 e 2).
- Não enviar CPF completo ao navegador; sessão em cookie seguro com logout que revoga.
- Escolha de números virando transação no banco, com validação da janela da campanha.

### Onda 2 — O motor (≈3 semanas) — **é aqui que o produto nasce**
- Concessão de créditos lendo a tabela `regras` (carência, limite por CPF, escada do bom
  pagador, teto) e registrando o que foi bloqueado e por quê.
- Apuração: registro da extração da Loteria Federal, busca do ganhador com volta ao início
  da cartela, travamento após apurar, botão no painel.
- Trava de edição dos pesos depois que a campanha abre + registro de quem mudou o quê.
  *(Hoje o critério textual é protegido, mas os números que decidem quantos bilhetes cada um
  ganha não são — é justamente a trava que importa.)*
- Campanha resolvida por data, não fixa no código.

### Onda 3 — Escala e confiança (≈2 semanas)
- Corrigir as consultas truncadas em 1.000 linhas (risco 4) e os índices que faltam.
- Campo do Certificado de Autorização, regulamento integral, controle de entrega do prêmio.
- Conector do ERP com histórico de sincronização.

### Onda 4 — Acabamento (≈1 semana)
- Fonte condensada real no celular: hoje `Arial Narrow` não existe em Android nem iOS, então
  **toda a identidade tipográfica cai para Arial comum justamente onde o cliente vai abrir.**
- Corrigir os pesos anunciados na tela de entrada, que dizem metade do que o regulamento
  promete (05/04/03/02 na home contra 10/8/5/3 no banco e no regulamento).
- Telas de erro em português e com estado de erro real (hoje qualquer falha vira
  "Carregando…" para sempre).
- Testes do núcleo (crédito, apuração, corrida) e CI.

**Total até uma campanha real operável: ≈7 semanas de uma pessoa**, com o pedido à SPA/MF
correndo em paralelo desde já.

---

## 5. Anexo técnico — achados por arquivo

Para o time de desenvolvimento. Gravidade: 🔴 impeditivo · 🟠 alto · 🟡 médio.

| Arquivo:linha | Achado | |
|---|---|---|
| `sorteio.functions.ts:31` | Código de acesso devolvido ao cliente | 🔴 |
| `sorteio.functions.ts:35-66` | Sem limite de tentativas — força bruta de 6 dígitos | 🔴 |
| `sorteio.functions.ts:11-30` | Enumeração de CPF + nome e telefone antes do login | 🔴 |
| `sorteio.functions.ts:151-183` | Corrida entre checagem de saldo e insert | 🔴 |
| `sorteio.functions.ts:145-190` | Sem checagem de status/janela da campanha | 🔴 |
| — | Apuração inexistente (nada grava `numero_sorteado`) | 🔴 |
| — | Motor de créditos inexistente (nada grava `creditos`) | 🔴 |
| `sorteio.functions.ts:90,92` | Consulta sem paginação: cartela e participantes errados | 🟠 |
| `admin.functions.ts:21-23,115` | Contadores do painel truncados em ~1.000 linhas | 🟠 |
| `sorteio.functions.ts:124` | CPF completo enviado ao navegador sem uso | 🟠 |
| `sorteio.functions.ts:141` | Faixa fixa `0..9999` vs. `digitos_cartela` de 2 a 6 | 🟠 |
| `sorteio.server.ts:3` | `CAMPANHA_ID` fixo impede multi-campanha | 🟠 |
| `sessao.ts` + `ajustes.tsx:31` | Token em `localStorage`; logout não revoga no servidor | 🟠 |
| `admin.functions.ts:237` | Pesos editáveis com a campanha já aberta | 🟠 |
| `admin.functions.ts` (todo) | Nenhuma auditoria de ação administrativa | 🟠 |
| `cartela.tsx:65` | "Sorte da casa" percorre até 10⁶ posições no navegador | 🟠 |
| `index.tsx:150` | Pesos anunciados contradizem banco e regulamento | 🟠 |
| `styles.css:24` | Fonte condensada indisponível em Android/iOS | 🟠 |
| repo | Sem testes, sem CI, 1.391 erros de formatação | 🟠 |
| `sorteio.functions.ts:170` | Protocolo do comprovante sem `UNIQUE` | 🟡 |
| `sorteio.functions.ts:187` | Erro genérico mascara falha de banco | 🟡 |
| `sorteio.functions.ts:229` | `.eq("id", "")` em coluna uuid quando não há ganhador | 🟡 |
| `admin.functions.ts:26` | "Hoje" calculado em UTC, não em America/Sao_Paulo | 🟡 |
| `admin.functions.ts:76-91` | Busca da auditoria filtra depois do `limit(500)` | 🟡 |
| `cartela.tsx:50` e cia. | Fallback `?? 6` dígitos contra `DEFAULT 4` do banco | 🟡 |
| `saldo.tsx:35-36` | Escada de bônus em código fixo, ignora a tabela `regras` | 🟡 |
| `comprovante.$protocolo.tsx:28` | Sessão expirada → "Carregando…" eterno | 🟡 |
| todas as rotas | `isLoading \|\| !ok` → nenhum estado de erro | 🟡 |
| `__root.tsx:110` | `<html lang="en">` num app inteiramente em português | 🟡 |
| `__root.tsx:16-70` | Telas de 404 e erro em inglês | 🟡 |
| `styles.css:150` | `border-radius: 0 !important` em `*` atropela o shadcn | 🟡 |
| `styles.css:84-119` | Classes `.dark` / `.light` nunca aplicadas — código morto | 🟡 |
| migration 1 | Faltam índices em `creditos`, `codigos_acesso`, `eventos`, `sessoes` | 🟡 |
| migration 2 | `perfis` sem policy de INSERT: admin só via SQL manual | 🟡 |

**Ponto positivo:** `tsc --noEmit` passa sem nenhum erro. A tipagem está saudável e vale
manter assim.

---

### Sobre o Claude Design

Não foi possível usar o Claude Design nesta sessão: a ferramenta exige uma autorização de
design-system que só pode ser concedida em terminal interativo. Para trabalhar o design
system por lá, use **"Send to Claude Code Web"** a partir do projeto no claude.ai/design —
os arquivos chegam neste workspace e a sincronização passa a funcionar componente a
componente.

### Fontes sobre conformidade

- [Lei nº 5.768/1971](https://www.planalto.gov.br/ccivil_03/leis/l5768.htm) · [Decreto nº 70.951/1972](https://www.planalto.gov.br/ccivil_03/decreto/antigos/d70951.htm)
- [Promoção Comercial — SPA / Ministério da Fazenda](https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/promocao-comercial)
- [Promoções comerciais: pontos de atenção — Mattos Filho](https://www.mattosfilho.com.br/unico/promocoes-comerciais-pontos-de-atencao/)
