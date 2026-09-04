#!/usr/bin/env node
/**
 * O checkout inteiro, exercitado situação por situação.
 *
 * ═══ POR QUE COM DUBLÊS, E NÃO CONTRA O ASAAS ════════════════════════════
 *
 * A maioria das situações que importam aqui é de FALHA: o Asaas recusando, o
 * Asaas fora do ar, o banco caindo no meio, duas requisições correndo pelo
 * mesmo CNPJ, o webhook chegando duas vezes, o provisionamento respondendo
 * 500 cinco vezes seguidas. Nenhuma delas se produz sob encomenda no sandbox,
 * e uma verificação que só sabe testar o caminho feliz não é verificação.
 *
 * Então o banco e o Asaas são dublês em memória que honram o MESMO contrato do
 * de verdade, incluindo as restrições que o Postgres impõe:
 *
 *   * um pedido pendente por CNPJ (índice único parcial)
 *   * `id` do evento é chave primária, e repetição é descartada
 *   * o par (pedido, tentativa) de provisionamento é único
 *
 * São essas restrições que carregam a idempotência. Um dublê que as ignorasse
 * deixaria passar exatamente o defeito que elas existem para pegar.
 *
 * O caminho feliz contra o Asaas de verdade é outra ferramenta:
 * `npm run asaas:simular-pagamento`, que confirma uma cobrança no sandbox.
 *
 * ═══ O PROVISIONAMENTO É EXERCITADO CONTRA UM SERVIDOR DE VERDADE ════════
 *
 * A seção (j) sobe um servidor HTTP local e manda o disparo nele. É o único
 * jeito honesto de afirmar que a assinatura HMAC confere, que o timestamp
 * entra no cálculo e que a chave de idempotência viaja no cabeçalho: com um
 * dublê de `fetch` estaríamos conferindo o que nós mesmos montamos.
 *
 * Nada aqui toca rede externa nem o banco de produção.
 *
 * Saída: código 0 se tudo passou; 1 em qualquer falha.
 */

import { createHmac } from "node:crypto";
import { createServer } from "node:http";

import {
  ESTADOS,
  VERSAO_DOS_TERMOS,
} from "../src/domain/assinatura/pedido.js";
import { precoMensal, planoPorId } from "../src/domain/assinatura/planos.js";
import {
  TIPOS,
  criarPedidoDeAssinatura,
} from "../api/_nucleo/pedidoDeAssinatura.js";
import {
  EVENTOS_QUE_TRATAMOS,
  MAXIMO_DE_TENTATIVAS,
  assinarCorpo,
  receberEvento,
  tokenConfere,
} from "../api/_nucleo/eventosDoAsaas.js";
import assinar from "../api/assinar.js";
import { checkoutAtivo } from "../src/domain/assinatura/disponibilidade.js";

let ok = 0;
let falhas = 0;

