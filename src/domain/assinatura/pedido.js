/**
 * O pedido de assinatura: vocabulário, validação e datas.
 *
 * Puro. É o mesmo módulo que a tela usa para acusar campo inválido e que
 * `api/assinar.js` usa para recusar o pedido — e essa é a razão de ele existir
 * separado da tela. Validação que só roda no navegador não é validação: é
 * cortesia com quem usa o navegador. Aqui a regra é uma, e as duas pontas a
 * executam.
 */

import {
  DIA_DE_VENCIMENTO,
  LIMITES,
  planoPorId,
  quantidadeValida,
} from "./planos.js";

/* ─── Estados ───────────────────────────────────────────────────────────────
 *
 * Vocabulário fechado, e o caminho é de mão única. O nome do estado é o que
 * aparece no banco, no log e na tela — sem sinônimo e sem tradução no meio.
 */
export const ESTADOS = Object.freeze({
  RASCUNHO: "rascunho",
  AGUARDANDO_PAGAMENTO: "aguardando_pagamento",
  PAGO: "pago",
  PROVISIONANDO: "provisionando",
  ATIVO: "ativo",
  VENCIDO: "vencido",
  CANCELADO: "cancelado",
  FALHA_NO_PROVISIONAMENTO: "falha_no_provisionamento",
});

export const TODOS_OS_ESTADOS = Object.freeze(Object.values(ESTADOS));

/**
 * Para onde cada estado pode ir. A tabela é lida pelo banco também (a migração
 * repete a lista como restrição), e a repetição é deliberada: a defesa do banco
 * não confia na aplicação.
 */
export const TRANSICOES = Object.freeze({
  [ESTADOS.RASCUNHO]: Object.freeze([ESTADOS.AGUARDANDO_PAGAMENTO, ESTADOS.CANCELADO]),
  [ESTADOS.AGUARDANDO_PAGAMENTO]: Object.freeze([
    ESTADOS.PAGO,
    ESTADOS.VENCIDO,
    ESTADOS.CANCELADO,
  ]),
  [ESTADOS.PAGO]: Object.freeze([ESTADOS.PROVISIONANDO]),
  [ESTADOS.PROVISIONANDO]: Object.freeze([
    ESTADOS.ATIVO,
    ESTADOS.FALHA_NO_PROVISIONAMENTO,
  ]),
  [ESTADOS.FALHA_NO_PROVISIONAMENTO]: Object.freeze([ESTADOS.PROVISIONANDO]),
  [ESTADOS.VENCIDO]: Object.freeze([ESTADOS.PAGO, ESTADOS.CANCELADO]),
  [ESTADOS.ATIVO]: Object.freeze([ESTADOS.CANCELADO]),
  [ESTADOS.CANCELADO]: Object.freeze([]),
});

export function transicaoPermitida(de, para) {
  const saidas = TRANSICOES[de];
  return Array.isArray(saidas) && saidas.includes(para);
}

/* ─── Normalização ─────────────────────────────────────────────────────── */

export function somenteDigitos(bruto) {
  return String(bruto ?? "").replace(/\D+/g, "");
}

