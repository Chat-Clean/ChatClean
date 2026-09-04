#!/usr/bin/env node
/**
 * O retorno da assinatura, verificado por execução.
 *
 * Cobre o caminho que começa quando o cliente termina de pagar no Asaas: o
 * endereço para onde ele volta, o vocabulário da tela que o recebe, e a leitura
 * pública do pedido — que é a única porta do site que devolve algo sobre um
 * pedido a quem não está autenticado.
 *
 * ─── O QUE ESTA FERRAMENTA GUARDA ────────────────────────────────────────
 *
 * A garantia mais importante é NEGATIVA: `leituraPublica` não devolve nome,
 * e-mail, telefone, CNPJ, razão social nem o endereço da fatura. Essa é a
 * espécie de regra que se quebra por acidente, ao acrescentar um campo "só para
 * a tela mostrar", e que ninguém percebe porque a tela continua funcionando.
 * Por isso ela é afirmada de duas maneiras: pela ausência da chave no objeto, e
 * pela ausência do VALOR no JSON serializado — a segunda pega o campo que
 * alguém renomeie achando que renomear resolve.
 *
 * Nada aqui toca rede ou banco: os módulos são importados e executados.
 *
 * Saída: código 0 se tudo passou; 1 em qualquer falha.
 */

import {
  CAMINHO_DO_RETORNO,
  PARAMETRO_DO_PEDIDO,
  SITUACOES,
  ehIdentificadorDePedido,
  enderecoDeRetorno,
  leituraDoEstado,
  valeReconsultar,
} from "../src/domain/assinatura/retorno.js";
import {
  ESTADOS,
  TODOS_OS_ESTADOS,
} from "../src/domain/assinatura/pedido.js";
import { identificadorDoPedido, leituraPublica } from "../api/pedido.js";
import { criarAsaas } from "../api/_nucleo/asaas.js";

let ok = 0;
let falhas = 0;

function afirmar(nome, condicao) {
  if (condicao) {
    ok += 1;
    console.log(`  OK    ${nome}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${nome}`);
  }
}

function lancou(acao) {
  try {
    acao();
    return false;
  } catch {
    return true;
  }
}

const ID = "0f4a3b2c-1d5e-4f60-9a7b-8c9d0e1f2a3b";

/* ─── (a) O endereço de retorno ──────────────────────────────────────────── */

console.log("\n(a) O endereço para onde o Asaas devolve quem pagou\n");

afirmar(
  "o endereço absoluto carrega o pedido na querystring",
  enderecoDeRetorno("https://chatclean.com.br", ID) ===
    `https://chatclean.com.br${CAMINHO_DO_RETORNO}?${PARAMETRO_DO_PEDIDO}=${ID}`,
);
afirmar(
  "barra sobrando no fim do domínio não vira barra dupla",
  enderecoDeRetorno("https://chatclean.com.br///", ID) ===
    `https://chatclean.com.br${CAMINHO_DO_RETORNO}?${PARAMETRO_DO_PEDIDO}=${ID}`,
);
afirmar(
  "sem Domínio Canônico não há retorno, e o checkout segue sem ele",
  enderecoDeRetorno("", ID) === null && enderecoDeRetorno(null, ID) === null,
);
afirmar(
  "domínio sem esquema é recusado: o Asaas exige endereço absoluto",
  enderecoDeRetorno("chatclean.com.br", ID) === null,
);
afirmar(
  "pedido que não é uuid não vira endereço",
  enderecoDeRetorno("https://chatclean.com.br", "meu-pedido") === null,
);
afirmar(
  "o identificador é conferido pela forma, não pelo comprimento",
  ehIdentificadorDePedido(ID) &&
    !ehIdentificadorDePedido(`${ID.slice(0, -1)}z`) &&
    !ehIdentificadorDePedido("' or 1=1 --") &&
    !ehIdentificadorDePedido(null),
);

/* ─── (b) O `callback` que o Asaas recebe ────────────────────────────────── */

console.log("\n(b) O `callback` sai no corpo da assinatura, e só quando existe\n");