function afirmar(nome, condicao, detalhe = "") {
  if (condicao) {
    ok += 1;
    console.log(`  OK    ${nome}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function secao(titulo) {
  console.log(`\n${titulo}\n`);
}

/* ═══ O banco de mentira ═══════════════════════════════════════════════════
 *
 * As restrições do Postgres estão AQUI, e não na aplicação, porque é onde elas
 * moram no banco de verdade. Um dublê que deixasse dois pendentes por CNPJ
 * conviver testaria um mundo que não existe.
 */

const UNICIDADE = "23505";

function bancoDeMentira({ falhaEm = {} } = {}) {
  let sequencia = 0;
  const pedidos = new Map();
  const eventos = new Map();
  const provisionamentos = [];

  const uuid = () => {
    sequencia += 1;
    const n = String(sequencia).padStart(12, "0");
    return `00000000-0000-4000-8000-${n}`;
  };

  const bem = (dados) => ({ ok: true, status: 200, dados, codigo: "", mensagem: "" });
  const mal = (codigo, mensagem, status = 400) => ({
    ok: false,
    status,
    dados: null,
    codigo,
    mensagem,
  });

  /** A falha injetada para uma operação, se houver. */
  const tropeco = (operacao) => {
    const f = falhaEm[operacao];
    if (!f) return null;
    if (f.vezes !== undefined) {
      if (f.vezes <= 0) return null;
      f.vezes -= 1;
    }
    return mal(f.codigo ?? "Rede", f.mensagem ?? "falha injetada", f.status ?? 0);
  };

  const PENDENTES = [ESTADOS.RASCUNHO, ESTADOS.AGUARDANDO_PAGAMENTO];

  return {
    pedidos,
    eventos,
    provisionamentos,

    async pedidoPendentePorCnpj(cnpj) {
      const t = tropeco("pedidoPendentePorCnpj");
      if (t) return t;
      const achado = [...pedidos.values()].find(
        (p) => p.cnpj === cnpj && PENDENTES.includes(p.estado),
      );
      return bem(achado ?? null);
    },

    async pedidoPorId(id) {
      const t = tropeco("pedidoPorId");
      if (t) return t;
      return bem(pedidos.get(id) ?? null);
    },

    async pedidoPorAssinatura(asaasAssinaturaId) {
      const t = tropeco("pedidoPorAssinatura");
      if (t) return t;
      const achado = [...pedidos.values()].find(
        (p) => p.asaas_assinatura_id === asaasAssinaturaId,
      );
      return bem(achado ?? null);
    },

    async inserirPedido(campos) {
      const t = tropeco("inserirPedido");
      if (t) return t;
      // O índice único parcial: um pendente por CNPJ.
      const jaTem = [...pedidos.values()].some(
        (p) => p.cnpj === campos.cnpj && PENDENTES.includes(p.estado),
      );
      if (jaTem) {
        return mal(UNICIDADE, "pedidos_de_assinatura_um_pendente_por_cnpj", 409);
      }
      const id = uuid();
      const linha = {
        id,
        referencia_externa: `chatclean:pedido:${id}`,
        asaas_cliente_id: null,
        asaas_assinatura_id: null,
        asaas_cobranca_id: null,
        fatura_url: null,
        criado_em: new Date().toISOString(),
        ...campos,
      };
      pedidos.set(id, linha);
      return bem(linha);
    },

    async atualizarPedido(id, campos) {
      const t = tropeco("atualizarPedido");
      if (t) return t;
      const linha = pedidos.get(id);
      if (!linha) return mal("PGRST116", "linha não encontrada", 404);
      const nova = { ...linha, ...campos };
      pedidos.set(id, nova);
      return bem(nova);
    },

    async registrarEvento({ id, evento, corpo, pedidoId = null }) {
      const t = tropeco("registrarEvento");
      if (t) return t;
      if (eventos.has(id)) return { ...bem(null), novo: false };
      eventos.set(id, {
        id,
        evento,
        corpo,
        pedido_id: pedidoId,
        processado_em: null,
        erro: null,
      });
      return { ...bem(null), novo: true };
    },

    async marcarEventoProcessado(id, erro = null) {
      const linha = eventos.get(id);
      if (linha) {
        linha.processado_em = new Date().toISOString();
        linha.erro = erro;
      }
      return bem(null);
    },

    async vincularEventoAoPedido(id, pedidoId) {
      const linha = eventos.get(id);
      if (linha) linha.pedido_id = pedidoId;
      return bem(null);
    },

    async abrirProvisionamento({ pedidoId, tentativa, chaveDeIdempotencia }) {
      const t = tropeco("abrirProvisionamento");
      if (t) return { ...t, jaAberto: false };
      // O par (pedido, tentativa) é único.
      const repetida = provisionamentos.some(
        (p) => p.pedido_id === pedidoId && p.tentativa === tentativa,
      );
      if (repetida) {
        return { ...mal(UNICIDADE, "provisionamentos_pedido_tentativa", 409), jaAberto: true };
      }
      const linha = {
        id: uuid(),
        pedido_id: pedidoId,
        tentativa,
        chave_de_idempotencia: chaveDeIdempotencia,
        ok: null,
        status_http: null,
        resposta: null,
      };
      provisionamentos.push(linha);
      return { ...bem(linha), jaAberto: false };
    },

    async concluirProvisionamento(id, { ok: deuCerto, statusHttp, resposta }) {
      const linha = provisionamentos.find((p) => p.id === id);
      if (linha) {
        linha.ok = deuCerto;
        linha.status_http = statusHttp ?? null;
        linha.resposta = resposta ?? null;
      }
      return bem(null);
    },

    async tentativasDoProvisionamento(pedidoId) {
      const t = tropeco("tentativasDoProvisionamento");
      if (t) return t;
      const doPedido = provisionamentos
        .filter((p) => p.pedido_id === pedidoId)
        .sort((a, b) => b.tentativa - a.tentativa);
      return bem(doPedido[0] ?? null);
    },
  };
}

/* ═══ O Asaas de mentira ═══════════════════════════════════════════════════ */

function asaasDeMentira({ falhaEm = {}, clienteExistente = null } = {}) {
  let sequencia = 0;
  const chamadas = [];
  const assinaturas = new Map();
  const removidas = [];

  const bem = (dados) => ({ ok: true, status: 200, dados, codigo: "", mensagem: "" });
  const tropeco = (operacao) => {
    const f = falhaEm[operacao];
    if (!f) return null;
    return {
      ok: false,
      status: f.status ?? 400,
      dados: null,
      codigo: f.codigo ?? "invalid_value",
      mensagem: f.mensagem ?? "recusado",
    };
  };

  return {
    chamadas,
    assinaturas,
    removidas,

    async clientePorCnpj(cnpj) {
      chamadas.push(`clientePorCnpj:${cnpj}`);
      const t = tropeco("clientePorCnpj");
      if (t) return t;
      return bem(clienteExistente);
    },

    async criarCliente(dados) {
      chamadas.push("criarCliente");
      const t = tropeco("criarCliente");
      if (t) return t;
      sequencia += 1;
      return bem({ id: `cus_${sequencia}`, ...dados });
    },

    async assinaturaPorReferencia(referencia) {
      chamadas.push(`assinaturaPorReferencia:${referencia}`);
      const t = tropeco("assinaturaPorReferencia");
      if (t) return t;
      return bem([...assinaturas.values()].find((a) => a.externalReference === referencia) ?? null);
    },

    async criarAssinatura(dados) {
      chamadas.push("criarAssinatura");
      const t = tropeco("criarAssinatura");
      if (t) return t;
      sequencia += 1;
      const linha = {
        id: `sub_${sequencia}`,
        externalReference: dados.referenciaExterna,
        retornoUrl: dados.retornoUrl ?? null,
        value: dados.valor,
      };
      assinaturas.set(linha.id, linha);
      return bem(linha);
    },

    async removerAssinatura(id) {
      chamadas.push(`removerAssinatura:${id}`);
      const t = tropeco("removerAssinatura");
      if (t) return t;
      removidas.push(id);
      assinaturas.delete(id);
      return bem({ deleted: true });
    },

    async cobrancasDaAssinatura(id) {
      chamadas.push(`cobrancasDaAssinatura:${id}`);
      const t = tropeco("cobrancasDaAssinatura");
      if (t) return t;
      return bem({
        id: `pay_${id}`,
        subscription: id,
        invoiceUrl: `https://sandbox.asaas.com/i/${id}`,
        status: "PENDING",
      });
    },
  };
}

