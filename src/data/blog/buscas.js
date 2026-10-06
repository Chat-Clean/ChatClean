/**
 * As buscas do Google — o que o Painel lê de `buscas_do_google`.
 *
 * ─── SÓ LEITURA, E SÓ DO PAINEL ─────────────────────────────────────────────
 *
 * Quem grava é a sincronização diária (`scripts/sincronizar-buscas.mjs`), com a
 * chave de serviço, fora do navegador. Aqui só se lê, e sempre com sessão: o
 * banco não tem política de leitura para `anon` nessa tabela, e pelo cliente
 * anônimo a resposta seria uma recusa.
 *
 * ─── AS SOMAS ACONTECEM NO BANCO ────────────────────────────────────────────
 *
 * A tabela tem uma linha por dia por página por termo. Somar no navegador
 * funcionaria com poucas páginas e deixaria de caber quando o site crescesse.
 * As quatro funções devolvem a resposta do tamanho do que a tela desenha.
 *
 * ─── NADA DISTO FALA COM O GOOGLE ───────────────────────────────────────────
 *
 * A chave do Search Console é segredo de servidor. Este módulo não a conhece,
 * e não há caminho daqui até ela.
 */

import { clienteDoPainelOuFalha } from "./comum.js";
import { diasValidos, MAXIMO_DE_DIAS } from "./leituras.js";
import {
  consultar,
  descrever,
  ERRO_INESPERADO,
  exigirLista,
  falha,
  sinalDePrazo,
  sucesso,
} from "./resultado.js";

/** As funções de banco que a tela de Buscas chama. */
export const FUNCAO_DE_BUSCAS_POR_DIA = "buscas_por_dia";
export const FUNCAO_DE_BUSCAS_POR_PAGINA = "buscas_por_pagina";
export const FUNCAO_DE_BUSCAS_POR_TERMO = "buscas_por_termo";
export const FUNCAO_DO_ULTIMO_DIA_DE_BUSCAS = "buscas_ultimo_dia";

/** O teto do caminho de uma página — o mesmo que a tabela cobra. */
const TAMANHO_MAXIMO_DA_PAGINA = 2048;

/** `AAAA-MM-DD`, que é como o PostgREST entrega uma coluna de data. */
const FORMATO_DE_DIA = /^\d{4}-\d{2}-\d{2}$/;

function periodoRecusado(operacao, dias) {
  return falha(ERRO_INESPERADO, {
    operacao,
    mensagem: "O período pedido não existe. Escolha o período de novo.",
    detalhe: `dias fora de [1, ${MAXIMO_DE_DIAS}]: ${descrever(dias)}`,
  });
}

/**
 * A página pedida: `null` para o site inteiro, o caminho para uma página, ou
 * `undefined` quando o valor não é um caminho utilizável.
 *
 * Recusada, e não ignorada: ignorá-la mostraria os números do site inteiro com
 * o nome de uma página em cima.
 */
function paginaValida(pagina) {
  if (pagina === null || pagina === undefined || pagina === "") return null;
  if (typeof pagina !== "string") return undefined;
  const limpa = pagina.trim();
  if (!limpa.startsWith("/") || limpa.length > TAMANHO_MAXIMO_DA_PAGINA) return undefined;
  return limpa;
}

function paginaRecusada(operacao, pagina) {
  return falha(ERRO_INESPERADO, {
    operacao,
    mensagem: "A página escolhida não existe mais. Escolha a página de novo.",
    detalhe: `página fora do formato de caminho: ${descrever(pagina)}`,
  });
}

const ehContagem = (valor) => Number.isSafeInteger(valor) && valor >= 0;
const ehPosicao = (valor) => typeof valor === "number" && Number.isFinite(valor) && valor >= 0;

function problemaNosNumeros(linha) {
  if (!ehContagem(linha.cliques)) return `\`cliques\` não é um inteiro não negativo: ${descrever(linha.cliques)}`;
  if (!ehContagem(linha.impressoes)) {
    return `\`impressoes\` não é um inteiro não negativo: ${descrever(linha.impressoes)}`;
  }
  if (!ehPosicao(linha.posicao)) return `\`posicao\` não é um número não negativo: ${descrever(linha.posicao)}`;
  return null;
}

const ehObjeto = (linha) => linha !== null && typeof linha === "object" && !Array.isArray(linha);

