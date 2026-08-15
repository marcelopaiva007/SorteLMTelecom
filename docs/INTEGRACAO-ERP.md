# Integração com o ERP

O ERP empurra clientes e eventos para o Sorteio LM. **A integração é de mão
única: o Sorteio LM nunca escreve no ERP.**

Cada evento recebido dispara sozinho a concessão de crédito, aplicando os pesos
da campanha aberta. O ERP não precisa saber nada sobre números, pesos ou
campanhas — só informar o fato que aconteceu.

---

## Endpoint

```
POST https://<dominio>/api/erp/eventos
Content-Type: application/json
x-erp-chave: <ERP_CHAVE_INGESTAO>
```

A chave é combinada entre os dois lados e guardada na variável de ambiente
`ERP_CHAVE_INGESTAO` do Sorteio LM. Sem ela configurada, o endpoint responde
`503` e não aceita nada.

---

## Corpo da requisição

Os dois blocos são opcionais e podem vir juntos ou separados. Máximo de 5.000
itens por bloco em cada chamada.

```json
{
  "clientes": [
    {
      "erp_id": "ERP00042",
      "cpf_cnpj": "12345678909",
      "nome": "Ana Ferreira",
      "whatsapp": "5511999998888",
      "status": "ativo",
      "data_ativacao": "2024-03-15",
      "data_cancelamento": null,
      "meses_em_dia": 14
    }
  ],
  "eventos": [
    {
      "erp_id": "ERP00042",
      "tipo": "mensalidade_em_dia",
      "competencia": "2026-08",
      "ocorrido_em": "2026-08-10T14:32:00-03:00",
      "chave_idempotente": "ERP00042:mensalidade:2026-08",
      "payload": { "fatura": "F-99231", "valor": 99.9 }
    }
  ]
}
```

### Clientes

| Campo | Obrigatório | Observação |
|---|---|---|
| `erp_id` | sim | Identificador do contrato no ERP. **É a chave da integração** — o que casa cliente e evento. |
| `cpf_cnpj` | sim | Pode ir com ou sem pontuação; guardamos só os dígitos. |
| `nome` | sim | |
| `whatsapp` | não | É para onde vai o código de acesso. Sem ele, o cliente não consegue entrar. |
| `status` | não | `ativo`, `cancelado` ou `suspenso`. Padrão `ativo`. |
| `data_ativacao` | não | `AAAA-MM-DD`. |
| `data_cancelamento` | não | `AAAA-MM-DD`. |
| `meses_em_dia` | não | Meses seguidos em dia. **É o que posiciona o cliente na escada do bom pagador.** Padrão 0. |

Envio de cliente é *upsert* por `erp_id`: o ERP manda o estado atual e a linha
aqui passa a refletir isso.

### Eventos

| Campo | Obrigatório | Observação |
|---|---|---|
| `erp_id` | sim | Do cliente. Se ele ainda não existe aqui, o evento é recusado e volta na lista de erros. |
| `tipo` | sim | `assinatura`, `reativacao`, `quitacao_debito` ou `mensalidade_em_dia`. |
| `competencia` | não | `AAAA-MM`. Usada para exibir "competência 2026-08" na tela do cliente. |
| `ocorrido_em` | sim | Data e hora do fato, ISO 8601. **É ela que decide em qual campanha o evento cai** — não a hora do envio. |
| `chave_idempotente` | sim | Identificador único do fato. Ver abaixo. |
| `payload` | não | Objeto livre, guardado para auditoria. |

**Mande os clientes antes dos eventos** — no mesmo corpo já basta, porque os
clientes são processados primeiro.

---

## A chave idempotente

É o que permite o ERP reenviar sem medo.

A regra é simples: **a mesma chave nunca gera crédito duas vezes.** Se a rede
caiu no meio de um lote e você não sabe o que entrou, reenvie o lote inteiro —
o que já estava lá é descartado pelo banco.

Sugestão de formato, um por natureza de fato:

```
ERP00042:assinatura
ERP00042:reativacao:2026-08-12
ERP00042:quitacao:2026-07
ERP00042:mensalidade:2026-08
```

O que **não** funciona: usar um id sequencial da fila do ERP que muda a cada
reenvio. Aí o mesmo fato entra duas vezes e o cliente ganha número a mais.

---

## Resposta

Sucesso (`200`):

```json
{
  "ok": true,
  "clientes": { "recebidos": 1, "gravados": 1 },
  "eventos": { "recebidos": 1, "gravados": 1, "duplicados": 0 },
  "erros": []
}
```

Sucesso parcial (`207`): mesma forma, com `ok: false` e a lista `erros`
preenchida. Alguns itens entraram, outros não — a lista diz quais e por quê.

Outros códigos:

| Código | O que houve |
|---|---|
| `401` | Chave em `x-erp-chave` ausente ou errada. |
| `400` | Corpo fora do formato. `detalhe` traz o campo problemático. |
| `405` | Método diferente de `POST`. |
| `503` | `ERP_CHAVE_INGESTAO` não configurada no Sorteio LM. |

`duplicados` maior que zero **não é erro** — é a idempotência funcionando.

---

## O que acontece depois

1. O evento entra em `eventos`.
2. Uma trigger no banco chama a concessão de crédito.
3. A rotina acha a campanha aberta que abrange `ocorrido_em`, lê a regra do
   gatilho e aplica carência, limite por CPF e a escada do bom pagador.
4. Vira crédito em `creditos` — ou vira registro em `eventos_bloqueados` com o
   motivo, se alguma trava barrou.

Nada disso exige ação do ERP. O resultado aparece no painel, nas abas
**Sincronização** e **Auditoria**.

Motivos de bloqueio que o painel mostra:

| Motivo | Significado |
|---|---|
| `fora_de_campanha` | O evento não cai em nenhuma campanha aberta. |
| `carencia_reativacao` | O mesmo gatilho já pagou dentro da janela de carência. |
| `limite_por_cpf` | O gatilho já pagou o número de vezes permitido na campanha. |
| `sem_regra` | A campanha não define peso para esse gatilho. |
| `cliente_inelegivel` | Cliente pediu autoexclusão dos sorteios. |
| `peso_zerado` | A regra concede zero número para esse gatilho. |

---

## Cadência sugerida

Uma chamada a cada 15 minutos com o que mudou desde a última, ou um lote diário
de madrugada mais chamadas pontuais para assinatura e reativação, que são os
fatos em que o cliente espera ver o número aparecer rápido.

Se o conector ficar fora do ar, não há perda: quando voltar, reenvie a janela
inteira. O painel mostra alarme depois de três falhas seguidas de leitura.

---

## Teste rápido

```bash
curl -X POST https://<dominio>/api/erp/eventos \
  -H "Content-Type: application/json" \
  -H "x-erp-chave: $ERP_CHAVE_INGESTAO" \
  -d '{
    "clientes": [{
      "erp_id": "TESTE001",
      "cpf_cnpj": "39053344705",
      "nome": "Cliente de Teste",
      "whatsapp": "5511999990000",
      "meses_em_dia": 7
    }],
    "eventos": [{
      "erp_id": "TESTE001",
      "tipo": "mensalidade_em_dia",
      "competencia": "2026-08",
      "ocorrido_em": "2026-08-10T14:00:00-03:00",
      "chave_idempotente": "TESTE001:mensalidade:2026-08"
    }]
  }'
```

Rode duas vezes: na segunda, `gravados` deve vir `0` e `duplicados` `1`. Se vier
`gravados: 1` nas duas, a chave idempotente está mudando entre as chamadas e o
cliente vai ganhar número repetido.