/** Um formulário válido, para variar campo a campo. */
const FORMULARIO = Object.freeze({
  nome: "Maria de Souza",
  email: "maria@exemplo.com.br",
  telefone: "(84) 99900-0111",
  cnpj: "33.000.167/0001-01",
  razaoSocial: "EXEMPLO COMERCIO LTDA",
  planoId: "pro",
  usuarios: 5,
  conexoes: 2,
  diaDeVencimento: 10,
  aceitouOsTermos: true,
});

const DOMINIO = "https://chatclean.com.br";

async function criar(corpo, { banco, asaas, dominio = DOMINIO } = {}) {
  const b = banco ?? bancoDeMentira();
  const a = asaas ?? asaasDeMentira();
  const resultado = await criarPedidoDeAssinatura({
    corpo,
    banco: b,
    asaas: a,
    ip: "203.0.113.10",
    dominio,
  });
  return { resultado, banco: b, asaas: a };
}

/* ═══ (a) O formulário recusado ════════════════════════════════════════════ */

secao("(a) O formulário recusa campo a campo, e diz qual");

const RECUSAS = [
  ["nome", { nome: "  " }],
  ["email", { email: "maria@exemplo" }],
  ["telefone", { telefone: "8499" }],
  ["cnpj", { cnpj: "33.000.167/0001-02" }],
  ["razaoSocial", { razaoSocial: "AB" }],
  ["planoId", { planoId: "inexistente" }],
  ["usuarios", { usuarios: 0 }],
  ["conexoes", { conexoes: 999 }],
  ["diaDeVencimento", { diaDeVencimento: 31 }],
  ["aceitouOsTermos", { aceitouOsTermos: false }],
];

for (const [campo, alteracao] of RECUSAS) {
  const { resultado, banco, asaas } = await criar({ ...FORMULARIO, ...alteracao });
  afirmar(
    `\`${campo}\` inválido recusa o pedido e aponta o campo`,
    resultado.ok === false &&
      resultado.tipo === TIPOS.FORMULARIO_INVALIDO &&
      Object.hasOwn(resultado.erros ?? {}, campo),
    JSON.stringify(resultado.erros ?? {}),
  );
  afirmar(
    `\`${campo}\` inválido não grava nada nem chama o Asaas`,
    banco.pedidos.size === 0 && asaas.chamadas.length === 0,
  );
}

{
  const { resultado } = await criar({});
  afirmar(
    "corpo vazio recusa sem lançar, com todos os campos apontados",
    resultado.ok === false && Object.keys(resultado.erros).length >= 6,
  );
}

/* ═══ (b) O preço não vem do cliente ═══════════════════════════════════════ */

secao("(b) O preço sai da tabela do domínio, não do corpo da requisição");

{
  const esperado = precoMensal(planoPorId("pro"), { usuarios: 5, conexoes: 2 });
  const { resultado, banco } = await criar({
    ...FORMULARIO,
    valorCentavos: 1,
    valor: 0.01,
    preco: 1,
  });
  const linha = [...banco.pedidos.values()][0];
  afirmar(
    "valor enviado pelo cliente é ignorado",
    resultado.ok === true && resultado.valorCentavos === esperado.centavos,
    `esperado ${esperado.centavos}, veio ${resultado.valorCentavos}`,
  );
  afirmar(
    "e o gravado é o calculado, não o enviado",
    linha.valor_centavos === esperado.centavos,
  );
  afirmar(
    "a versão dos termos aceita fica registrada na linha",
    linha.termos_versao === VERSAO_DOS_TERMOS,
  );
  afirmar("o IP do aceite fica registrado", linha.termos_ip === "203.0.113.10");
}

/* ═══ (c) O caminho feliz ══════════════════════════════════════════════════ */

secao("(c) O caminho feliz: cliente, assinatura, fatura e Estado");

{
  const { resultado, banco, asaas } = await criar(FORMULARIO);
  const linha = [...banco.pedidos.values()][0];

  afirmar("o pedido nasce e devolve 'não reaproveitado'", resultado.ok === true && resultado.reaproveitado === false);
  afirmar("devolve a fatura para o navegador", typeof resultado.faturaUrl === "string" && resultado.faturaUrl !== "");
  afirmar(
    "o pedido termina em `aguardando_pagamento`",
    linha.estado === ESTADOS.AGUARDANDO_PAGAMENTO,
  );
  afirmar(
    "cliente, assinatura e cobrança ficam gravados",
    Boolean(linha.asaas_cliente_id && linha.asaas_assinatura_id && linha.asaas_cobranca_id),
  );
  afirmar(
    "o CNPJ e o telefone são gravados só com dígitos",
    linha.cnpj === "33000167000101" && linha.telefone === "84999000111",
  );
  afirmar(
    "o e-mail é gravado em minúsculas",
    linha.email === linha.email.toLowerCase(),
  );

  const assinatura = [...asaas.assinaturas.values()][0];
  afirmar(
    "a assinatura leva o endereço de retorno com o pedido",
    assinatura.retornoUrl === `${DOMINIO}/assinatura/recebido?pedido=${linha.id}`,
  );
  afirmar(
    "a referência externa liga a assinatura ao nosso pedido",
    assinatura.externalReference === `chatclean:pedido:${linha.id}`,
  );
}