function problemaNoDia(linha) {
  if (!ehObjeto(linha)) return `esperava um objeto e veio ${descrever(linha)}`;
  if (typeof linha.dia !== "string" || !FORMATO_DE_DIA.test(linha.dia)) {
    return `\`dia\` fora do formato AAAA-MM-DD: ${descrever(linha.dia)}`;
  }
  return problemaNosNumeros(linha);
}

function problemaNaPagina(linha) {
  if (!ehObjeto(linha)) return `esperava um objeto e veio ${descrever(linha)}`;
  if (typeof linha.pagina !== "string" || !linha.pagina.startsWith("/")) {
    return `\`pagina\` não é um caminho: ${descrever(linha.pagina)}`;
  }
  if (linha.titulo !== null && typeof linha.titulo !== "string") {
    return `\`titulo\` não é texto nem nulo: ${descrever(linha.titulo)}`;
  }
  if (linha.leituras !== null && !ehContagem(linha.leituras)) {
    return `\`leituras\` não é um inteiro não negativo nem nulo: ${descrever(linha.leituras)}`;
  }
  return problemaNosNumeros(linha);
}

function problemaNoTermo(linha) {
  if (!ehObjeto(linha)) return `esperava um objeto e veio ${descrever(linha)}`;
  if (typeof linha.termo !== "string" || linha.termo === "") return "`termo` ausente";
  return problemaNosNumeros(linha);
}

/**
 * Cliques, impressões e posição de cada dia dos últimos `dias` dias.
 *
 * Um ponto por dia, sempre, do mais antigo para hoje. `pagina` restringe a uma
 * página; ausente, é o site inteiro. Os dias mais recentes vêm zerados porque o
 * Google ainda não os entregou — `lerUltimoDiaDeBuscas` diz até onde há dado.
 */
export async function lerBuscasPorDia({ dias = 30, pagina = null } = {}) {
  const operacao = "lerBuscasPorDia";
  const periodo = diasValidos(dias);
  if (periodo === null) return periodoRecusado(operacao, dias);
  const alvo = paginaValida(pagina);
  if (alvo === undefined) return paginaRecusada(operacao, pagina);

  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .rpc(FUNCAO_DE_BUSCAS_POR_DIA, { p_dias: periodo, p_pagina: alvo })
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;
  return exigirLista(resposta.dados, { operacao, validarItem: problemaNoDia });
}

/**
 * As páginas mais clicadas no Google nos últimos `dias` dias.
 *
 * Quando a página é um Post, `titulo` e `leituras` vêm preenchidos; nas demais,
 * nulos. A ordem é a do banco, e a tela não reordena.
 */
export async function listarPaginasBuscadas({ dias = 30 } = {}) {
  const operacao = "listarPaginasBuscadas";
  const periodo = diasValidos(dias);
  if (periodo === null) return periodoRecusado(operacao, dias);

  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .rpc(FUNCAO_DE_BUSCAS_POR_PAGINA, { p_dias: periodo })
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;
  return exigirLista(resposta.dados, { operacao, validarItem: problemaNaPagina });
}

/**
 * Os termos de busca com mais cliques nos últimos `dias` dias, do site inteiro
 * ou de uma página.
 */
export async function listarTermosBuscados({ dias = 30, pagina = null } = {}) {
  const operacao = "listarTermosBuscados";
  const periodo = diasValidos(dias);
  if (periodo === null) return periodoRecusado(operacao, dias);
  const alvo = paginaValida(pagina);
  if (alvo === undefined) return paginaRecusada(operacao, pagina);

  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .rpc(FUNCAO_DE_BUSCAS_POR_TERMO, { p_dias: periodo, p_pagina: alvo })
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;
  return exigirLista(resposta.dados, { operacao, validarItem: problemaNoTermo });
}

/**
 * O dia mais recente com dado do Google, ou `null` quando a sincronização
 * ainda não gravou nada.
 */
export async function lerUltimoDiaDeBuscas() {
  const operacao = "lerUltimoDiaDeBuscas";
  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados.rpc(FUNCAO_DO_ULTIMO_DIA_DE_BUSCAS).abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  const dia = resposta.dados;
  if (dia === null || dia === undefined) return sucesso(null);
  if (typeof dia !== "string" || !FORMATO_DE_DIA.test(dia)) {
    return falha(ERRO_INESPERADO, {
      operacao,
      detalhe: `esperava um dia AAAA-MM-DD ou nulo e veio ${descrever(dia)}`,
    });
  }
  return sucesso(dia);
}
