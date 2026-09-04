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
import consultarCnpj, { IDENTIFICACAO } from "../api/cnpj.js";
import {
  RAZAO_SOCIAL_MAXIMA,
  podePreencher,
  razaoSocialDaResposta,
  valeConsultar,
} from "../src/domain/assinatura/consultaDeCnpj.js";
import { criarAsaas, lerAmbienteDoAsaas } from "../api/_nucleo/asaas.js";
import {
  aplicarNoProcesso,
  interpretarEnv,
} from "./env-sem-expansao.mjs";

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

/* ─── (f) A chave do Asaas sobrevive à leitura do `.env` ─────────────────── */

console.log("\n(f) O `.env` entrega a chave inteira, sem expandir o `$`\n");

/*
 * Esta seção mora aqui, e não numa ferramenta de ambiente, porque o motivo dela
 * é a chave do Asaas: ela é o único segredo do projeto que começa com `$`, e
 * `dotenv-expand` (dentro do `loadEnv` do Vite) a lia como referência a uma
 * variável inexistente e devolvia string VAZIA, sem avisar. O sintoma era
 * `POST /api/assinar` respondendo 500 "a contratação está indisponível" com o
 * `.env` correto o tempo todo.
 *
 * A verificação é sobre o leitor, não sobre o `.env` de quem desenvolve: o
 * arquivo real não está no Git, e uma asserção que dependesse dele passaria ou
 * falharia conforme a máquina.
 */

const ARQUIVO_DE_MENTIRA = [
  "# comentário de linha inteira",
  "",
  "ASAAS_CHAVE_DE_API=$aact_hmlg_000MzkwODA2MWY2OGMxNzUyZDBk",
  "ASAAS_TOKEN_DO_WEBHOOK=umtokenlongoosuficiente123456",
  'COM_ASPAS_DUPLAS="valor com # dentro"',
  "COM_ASPAS_SIMPLES='outro $valor'",
  "export COM_EXPORT=sim",
  "COM_COMENTARIO=valor   # isto é comentário",
  "COM_CERQUILHA=senha#nao-e-comentario",
  "SEM_VALOR=",
  "= linha sem nome",
  "1INVALIDO=nao entra",
].join("\n");

const lido = interpretarEnv(ARQUIVO_DE_MENTIRA);

afirmar(
  "o valor que começa com `$` chega inteiro, sem expansão",
  lido.ASAAS_CHAVE_DE_API === "$aact_hmlg_000MzkwODA2MWY2OGMxNzUyZDBk",
);
afirmar(
  "`$` no meio do valor também sobrevive",
  lido.COM_ASPAS_SIMPLES === "outro $valor",
);
afirmar(
  "aspas em volta somem, e o `#` de dentro fica",
  lido.COM_ASPAS_DUPLAS === "valor com # dentro",
);
afirmar("`export NOME=valor` é aceito", lido.COM_EXPORT === "sim");
afirmar(
  "comentário depois de espaço é cortado",
  lido.COM_COMENTARIO === "valor",
);
afirmar(
  "cerquilha colada ao valor é conteúdo, não comentário",
  lido.COM_CERQUILHA === "senha#nao-e-comentario",
);
afirmar("valor vazio é vazio, e não ausente", lido.SEM_VALOR === "");
afirmar(
  "linha sem nome e nome inválido são ignorados",
  !("" in lido) && !("1INVALIDO" in lido),
);
afirmar(
  "comentário de linha inteira não vira variável",
  Object.keys(lido).length === 8,
);

// A precedência: quem exportou no terminal está dizendo algo mais específico.
const processoDeMentira = { env: { JA_EXPORTADA: "do terminal" } };
const aplicados = aplicarNoProcesso(
  { JA_EXPORTADA: "do arquivo", SO_NO_ARQUIVO: "entra" },
  processoDeMentira,
);
afirmar(
  "variável já exportada no terminal vence o arquivo",
  processoDeMentira.env.JA_EXPORTADA === "do terminal",
);
afirmar(
  "o que só existe no arquivo entra",
  processoDeMentira.env.SO_NO_ARQUIVO === "entra" &&
    aplicados.length === 1 &&
    aplicados[0] === "SO_NO_ARQUIVO",
);