{
  const { asaas } = await criar(FORMULARIO, { dominio: null });
  const assinatura = [...asaas.assinaturas.values()][0];
  afirmar(
    "sem Domínio Canônico a venda acontece, só sem retorno automático",
    assinatura !== undefined && assinatura.retornoUrl === null,
  );
}

{
  const asaas = asaasDeMentira({ clienteExistente: { id: "cus_ja_existia" } });
  const { banco } = await criar(FORMULARIO, { asaas });
  const linha = [...banco.pedidos.values()][0];
  afirmar(
    "cliente que já existe no Asaas é reaproveitado, e nenhum é criado",
    linha.asaas_cliente_id === "cus_ja_existia" &&
      !asaas.chamadas.includes("criarCliente"),
  );
}

/* ═══ (d) Idempotência ═════════════════════════════════════════════════════ */

secao("(d) Duplo clique, retomada após timeout e corrida no índice");

{
  const banco = bancoDeMentira();
  const asaas = asaasDeMentira();
  const primeira = await criar(FORMULARIO, { banco, asaas });
  const segunda = await criar(FORMULARIO, { banco, asaas });

  afirmar(
    "o segundo envio devolve a MESMA fatura",
    segunda.resultado.faturaUrl === primeira.resultado.faturaUrl,
  );
  afirmar(
    "e se anuncia como reaproveitado",
    segunda.resultado.reaproveitado === true,
  );
  afirmar(
    "nenhuma segunda assinatura é criada",
    asaas.assinaturas.size === 1,
    `assinaturas: ${asaas.assinaturas.size}`,
  );
  afirmar("e um só pedido existe", banco.pedidos.size === 1);
}

{
  // A execução anterior morreu depois de gravar o pedido e antes da fatura.
  const banco = bancoDeMentira();
  const asaas = asaasDeMentira({ falhaEm: { criarAssinatura: { status: 0 } } });
  const morta = await criar(FORMULARIO, { banco, asaas });
  afirmar(
    "queda no meio deixa o pedido gravado sem fatura",
    morta.resultado.ok === false && banco.pedidos.size === 1,
  );

  const retomada = await criar(FORMULARIO, { banco, asaas: asaasDeMentira() });
  afirmar(
    "a retomada COMPLETA o pedido existente em vez de abrir outro",
    retomada.resultado.ok === true && banco.pedidos.size === 1,
  );
}

{
  // Corrida: o índice único recusa a segunda gravação simultânea.
  const banco = bancoDeMentira();
  const asaas = asaasDeMentira();
  await criar(FORMULARIO, { banco, asaas });
  // O pendente existe mas com dimensionamento diferente do consultado: força o
  // caminho do `inserirPedido` batendo no índice.
  const linha = [...banco.pedidos.values()][0];
  linha.fatura_url = "https://sandbox.asaas.com/i/vencedora";
  const corrida = await criar(FORMULARIO, { banco, asaas });
  afirmar(
    "a corrida perdida devolve a fatura da vencedora, e não um erro",
    corrida.resultado.ok === true &&
      corrida.resultado.faturaUrl === "https://sandbox.asaas.com/i/vencedora",
  );
}

/* ═══ (e) Mudança de dimensionamento ═══════════════════════════════════════ */

secao("(e) Refazer o pedido com outro tamanho remove a assinatura anterior");

{
  const banco = bancoDeMentira();
  const asaas = asaasDeMentira();
  const primeira = await criar(FORMULARIO, { banco, asaas });
  const antiga = [...banco.pedidos.values()][0].asaas_assinatura_id;

  const segunda = await criar(
    { ...FORMULARIO, usuarios: 12 },
    { banco, asaas },
  );

  afirmar(
    "a assinatura antiga é REMOVIDA no Asaas",
    asaas.removidas.includes(antiga),
    `removidas: ${asaas.removidas.join(",")}`,
  );
  afirmar(
    "o pedido antigo vira `cancelado`",
    [...banco.pedidos.values()].some(
      (p) => p.estado === ESTADOS.CANCELADO && p.asaas_assinatura_id === antiga,
    ),
  );
  afirmar(
    "e o novo tem valor diferente do antigo",
    segunda.resultado.valorCentavos !== primeira.resultado.valorCentavos,
  );
  afirmar("existem dois pedidos, um cancelado e um vivo", banco.pedidos.size === 2);
}

{
  // Se a remoção falhar, abortar é melhor que deixar duas cobranças mensais.
  const banco = bancoDeMentira();
  const asaas = asaasDeMentira();
  await criar(FORMULARIO, { banco, asaas });
  const asaasQuebrado = asaasDeMentira({
    falhaEm: { removerAssinatura: { status: 500, mensagem: "indisponível" } },
  });
  asaasQuebrado.assinaturas = asaas.assinaturas;
  const segunda = await criar(
    { ...FORMULARIO, usuarios: 12 },
    { banco, asaas: asaasQuebrado },
  );
  afirmar(
    "remoção que falha ABORTA o novo pedido, para não gerar cobrança dupla",
    segunda.resultado.ok === false,
  );
  afirmar(
    "e o pedido antigo continua vivo, não cancelado pela metade",
    [...banco.pedidos.values()].every((p) => p.estado !== ESTADOS.CANCELADO),
  );
}

/* ═══ (f) O Asaas recusando e fora do ar ═══════════════════════════════════ */

secao("(f) O Asaas recusando, fora do ar, e respondendo torto");

