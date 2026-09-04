# Webhook de provisionamento

O contrato entre o site e a plataforma. Quando o Asaas confirma um pagamento,
o site chama **um endereço seu** para criar a conta do cliente.

Enquanto esse endereço não existir, nada quebra: o pedido pago para em
`falha_no_provisionamento`, nenhuma tentativa é gasta, e a tela de retorno diz
ao cliente que o pagamento entrou e a conta ainda não subiu. No primeiro evento
depois de a variável existir, o pedido volta a andar sozinho.

## O que declarar no ambiente

Duas variáveis, **só de servidor**, no painel da plataforma de hospedagem.
Nenhuma delas entra em arquivo versionado, e nenhuma tem variante `VITE_`
(tudo com esse prefixo vai para o bundle do navegador).

```
PROVISIONAMENTO_URL       o endereço que cria a conta
PROVISIONAMENTO_SEGREDO   o segredo do HMAC, no mínimo 32 caracteres aleatórios
```

O segredo é **compartilhado**: o mesmo valor aqui e do seu lado. Ele é o que
prova que a chamada veio de nós.

## A requisição

`POST` no endereço declarado, com `Content-Type: application/json`.

### Cabeçalhos

| Cabeçalho | O que é |
|---|---|
| `X-ChatClean-Timestamp` | Segundos desde 1970, no momento do disparo |
| `X-ChatClean-Assinatura` | `sha256=<hex>` do HMAC descrito abaixo |
| `X-ChatClean-Idempotencia` | `<uuid do pedido>:<id da cobrança no Asaas>` |

### O corpo

```json
{
  "pedidoId": "0f4a3b2c-1d5e-4f60-9a7b-8c9d0e1f2a3b",
  "contratadoEm": "2026-09-04T12:00:00.000Z",
  "cliente": {
    "nome": "Maria de Souza",
    "email": "maria@exemplo.com.br",
    "telefone": "84999000111",
    "cnpj": "33000167000101",
    "razaoSocial": "EXEMPLO COMERCIO LTDA"
  },
  "contratacao": {
    "planoId": "pro",
    "usuarios": 5,
    "conexoes": 2,
    "diaDeVencimento": 10,
    "valorCentavos": 74950
  },
  "asaas": {
    "evento": "PAYMENT_CONFIRMED",
    "clienteId": "cus_000123",
    "assinaturaId": "sub_000123",
    "cobrancaId": "pay_000123",
    "cobranca": { "…": "o objeto de cobrança do Asaas, como veio" }
  }
}
```

`telefone` e `cnpj` vêm **só com dígitos**. `valorCentavos` é inteiro, em
centavos: `74950` são R$ 749,50. `planoId` é um de `starter`, `pro`,
`business`.

## Como conferir a assinatura

```
esperado = HMAC_SHA256(segredo, `${timestamp}.${corpoCruEmBytes}`)
confere  = comparacaoEmTempoConstante(cabecalho, `sha256=${esperado}`)
```

Três regras que não podem ser puladas:

1. **Assine o corpo CRU**, antes de qualquer parse. Reserializar o JSON muda os
   bytes e a assinatura nunca vai conferir.
2. **O timestamp entra no cálculo.** Assinar só o corpo deixaria uma chamada
   capturada válida para sempre. Recuse timestamp com mais de 5 minutos.
3. **Compare em tempo constante.** Comparar segredo com `===` vaza o tamanho e
   o prefixo pelo tempo de resposta, e este endereço fica aberto na internet.

Há uma implementação de referência pronta em
[`scripts/provisionamento.mjs`](scripts/provisionamento.mjs), na função
`conferir()`.

## O que responder

| Resposta | O que acontece do nosso lado |
|---|---|
| **2xx** | O pedido vira `ativo`. A conta está criada. |
| Qualquer outra | O pedido vira `falha_no_provisionamento` e **gasta uma tentativa**. |
| Sem resposta em 6s | Idem: o disparo tem prazo de 6 segundos. |

São **5 tentativas** no total por pedido, uma por evento de pagamento
recebido. Esgotadas, o pedido fica em `falha_no_provisionamento` e precisa de
gente.

Responda 2xx **rápido**, e faça o trabalho pesado depois. Seis segundos é o
teto, e um endpoint que cria a conta de forma síncrona em cima de uma
integração lenta vai estourar esse prazo com o pagamento já confirmado.

## Idempotência é acordo entre as duas pontas

Mandamos `X-ChatClean-Idempotencia` para você poder descartar repetição. Do
nosso lado, o par (pedido, tentativa) é único no banco, então duas execuções
simultâneas do mesmo evento não produzem duas chamadas.

Do seu lado: **guarde a chave e devolva 2xx sem recriar a conta** quando ela
repetir. O Asaas entrega webhook no modelo *at least once*, e o mesmo pagamento
pode gerar `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`.

## Como testar antes de ter a plataforma pronta

**1. Suba o receptor de referência.** Ele confere a assinatura do jeito certo,
recusa timestamp velho e imprime o que chegou:

```bash
npm run provisionamento -- --servir 4000
```

**2. Aponte o ambiente para ele** e reinicie o `npm run dev`:

```powershell
$env:PROVISIONAMENTO_URL = "http://localhost:4000/provisionar"
$env:PROVISIONAMENTO_SEGREDO = "um-segredo-qualquer-com-32-caracteres"
```

**3. Crie um pedido** em `/assinar` e **simule o pagamento**:

```bash
npm run asaas:simular-pagamento -- --pedido <uuid> --local http://localhost:5173
```

O pedido deve terminar em `ativo`.

## Como testar o SEU endpoint, quando existir

```bash
npm run provisionamento -- --enviar https://sua-plataforma/provisionar
```

Manda um disparo assinado de mentira, com o mesmo corpo e os mesmos cabeçalhos
do de verdade, e diz o que voltou. Não depende de uma venda acontecer.

## O que já está provado

`npm run verificar:checkout` exercita este caminho contra um servidor HTTP de
verdade, e afirma: a assinatura confere, o timestamp entra no cálculo, a chave
de idempotência viaja, o corpo leva o que precisa, 2xx leva a `ativo`, não-2xx
leva a `falha_no_provisionamento`, as tentativas param em 5, e o pedido
destrava sozinho quando o receptor volta. Cada uma dessas garantias foi
validada por sabotagem.