function texto(bruto) {
  return String(bruto ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ─── CNPJ ─────────────────────────────────────────────────────────────────
 *
 * Dígito verificador conferido de verdade. Contar catorze dígitos aceita
 * `11111111111111`, que o Asaas recusa depois — e a recusa chega como erro
 * genérico de API, num ponto do fluxo em que o cliente já achava que tinha
 * terminado. Falhar aqui, no campo, com o motivo, é a diferença.
 *
 * Aceitar CPF no futuro (autônomo, MEI) é acrescentar o algoritmo de 11 dígitos
 * e afrouxar esta função — o resto do fluxo não muda, porque o Asaas usa o
 * mesmo campo `cpfCnpj` para os dois.
 */
export function cnpjEhValido(bruto) {
  const digitos = somenteDigitos(bruto);
  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const verificador = (tamanho) => {
    let soma = 0;
    let peso = tamanho - 7;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(digitos[i]) * peso;
      peso -= 1;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return (
    verificador(12) === Number(digitos[12]) &&
    verificador(13) === Number(digitos[13])
  );
}

export function formatarCnpj(bruto) {
  const d = somenteDigitos(bruto).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(
    8,
    12,
  )}-${d.slice(12)}`;
}

/* ─── Telefone ─────────────────────────────────────────────────────────────
 *
 * Dez ou onze dígitos com DDD brasileiro real. O DDD começa em 11: não existe
 * DDD 00 nem 10, e telefone com DDD inválido é mensagem que nunca chega — num
 * canal que é o produto que estamos vendendo.
 */
export function telefoneEhValido(bruto) {
  const digitos = somenteDigitos(bruto);
  if (digitos.length !== 10 && digitos.length !== 11) return false;
  const ddd = Number(digitos.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  // Onze dígitos é celular, e celular brasileiro começa com 9 depois do DDD.
  if (digitos.length === 11 && digitos[2] !== "9") return false;
  return true;
}

export function formatarTelefone(bruto) {
  const d = somenteDigitos(bruto).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/* ─── E-mail ───────────────────────────────────────────────────────────────
 *
 * Forma conservadora, sem tentar implementar a RFC: um arroba, sem espaço, com
 * ponto no domínio. O e-mail vira o acesso da conta, então a única prova real é
 * a mensagem chegar — e essa prova acontece depois, no e-mail de confirmação.
 */
const FORMA_DO_EMAIL = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export function emailEhValido(bruto) {
  const valor = texto(bruto);
  return valor.length <= 254 && FORMA_DO_EMAIL.test(valor);
}

/* ─── O formulário inteiro ─────────────────────────────────────────────── */

/** Os campos que o formulário coleta. Lista fechada: o resto é descartado. */
export const CAMPOS_DO_FORMULARIO = Object.freeze([
  "nome",
  "email",
  "telefone",
  "cnpj",
  "razaoSocial",
  "planoId",
  "usuarios",
  "conexoes",
  "diaDeVencimento",
  "aceitouOsTermos",
]);

/**
 * Valida e normaliza o pedido inteiro.
 *
 * Devolve `{ ok: true, pedido }` com os valores já limpos, ou
 * `{ ok: false, erros }` onde `erros` mapeia campo → frase para a tela mostrar
 * embaixo do campo. Nunca lança.
 *
 * O plano e o preço NÃO vêm do cliente: chegam aqui só o identificador do plano
 * e os dois limites, e o valor é recalculado a partir da tabela do domínio.
 */
export function validarPedido(bruto = {}) {
  const erros = {};

  const nome = texto(bruto.nome);
  if (nome.length < 3) erros.nome = "Escreva o nome de quem vai administrar a conta";
  else if (nome.length > 120) erros.nome = "Nome muito longo";

  const email = texto(bruto.email).toLowerCase();
  if (!emailEhValido(email)) erros.email = "Confira o e-mail";

  const telefone = somenteDigitos(bruto.telefone);
  if (!telefoneEhValido(telefone))
    erros.telefone = "Informe DDD e número, com 10 ou 11 dígitos";

  const cnpj = somenteDigitos(bruto.cnpj);
  if (!cnpjEhValido(cnpj)) erros.cnpj = "Este CNPJ não existe. Confira os números";

  const razaoSocial = texto(bruto.razaoSocial);
  if (razaoSocial.length < 3) erros.razaoSocial = "Informe a razão social da empresa";
  else if (razaoSocial.length > 200) erros.razaoSocial = "Razão social muito longa";

  const plano = planoPorId(bruto.planoId);
  if (plano === null) erros.planoId = "Escolha um plano";

  const usuarios = quantidadeValida(bruto.usuarios, LIMITES.usuarios);
  if (usuarios === null)
    erros.usuarios = `Informe de ${LIMITES.usuarios.minimo} a ${LIMITES.usuarios.maximo} usuários`;

  const conexoes = quantidadeValida(bruto.conexoes, LIMITES.conexoes);
  if (conexoes === null)
    erros.conexoes = `Informe de ${LIMITES.conexoes.minimo} a ${LIMITES.conexoes.maximo} conexões`;

  if (plano !== null && conexoes !== null && conexoes > plano.maximoDeConexoes) {
    erros.conexoes = `O ${plano.nome} atende até ${plano.maximoDeConexoes} conexões`;
  }

  const diaDeVencimento = quantidadeValida(bruto.diaDeVencimento, DIA_DE_VENCIMENTO);
  if (diaDeVencimento === null)
    erros.diaDeVencimento = `Escolha um dia entre ${DIA_DE_VENCIMENTO.minimo} e ${DIA_DE_VENCIMENTO.maximo}`;

  // O aceite é `true` literal. `"on"`, `"true"` e `1` são recusados de
  // propósito: o registro do consentimento é prova, e prova não se infere de
  // valor ambíguo que chegou pela rede.
  if (bruto.aceitouOsTermos !== true)
    erros.aceitouOsTermos = "É preciso aceitar os termos para continuar";

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return {
    ok: true,
    pedido: {
      nome,
      email,
      telefone,
      cnpj,
      razaoSocial,
      planoId: plano.id,
      usuarios,
      conexoes,
      diaDeVencimento,
      aceitouOsTermos: true,
    },
  };
}

/* ─── Datas ────────────────────────────────────────────────────────────────
 *
 * O primeiro vencimento é a PRÓXIMA ocorrência do dia escolhido, contando a
 * partir de hoje inclusive. Escolher hoje vence hoje.
 *
 * Não há teste grátis: a conta nasce quando o pagamento é confirmado. Então
 * vencimento distante não é serviço de graça — é espera. Quem quer usar hoje
 * paga no Pix hoje, e a fatura já está disponível desde a contratação. É por
 * isso que não empurramos o vencimento para "pelo menos três dias à frente":
 * empurrar atrasaria a liberação de quem tem pressa.
 */
export function primeiroVencimento(diaDeVencimento, hoje = new Date()) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const dia = hoje.getDate();

  const alvo =
    dia <= diaDeVencimento
      ? new Date(ano, mes, diaDeVencimento)
      : new Date(ano, mes + 1, diaDeVencimento);

  return dataDoAsaas(alvo);
}

/** `AAAA-MM-DD` no fuso local — o formato que o Asaas espera em `nextDueDate`. */
export function dataDoAsaas(data) {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/**
 * A referência que amarra o registro do Asaas ao nosso pedido.
 *
 * É esta string que faz a criação ser idempotente: antes de criar qualquer
 * coisa no Asaas, consultamos por ela. O Asaas não tem cabeçalho de
 * idempotência — a documentação deles manda consultar antes de repetir, e esta
 * é a chave da consulta.
 *
 * A forma é a MESMA da coluna gerada `referencia_externa` na migração
 * 20260903120000. Quem grava é o banco; esta função existe para quem só tem o
 * identificador em mãos, e as duas precisam concordar.
 */
export function referenciaExterna(pedidoId) {
  return `chatclean:pedido:${pedidoId}`;
}

/**
 * A versão do texto dos termos que está no ar.
 *
 * Vai gravada junto com o aceite. Sem ela o consentimento não prova nada: o
 * texto muda, e um registro que diz apenas "aceitou" não diz o que foi aceito.
 * Mudar o texto dos termos é mudar esta constante na mesma alteração.
 */
export const VERSAO_DOS_TERMOS = "2026-09-04";

/** A descrição que o cliente lê na fatura e no extrato. */
export function descricaoDaAssinatura(plano, { usuarios, conexoes }) {
  const partes = [
    `ChatClean ${plano.nome}`,
    `${usuarios} ${usuarios === 1 ? "usuário" : "usuários"}`,
    `${conexoes} ${conexoes === 1 ? "conexão" : "conexões"}`,
  ];
  return partes.join(" · ");
}