{
  const asaas = asaasDeMentira({
    falhaEm: { criarCliente: { status: 400, mensagem: "cpfCnpj inválido" } },
  });
  const { resultado } = await criar(FORMULARIO, { asaas });
  afirmar(
    "recusa do Asaas vira `AsaasRecusou`, e não erro genérico",
    resultado.tipo === TIPOS.ASAAS_RECUSOU,
  );
  afirmar(
    "e a mensagem ao cliente não repete o texto cru do Asaas",
    !resultado.mensagem.includes("cpfCnpj"),
  );
  afirmar(
    "o detalhe cru fica no resultado, para o log do servidor",
    String(resultado.detalhe).includes("cpfCnpj"),
  );
}

{
  const asaas = asaasDeMentira({ falhaEm: { criarAssinatura: { status: 0 } } });
  const { resultado } = await criar(FORMULARIO, { asaas });
  afirmar(
    "`status: 0` (não falamos com o Asaas) vira `AsaasIndisponivel`",
    resultado.tipo === TIPOS.ASAAS_INDISPONIVEL,
  );
}

{
  const asaas = asaasDeMentira();
  asaas.cobrancasDaAssinatura = async () => ({
    ok: true,
    status: 200,
    dados: { id: "pay_1", invoiceUrl: null },
    codigo: "",
    mensagem: "",
  });
  const { resultado } = await criar(FORMULARIO, { asaas });
  afirmar(
    "cobrança sem `invoiceUrl` não vira redirecionamento para lugar nenhum",
    resultado.ok === false && resultado.tipo === TIPOS.ASAAS_RECUSOU,
  );
}

{
  const asaas = asaasDeMentira();
  asaas.criarCliente = async () => ({
    ok: true,
    status: 200,
    dados: {},
    codigo: "",
    mensagem: "",
  });
  const { resultado } = await criar(FORMULARIO, { asaas });
  afirmar(
    "cliente criado sem `id` é tratado como recusa, não como sucesso",
    resultado.ok === false,
  );
}

/* ═══ (g) O banco caindo ═══════════════════════════════════════════════════ */

secao("(g) O banco fora do ar em cada ponto do caminho");

for (const operacao of ["pedidoPendentePorCnpj", "inserirPedido"]) {
  const banco = bancoDeMentira({ falhaEm: { [operacao]: { status: 0 } } });
  const { resultado } = await criar(FORMULARIO, { banco });
  afirmar(
    `banco fora do ar em \`${operacao}\` vira \`BancoIndisponivel\``,
    resultado.tipo === TIPOS.BANCO_INDISPONIVEL,
  );
}

{
  const banco = bancoDeMentira({
    falhaEm: { inserirPedido: { status: 500, codigo: "42501" } },
  });
  const { resultado, asaas } = await criar(FORMULARIO, { banco });
  afirmar(
    "erro de banco com resposta vira `Banco`, e o Asaas não é chamado",
    resultado.tipo === TIPOS.BANCO && asaas.chamadas.length === 0,
  );
}

{
  // A cobrança existe e o Estado não foi atualizado: a fatura VAI, com
  // divergência no log. Falhar aqui deixaria o cliente sem pagar uma cobrança
  // que já foi criada.
  const banco = bancoDeMentira({
    falhaEm: { atualizarPedido: { status: 500, codigo: "42501" } },
  });
  const { resultado } = await criar(FORMULARIO, { banco });
  afirmar(
    "falha ao fechar o Estado NÃO esconde a fatura já criada",
    resultado.ok === true && typeof resultado.faturaUrl === "string",
  );
  afirmar(
    "e a divergência é anunciada para alguém conciliar",
    typeof resultado.divergencia === "string" && resultado.divergencia !== "",
  );
}

/* ═══ (h) O webhook: porta e idempotência ══════════════════════════════════ */

secao("(h) O webhook: token, corpo e entrega repetida");

const CONFIG = Object.freeze({
  chave: "$aact_hmlg_teste",
  ambiente: "sandbox",
  base: "https://api-sandbox.asaas.com/v3",
  tokenDoWebhook: "um-token-de-webhook-bem-longo",
  urlDoProvisionamento: "",
  segredoDoProvisionamento: "",
});

afirmar(
  "token confere só quando é exatamente igual",
  tokenConfere(CONFIG.tokenDoWebhook, CONFIG.tokenDoWebhook) &&
    !tokenConfere("um-token-de-webhook-bem-long0", CONFIG.tokenDoWebhook) &&
    !tokenConfere("", CONFIG.tokenDoWebhook) &&
    !tokenConfere(null, CONFIG.tokenDoWebhook) &&
    !tokenConfere(CONFIG.tokenDoWebhook, ""),
);

for (const corpo of [{}, { id: "evt_1" }, { event: "PAYMENT_CONFIRMED" }, { id: "", event: "" }]) {
  const banco = bancoDeMentira();
  const r = await receberEvento({ corpo, banco, config: CONFIG });
  afirmar(
    `corpo ${JSON.stringify(corpo)} é recusado como inválido`,
    r.invalido === true && banco.eventos.size === 0,
  );
}

{
  const banco = bancoDeMentira();
  const evento = { id: "evt_orfao", event: "PAYMENT_CONFIRMED", payment: { subscription: "sub_desconhecida" } };
  const r = await receberEvento({ corpo: evento, banco, config: CONFIG });
  afirmar(
    "evento de assinatura que não é nossa é GUARDADO e ignorado",
    r.aceito === true && banco.eventos.size === 1,
  );
  afirmar(
    "e o motivo fica registrado no evento",
    banco.eventos.get("evt_orfao").erro === "sem pedido correspondente",
  );
}