// E o laço fecha: o valor lido assim é aceito por quem consome a chave.
const configDeMentira = lerAmbienteDoAsaas({
  ASAAS_CHAVE_DE_API: lido.ASAAS_CHAVE_DE_API,
  ASAAS_TOKEN_DO_WEBHOOK: lido.ASAAS_TOKEN_DO_WEBHOOK,
});
afirmar(
  "a chave lida assim é aceita, e o ambiente derivado dela é o sandbox",
  configDeMentira.ok === true && configDeMentira.config.ambiente === "sandbox",
);
afirmar(
  "e a chave expandida para vazio seria RECUSADA, que é o defeito de origem",
  lerAmbienteDoAsaas({
    ASAAS_CHAVE_DE_API: "",
    ASAAS_TOKEN_DO_WEBHOOK: lido.ASAAS_TOKEN_DO_WEBHOOK,
  }).ok === false,
);

/* ─── (g) A consulta de CNPJ peneira a resposta ──────────────────────────── */

console.log("\n(g) A consulta de CNPJ devolve um campo, e nunca o quadro de sócios\n");

/*
 * A fonte pública devolve dezenas de campos, e entre eles o `qsa`: nome e CPF
 * parcial de pessoas físicas que não são o cliente. A garantia é NEGATIVA, do
 * mesmo tipo da leitura pública do pedido, e é afirmada das duas maneiras:
 * pelas chaves do objeto e pelos VALORES no JSON serializado.
 */

const RESPOSTA_DA_FONTE = Object.freeze({
  cnpj: "33000167000101",
  razao_social: "  PETROLEO BRASILEIRO   S A  PETROBRAS ",
  nome_fantasia: "PETROBRAS",
  email: "contato@exemplo.com.br",
  ddd_telefone_1: "2132242040",
  cep: "20031912",
  logradouro: "AVENIDA REPUBLICA DO CHILE",
  qsa: [
    { nome_socio: "FULANO DE TAL SOCIO", cnpj_cpf_do_socio: "***456789**" },
    { nome_socio: "BELTRANA DE TAL SOCIA", cnpj_cpf_do_socio: "***987654**" },
  ],
});

afirmar(
  "colapsa o espaço e apara as pontas da razão social",
  razaoSocialDaResposta(RESPOSTA_DA_FONTE) === "PETROLEO BRASILEIRO S A PETROBRAS",
);
afirmar(
  "aplica o mesmo teto da coluna, para não recusar no envio o que preencheu na tela",
  razaoSocialDaResposta({ razao_social: "A".repeat(500) }).length ===
    RAZAO_SOCIAL_MAXIMA,
);
afirmar(
  "resposta sem razão social, vazia ou fora de forma devolve null",
  razaoSocialDaResposta({}) === null &&
    razaoSocialDaResposta({ razao_social: "   " }) === null &&
    razaoSocialDaResposta({ razao_social: 42 }) === null &&
    razaoSocialDaResposta(null) === null &&
    razaoSocialDaResposta("texto") === null,
);

afirmar(
  "só consulta com os catorze dígitos e o verificador conferindo",
  valeConsultar("33.000.167/0001-01") &&
    valeConsultar("33000167000101") &&
    !valeConsultar("3300016700010") &&
    !valeConsultar("33000167000102") &&
    !valeConsultar("11111111111111") &&
    !valeConsultar(""),
);

afirmar(
  "campo vazio pode ser preenchido",
  podePreencher({ atual: "", ultimaSugerida: null }) &&
    podePreencher({ atual: "   ", ultimaSugerida: "QUALQUER" }),
);
afirmar(
  "o que NÓS sugerimos pode ser substituído por outra sugestão",
  podePreencher({ atual: "EMPRESA A LTDA", ultimaSugerida: "EMPRESA A LTDA" }),
);
afirmar(
  "o que a PESSOA digitou nunca é sobrescrito",
  !podePreencher({ atual: "Nome que eu corrigi", ultimaSugerida: "EMPRESA A LTDA" }) &&
    !podePreencher({ atual: "Digitei antes de consultar", ultimaSugerida: null }),
);

/* A porta, exercitada com um `res` de mentira. */

function respostaDeMentira() {
  const estado = { status: null, corpo: null, cabecalhos: {} };
  const res = {
    setHeader(nome, valor) {
      estado.cabecalhos[nome] = valor;
    },
    status(codigo) {
      estado.status = codigo;
      return res;
    },
    json(corpo) {
      estado.corpo = corpo;
      return res;
    },
  };
  return { estado, res };
}