function asaasDeMentira() {
  const chamadas = [];
  const buscar = async (url, opcoes) => {
    chamadas.push({ url, corpo: JSON.parse(opcoes.body) });
    return new Response(JSON.stringify({ id: "sub_1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return {
    chamadas,
    asaas: criarAsaas({
      chave: "$aact_prod_teste",
      base: "https://exemplo.invalido",
      buscar,
    }),
  };
}

const comRetorno = asaasDeMentira();
await comRetorno.asaas.criarAssinatura({
  clienteId: "cus_1",
  valor: 399,
  primeiroVencimento: "2026-10-10",
  descricao: "Pro",
  referenciaExterna: `chatclean:pedido:${ID}`,
  retornoUrl: `https://chatclean.com.br${CAMINHO_DO_RETORNO}?${PARAMETRO_DO_PEDIDO}=${ID}`,
});
const corpoComRetorno = comRetorno.chamadas[0]?.corpo ?? {};

afirmar(
  "com endereço, o corpo leva `callback.successUrl`",
  corpoComRetorno.callback?.successUrl ===
    `https://chatclean.com.br${CAMINHO_DO_RETORNO}?${PARAMETRO_DO_PEDIDO}=${ID}`,
);
afirmar(
  "e `autoRedirect`, que é o que faz a volta acontecer sozinha",
  corpoComRetorno.callback?.autoRedirect === true,
);

const semRetorno = asaasDeMentira();
await semRetorno.asaas.criarAssinatura({
  clienteId: "cus_1",
  valor: 399,
  primeiroVencimento: "2026-10-10",
  descricao: "Pro",
  referenciaExterna: `chatclean:pedido:${ID}`,
  retornoUrl: null,
});
afirmar(
  "sem endereço, `callback` não aparece no corpo (o Asaas recusaria um vazio)",
  !("callback" in (semRetorno.chamadas[0]?.corpo ?? {})),
);

/* ─── (c) O vocabulário da tela ──────────────────────────────────────────── */

console.log("\n(c) Todo Estado do pedido tem fala, e nenhuma inventa pagamento\n");

for (const estado of TODOS_OS_ESTADOS) {
  const fala = leituraDoEstado(estado);
  afirmar(
    `\`${estado}\` tem título, texto e situação conhecida`,
    Boolean(fala?.titulo) &&
      Boolean(fala?.texto) &&
      SITUACOES.includes(fala?.situacao),
  );
  afirmar(
    `\`${estado}\` não usa travessão no texto que a pessoa lê`,
    !`${fala.titulo}${fala.texto}`.includes("—"),
  );
}

afirmar(
  "aguardando pagamento NÃO diz que foi pago",
  !/\bpago\b/i.test(leituraDoEstado(ESTADOS.AGUARDANDO_PAGAMENTO).titulo),
);
afirmar(
  "Estado fora do vocabulário lança em vez de virar tela genérica",
  lancou(() => leituraDoEstado("liberado")),
);
afirmar(
  "só os Estados que ainda se mexem pedem reconsulta",
  valeReconsultar(ESTADOS.AGUARDANDO_PAGAMENTO) &&
    valeReconsultar(ESTADOS.PAGO) &&
    valeReconsultar(ESTADOS.PROVISIONANDO) &&
    !valeReconsultar(ESTADOS.ATIVO) &&
    !valeReconsultar(ESTADOS.CANCELADO) &&
    !valeReconsultar(ESTADOS.VENCIDO),
);

/* ─── (d) A leitura pública não vaza dado pessoal ────────────────────────── */

console.log("\n(d) A porta pública devolve o mínimo, e nada que identifique\n");

const LINHA = Object.freeze({
  id: ID,
  estado: ESTADOS.PAGO,
  nome: "Fulano de Tal",
  email: "fulano@exemplo.com",
  telefone: "84999999999",
  cnpj: "11222333000181",
  razao_social: "Exemplo Comercio LTDA",
  plano_id: "pro",
  usuarios: 5,
  conexoes: 2,
  dia_de_vencimento: 10,
  valor_centavos: 39900,
  referencia_externa: `chatclean:pedido:${ID}`,
  asaas_cliente_id: "cus_000123",
  asaas_assinatura_id: "sub_000123",
  asaas_cobranca_id: "pay_000123",
  fatura_url: "https://www.asaas.com/i/abc123",
  criado_em: "2026-09-04T12:00:00.000Z",
});

const publica = leituraPublica(LINHA);
const serializada = JSON.stringify(publica);

for (const campo of [
  "id",
  "nome",
  "email",
  "telefone",
  "cnpj",
  "razao_social",
  "fatura_url",
  "referencia_externa",
  "asaas_cliente_id",
  "asaas_assinatura_id",
  "asaas_cobranca_id",
]) {
  afirmar(`a leitura pública não tem a chave \`${campo}\``, !(campo in publica));
}

// A segunda metade da mesma garantia: renomear a chave não é escapatória.
for (const valor of [
  "Fulano de Tal",
  "fulano@exemplo.com",
  "84999999999",
  "11222333000181",
  "Exemplo Comercio LTDA",
  "asaas.com",
  "cus_000123",
  "sub_000123",
]) {
  afirmar(
    `o corpo serializado não contém "${valor}"`,
    !serializada.includes(valor),
  );
}

afirmar(
  "e ainda assim a tela recebe o que precisa desenhar",
  publica.estado === ESTADOS.PAGO &&
    publica.planoNome === "Pro" &&
    publica.usuarios === 5 &&
    publica.conexoes === 2 &&
    publica.valorCentavos === 39900,
);
afirmar(
  "plano desconhecido não derruba a leitura, só fica sem nome",
  leituraPublica({ ...LINHA, plano_id: "inexistente" }).planoNome === null,
);

/* ─── (e) De onde o identificador é lido ─────────────────────────────────── */

console.log("\n(e) O identificador vem da query parseada ou da URL crua\n");

afirmar(
  "lê da query já parseada pela plataforma, com espaço em volta",
  identificadorDoPedido({ query: { [PARAMETRO_DO_PEDIDO]: `  ${ID}  ` } }) === ID,
);
afirmar(
  "lê da URL crua quando a plataforma não parseia",
  identificadorDoPedido({ url: `/api/pedido?${PARAMETRO_DO_PEDIDO}=${ID}` }) === ID,
);
afirmar(
  "parâmetro repetido usa o primeiro, não o array inteiro",
  identificadorDoPedido({ query: { [PARAMETRO_DO_PEDIDO]: [ID, "outro"] } }) === ID,
);
afirmar(
  "sem parâmetro devolve vazio, que a porta recusa antes do banco",
  identificadorDoPedido({ url: "/api/pedido" }) === "" &&
    !ehIdentificadorDePedido(identificadorDoPedido({})),
);

/* ─── Fecho ──────────────────────────────────────────────────────────────── */

console.log("");
if (falhas > 0) {
  console.log(`Assinatura NÃO verificada: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log(`Assinatura verificada: ${ok} asserções passaram.`);
}