{
  const banco = bancoDeMentira();
  const evento = { id: "evt_estranho", event: "PAYMENT_ANTICIPATED", payment: { subscription: "sub_x" } };
  const r = await receberEvento({ corpo: evento, banco, config: CONFIG });
  afirmar(
    "evento fora da lista de permissão é guardado sem ação",
    r.aceito === true && banco.eventos.size === 1,
  );
}

{
  const banco = bancoDeMentira({ falhaEm: { registrarEvento: { status: 0 } } });
  const r = await receberEvento({
    corpo: { id: "evt_1", event: "PAYMENT_CONFIRMED" },
    banco,
    config: CONFIG,
  });
  afirmar(
    "não conseguir GUARDAR é o único caso que pede reenvio do Asaas",
    r.aceito === false && r.invalido !== true,
  );
}

/* ═══ (i) As transições por evento ═════════════════════════════════════════ */

secao("(i) Cada evento move o pedido para onde deve, e só uma vez");

/** Monta um pedido já em `aguardando_pagamento`, pronto para receber eventos. */
async function pedidoPronto() {
  const banco = bancoDeMentira();
  const asaas = asaasDeMentira();
  await criar(FORMULARIO, { banco, asaas });
  const linha = [...banco.pedidos.values()][0];
  return { banco, asaas, linha };
}

const EVENTO_PARA_ESTADO = [
  ["PAYMENT_OVERDUE", ESTADOS.VENCIDO],
  ["PAYMENT_REFUNDED", ESTADOS.CANCELADO],
  ["PAYMENT_CHARGEBACK_REQUESTED", ESTADOS.CANCELADO],
  ["SUBSCRIPTION_DELETED", ESTADOS.CANCELADO],
  ["SUBSCRIPTION_INACTIVATED", ESTADOS.CANCELADO],
];

for (const [evento, esperado] of EVENTO_PARA_ESTADO) {
  const { banco, linha } = await pedidoPronto();
  const corpo = evento.startsWith("SUBSCRIPTION")
    ? { id: `evt_${evento}`, event: evento, subscription: { id: linha.asaas_assinatura_id } }
    : { id: `evt_${evento}`, event: evento, payment: { subscription: linha.asaas_assinatura_id } };
  await receberEvento({ corpo, banco, config: CONFIG });
  afirmar(
    `\`${evento}\` leva o pedido a \`${esperado}\``,
    banco.pedidos.get(linha.id).estado === esperado,
    banco.pedidos.get(linha.id).estado,
  );
}

for (const evento of ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]) {
  const { banco, linha } = await pedidoPronto();
  await receberEvento({
    corpo: { id: `evt_${evento}`, event: evento, payment: { subscription: linha.asaas_assinatura_id } },
    banco,
    config: CONFIG,
  });
  afirmar(
    `\`${evento}\` reconhece o pagamento (Pix e boleto pulam o CONFIRMED)`,
    banco.pedidos.get(linha.id).estado === ESTADOS.FALHA_NO_PROVISIONAMENTO,
    banco.pedidos.get(linha.id).estado,
  );
}

afirmar(
  "os dois eventos de pagamento significam a MESMA ação",
  EVENTOS_QUE_TRATAMOS.PAYMENT_CONFIRMED === EVENTOS_QUE_TRATAMOS.PAYMENT_RECEIVED,
);

{
  const { banco, linha } = await pedidoPronto();
  const corpo = { id: "evt_repetido", event: "PAYMENT_CONFIRMED", payment: { subscription: linha.asaas_assinatura_id } };
  const primeira = await receberEvento({ corpo, banco, config: CONFIG });
  const segunda = await receberEvento({ corpo, banco, config: CONFIG });
  afirmar(
    "entrega repetida do MESMO evento não reprocessa",
    primeira.novo === true && segunda.novo === false && segunda.aceito === true,
  );
  afirmar("e não duplica a linha do evento", banco.eventos.size === 1);
}

{
  // Dois eventos DIFERENTES para o mesmo pagamento: CONFIRMED e depois
  // RECEIVED, que é o par que o Asaas entrega de verdade.
  const { banco, linha } = await pedidoPronto();
  await receberEvento({
    corpo: { id: "evt_c", event: "PAYMENT_CONFIRMED", payment: { subscription: linha.asaas_assinatura_id } },
    banco,
    config: CONFIG,
  });
  const antes = banco.provisionamentos.length;
  await receberEvento({
    corpo: { id: "evt_r", event: "PAYMENT_RECEIVED", payment: { subscription: linha.asaas_assinatura_id } },
    banco,
    config: CONFIG,
  });
  afirmar(
    "o segundo evento de pagamento não remarca o pedido como pago de novo",
    banco.eventos.size === 2 && banco.provisionamentos.length === antes,
  );
}

{
  const { banco, linha } = await pedidoPronto();
  await receberEvento({
    corpo: { id: "evt_cancela", event: "SUBSCRIPTION_DELETED", subscription: { id: linha.asaas_assinatura_id } },
    banco,
    config: CONFIG,
  });
  await receberEvento({
    corpo: { id: "evt_cancela_2", event: "SUBSCRIPTION_INACTIVATED", subscription: { id: linha.asaas_assinatura_id } },
    banco,
    config: CONFIG,
  });
  afirmar(
    "cancelado é final: um segundo evento de encerramento não muda nada",
    banco.pedidos.get(linha.id).estado === ESTADOS.CANCELADO,
  );
}

/* ═══ (j) O provisionamento ════════════════════════════════════════════════ */

secao("(j) O provisionamento: gatilho desarmado, assinatura e tentativas");