function fonteDeMentira(resultado) {
  const chamadas = [];
  const buscar = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    if (resultado instanceof Error) throw resultado;
    return new Response(
      resultado.corpo === null ? "" : JSON.stringify(resultado.corpo),
      { status: resultado.status, headers: { "Content-Type": "application/json" } },
    );
  };
  return { chamadas, buscar };
}

{
  const { estado, res } = respostaDeMentira();
  const fonte = fonteDeMentira({ status: 200, corpo: RESPOSTA_DA_FONTE });
  await consultarCnpj({ method: "GET", url: "/api/cnpj?cnpj=33.000.167/0001-01" }, res, fonte.buscar);

  const serializada = JSON.stringify(estado.corpo);
  afirmar("CNPJ com máscara é aceito e normalizado", estado.status === 200);
  afirmar(
    "a resposta tem uma chave só",
    Object.keys(estado.corpo ?? {}).join(",") === "razaoSocial",
  );
  for (const vazamento of [
    "FULANO DE TAL SOCIO",
    "BELTRANA DE TAL SOCIA",
    "***456789**",
    "contato@exemplo.com.br",
    "2132242040",
    "AVENIDA REPUBLICA DO CHILE",
  ]) {
    afirmar(
      `o corpo serializado não contém "${vazamento}"`,
      !serializada.includes(vazamento),
    );
  }
  afirmar(
    "e a fonte foi chamada com os dígitos, sem a máscara",
    fonte.chamadas[0]?.url?.endsWith("/33000167000101") === true,
  );
  // A fonte responde 403 sem `User-Agent`, e o `fetch` do Node não manda um
  // sozinho. Sem esta asserção, a consulta volta a falhar inteira em silêncio.
  afirmar(
    "a chamada se identifica com User-Agent, que a fonte exige",
    fonte.chamadas[0]?.opcoes?.headers?.["User-Agent"] === IDENTIFICACAO,
  );
}

{
  const { estado, res } = respostaDeMentira();
  const fonte = fonteDeMentira({ status: 200, corpo: RESPOSTA_DA_FONTE });
  await consultarCnpj({ method: "GET", url: "/api/cnpj?cnpj=11111111111111" }, res, fonte.buscar);
  afirmar(
    "CNPJ inválido é recusado com 400 e a fonte NÃO é chamada",
    estado.status === 400 && fonte.chamadas.length === 0,
  );
}

{
  const { estado, res } = respostaDeMentira();
  const fonte = fonteDeMentira({ status: 404, corpo: { message: "não existe" } });
  await consultarCnpj({ method: "GET", url: "/api/cnpj?cnpj=33000167000101" }, res, fonte.buscar);
  afirmar("CNPJ que não existe no registro vira 404", estado.status === 404);
}

{
  const { estado, res } = respostaDeMentira();
  const fonte = fonteDeMentira(new Error("rede caiu"));
  await consultarCnpj({ method: "GET", url: "/api/cnpj?cnpj=33000167000101" }, res, fonte.buscar);
  afirmar(
    "fonte fora do ar vira 503, e não derruba a tela",
    estado.status === 503,
  );
}

{
  const { estado, res } = respostaDeMentira();
  const fonte = fonteDeMentira({ status: 200, corpo: { cnpj: "33000167000101" } });
  await consultarCnpj({ method: "GET", url: "/api/cnpj?cnpj=33000167000101" }, res, fonte.buscar);
  afirmar("resposta sem razão social vira 502", estado.status === 502);
}

{
  const { estado, res } = respostaDeMentira();
  const fonte = fonteDeMentira({ status: 200, corpo: RESPOSTA_DA_FONTE });
  await consultarCnpj({ method: "POST", url: "/api/cnpj?cnpj=33000167000101" }, res, fonte.buscar);
  afirmar(
    "POST é recusado com 405, e a fonte não é chamada",
    estado.status === 405 && fonte.chamadas.length === 0,
  );
}

/* ─── Fecho ──────────────────────────────────────────────────────────────── */

console.log("");
if (falhas > 0) {
  console.log(`Assinatura NÃO verificada: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log(`Assinatura verificada: ${ok} asserções passaram.`);
}