{
  const { banco, linha } = await pedidoPronto();
  await receberEvento({
    corpo: { id: "evt_sem_config", event: "PAYMENT_CONFIRMED", payment: { subscription: linha.asaas_assinatura_id } },
    banco,
    config: CONFIG,
  });
  afirmar(
    "sem `PROVISIONAMENTO_URL` o pedido pago para em `falha_no_provisionamento`",
    banco.pedidos.get(linha.id).estado === ESTADOS.FALHA_NO_PROVISIONAMENTO,
  );
  afirmar(
    "e NENHUMA tentativa é gasta, então o orçamento fica inteiro para depois",
    banco.provisionamentos.length === 0,
  );
  afirmar(
    "o evento fica com o motivo escrito, e não silencioso",
    String(banco.eventos.get("evt_sem_config").erro).includes("não configurado"),
  );
}

/* O servidor de verdade que recebe o disparo. */
const SEGREDO = "segredo-de-provisionamento-para-o-teste";
const recebidos = [];
let respostaDoReceptor = { status: 200, corpo: '{"contaId":"acc_1"}' };

const receptor = createServer((req, res) => {
  const pedacos = [];
  req.on("data", (p) => pedacos.push(p));
  req.on("end", () => {
    recebidos.push({
      metodo: req.method,
      cabecalhos: req.headers,
      corpo: Buffer.concat(pedacos).toString("utf8"),
    });
    res.writeHead(respostaDoReceptor.status, { "Content-Type": "application/json" });
    res.end(respostaDoReceptor.corpo);
  });
});

await new Promise((resolver) => receptor.listen(0, "127.0.0.1", resolver));
const porta = receptor.address().port;
const URL_DO_RECEPTOR = `http://127.0.0.1:${porta}/provisionar`;

const CONFIG_ARMADA = Object.freeze({
  ...CONFIG,
  urlDoProvisionamento: URL_DO_RECEPTOR,
  segredoDoProvisionamento: SEGREDO,
});

{
  recebidos.length = 0;
  respostaDoReceptor = { status: 200, corpo: '{"contaId":"acc_1"}' };

  const { banco, linha } = await pedidoPronto();
  await receberEvento({
    corpo: { id: "evt_provisiona", event: "PAYMENT_CONFIRMED", payment: { subscription: linha.asaas_assinatura_id, id: "pay_x" } },
    banco,
    config: CONFIG_ARMADA,
  });

  afirmar(
    "com a URL configurada, o pedido chega a `ativo`",
    banco.pedidos.get(linha.id).estado === ESTADOS.ATIVO,
    banco.pedidos.get(linha.id).estado,
  );
  afirmar("o receptor recebeu exatamente uma chamada", recebidos.length === 1);

  const chamada = recebidos[0];
  afirmar("a chamada é POST", chamada?.metodo === "POST");

  const timestamp = chamada?.cabecalhos["x-chatclean-timestamp"];
  const assinatura = chamada?.cabecalhos["x-chatclean-assinatura"];
  const esperada = `sha256=${assinarCorpo(chamada?.corpo ?? "", SEGREDO, timestamp)}`;
  afirmar("a assinatura HMAC confere com o corpo recebido", assinatura === esperada);
  afirmar(
    "o timestamp entra no cálculo (assinar só o corpo valeria para sempre)",
    assinatura !==
      `sha256=${createHmac("sha256", SEGREDO).update(chamada?.corpo ?? "").digest("hex")}`,
  );
  afirmar(
    "a chave de idempotência viaja no cabeçalho",
    typeof chamada?.cabecalhos["x-chatclean-idempotencia"] === "string" &&
      chamada.cabecalhos["x-chatclean-idempotencia"].startsWith(linha.id),
  );

  const corpo = JSON.parse(chamada?.corpo ?? "{}");
  afirmar(
    "o corpo leva o pedido, o cliente e a contratação",
    corpo.pedidoId === linha.id &&
      corpo.cliente?.cnpj === "33000167000101" &&
      corpo.contratacao?.planoId === "pro" &&
      corpo.contratacao?.usuarios === 5,
  );
  afirmar(
    "e leva o que o Asaas identifica, para o outro lado conciliar",
    corpo.asaas?.assinaturaId === linha.asaas_assinatura_id,
  );
  afirmar(
    "a tentativa fica registrada como bem-sucedida",
    banco.provisionamentos.length === 1 && banco.provisionamentos[0].ok === true,
  );
}

{
  recebidos.length = 0;
  respostaDoReceptor = { status: 500, corpo: '{"erro":"caiu"}' };

  const { banco, linha } = await pedidoPronto();
  await receberEvento({
    corpo: { id: "evt_falha_1", event: "PAYMENT_CONFIRMED", payment: { subscription: linha.asaas_assinatura_id } },
    banco,
    config: CONFIG_ARMADA,
  });

  afirmar(
    "receptor respondendo 500 leva a `falha_no_provisionamento`",
    banco.pedidos.get(linha.id).estado === ESTADOS.FALHA_NO_PROVISIONAMENTO,
  );
  afirmar(
    "a tentativa fica registrada como falha, com o status",
    banco.provisionamentos[0]?.ok === false && banco.provisionamentos[0]?.status_http === 500,
  );

  // Mais eventos de pagamento: cada um gasta UMA tentativa, até o teto.
  for (let i = 2; i <= MAXIMO_DE_TENTATIVAS + 2; i += 1) {
    await receberEvento({
      corpo: { id: `evt_falha_${i}`, event: "PAYMENT_CONFIRMED", payment: { subscription: linha.asaas_assinatura_id } },
      banco,
      config: CONFIG_ARMADA,
    });
  }
  afirmar(
    `as tentativas param em ${MAXIMO_DE_TENTATIVAS}, e não tentam para sempre`,
    banco.provisionamentos.length === MAXIMO_DE_TENTATIVAS,
    `foram ${banco.provisionamentos.length}`,
  );
  afirmar(
    "o receptor não recebeu mais chamadas depois do teto",
    recebidos.length === MAXIMO_DE_TENTATIVAS,
  );
}

{
  // Depois de o receptor voltar, o pedido volta a andar sem tocar no banco.
  recebidos.length = 0;
  respostaDoReceptor = { status: 500, corpo: "caiu" };

  const { banco, linha } = await pedidoPronto();
  await receberEvento({
    corpo: { id: "evt_r1", event: "PAYMENT_CONFIRMED", payment: { subscription: linha.asaas_assinatura_id } },
    banco,
    config: CONFIG_ARMADA,
  });
  afirmar(
    "o pedido está travado depois da primeira falha",
    banco.pedidos.get(linha.id).estado === ESTADOS.FALHA_NO_PROVISIONAMENTO,
  );

  respostaDoReceptor = { status: 201, corpo: '{"contaId":"acc_2"}' };
  await receberEvento({
    corpo: { id: "evt_r2", event: "PAYMENT_RECEIVED", payment: { subscription: linha.asaas_assinatura_id } },
    banco,
    config: CONFIG_ARMADA,
  });
  afirmar(
    "com o receptor de pé, o evento seguinte destrava e o pedido vira `ativo`",
    banco.pedidos.get(linha.id).estado === ESTADOS.ATIVO,
    banco.pedidos.get(linha.id).estado,
  );
}

await new Promise((resolver) => receptor.close(resolver));

/* ═══ (k) A chave que esconde o checkout ═══════════════════════════════════ */

secao("(k) A chave: o padrão é OCULTO, e a porta segue a tela");

afirmar(
  "ambiente vazio esconde o checkout",
  checkoutAtivo({}) === false && checkoutAtivo() === false,
);
afirmar(
  "`1` e `true` ligam, em qualquer caixa e com espaço em volta",
  checkoutAtivo({ VITE_CHECKOUT_ATIVO: "1" }) &&
    checkoutAtivo({ VITE_CHECKOUT_ATIVO: " TRUE " }) &&
    checkoutAtivo({ CHECKOUT_ATIVO: "true" }),
);
afirmar(
  "a lista é fechada: `sim`, `on`, `ativo` e `0` NÃO ligam",
  ["sim", "on", "yes", "ativo", "0", "false", "nao"].every(
    (valor) => checkoutAtivo({ VITE_CHECKOUT_ATIVO: valor }) === false,
  ),
);
afirmar(
  "valor que não é texto não liga",
  [1, true, null, undefined, {}, []].every(
    (valor) => checkoutAtivo({ VITE_CHECKOUT_ATIVO: valor }) === false,
  ),
);
afirmar(
  "o nome do servidor tem precedência sobre o do navegador",
  checkoutAtivo({ CHECKOUT_ATIVO: "0", VITE_CHECKOUT_ATIVO: "1" }) === false &&
    checkoutAtivo({ CHECKOUT_ATIVO: "1", VITE_CHECKOUT_ATIVO: "0" }) === true,
);
afirmar(
  "variável vazia não decide: cai para a próxima, e depois para oculto",
  checkoutAtivo({ CHECKOUT_ATIVO: "   ", VITE_CHECKOUT_ATIVO: "1" }) === true &&
    checkoutAtivo({ CHECKOUT_ATIVO: "", VITE_CHECKOUT_ATIVO: "" }) === false,
);

/* A porta, com a chave dos dois lados. */

function respostaDaPorta() {
  const estado = { status: null, corpo: null };
  const res = {
    setHeader() {},
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

async function chamarAPorta(ambiente) {
  const guardado = { ...process.env };
  for (const nome of ["CHECKOUT_ATIVO", "VITE_CHECKOUT_ATIVO"]) {
    delete process.env[nome];
  }
  Object.assign(process.env, ambiente);
  const { estado, res } = respostaDaPorta();
  try {
    await assinar({ method: "POST", headers: {}, body: { ...FORMULARIO } }, res);
  } finally {
    for (const nome of Object.keys(process.env)) delete process.env[nome];
    Object.assign(process.env, guardado);
  }
  return estado;
}

{
  const estado = await chamarAPorta({});
  afirmar(
    "com a chave desligada, `POST /api/assinar` responde 404",
    estado.status === 404,
    String(estado.status),
  );
  afirmar(
    "e a resposta não conta que a rota existe",
    estado.corpo?.tipo === "NaoEncontrado" &&
      !JSON.stringify(estado.corpo).toLowerCase().includes("desativ") &&
      !JSON.stringify(estado.corpo).toLowerCase().includes("checkout"),
    JSON.stringify(estado.corpo),
  );
}

{
  // Com a chave ligada e o resto do ambiente vazio, a porta passa da chave e
  // para na configuração. É isso que prova que ela PASSOU da chave.
  const estado = await chamarAPorta({ CHECKOUT_ATIVO: "1" });
  afirmar(
    "com a chave ligada, a porta passa e segue para a configuração",
    estado.status !== 404,
    String(estado.status),
  );
}

/* ═══ Fecho ════════════════════════════════════════════════════════════════ */

console.log("");
if (falhas > 0) {
  console.log(`Checkout NÃO verificado: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log(`Checkout verificado: ${ok} asserções passaram.`);
}
