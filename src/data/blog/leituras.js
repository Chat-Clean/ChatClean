/**
 * Leituras dos Posts — registrar uma leitura, e ler os totais no Painel.
 *
 * ─── A ÚNICA ESCRITA QUE SAI DO NAVEGADOR ───────────────────────────────────
 *
 * Toda escrita do projeto passa por função de servidor, e esta é a exceção,
 * estreita de propósito. `registrarLeituraDoPost` chama uma função do banco que
 * só sabe somar 1 à leitura de hoje de um Post que o público já enxerga: não
 * escolhe o dia, não escolhe a quantia e não lê nada de volta. `anon` não tem
 * privilégio nenhum na tabela — ver a migração `leituras_dos_posts`.
 *
 * Ela mora num módulo próprio, e não em `posts.js`, porque aquele módulo se
 * declara só de leitura, e uma escrita escondida ali seria exatamente o
 * "escrever sem escrever" que a lista de permissão de `verificar:acesso` existe
 * para acusar.
 *
 * ─── A SEPARAÇÃO DE PAPÉIS É DO MÓDULO ──────────────────────────────────────
 *
 * Registrar usa o cliente PÚBLICO, incondicionalmente; ler os totais usa o do
 * PAINEL, com sessão. O visitante não lê contagem alguma — nem por esta camada,
 * nem pelo banco, que não tem política de leitura para `anon`.
 *
 * Nada do visitante viaja além do identificador do Post.
 */

import { clienteDoPainelOuFalha, clientePublicoOuFalha, ehUuid, LIMITE_MAXIMO } from "./comum.js";
import {
  consultar,
  descrever,
  ERRO_INESPERADO,
  exigirLista,
  falha,
  sinalDePrazo,
} from "./resultado.js";

/** A função de banco que soma a leitura. Nome numa constante: ele aparece aqui
    e na migração, e um nome escrito duas vezes diverge na primeira renomeação. */
export const FUNCAO_DE_REGISTRO_DE_LEITURA = "registrar_leitura_do_post";

/** A visão que entrega um total por Post ao Painel. */
export const VISAO_DE_LEITURAS = "leituras_por_post";

/**
 * Soma uma leitura ao Post, no dia de hoje.
 *
 * Post que o público não enxerga não conta e não acusa erro: a resposta é a
 * mesma de um Post que contou, para que o efeito não revele que um rascunho
 * existe. Quem chama não tem o que fazer com uma falha além de não repetir —
 * leitura não contada não é problema do visitante.
 */
export async function registrarLeituraDoPost(postId) {
  const operacao = "registrarLeituraDoPost";
  if (!ehUuid(postId)) {
    return falha(ERRO_INESPERADO, {
      operacao,
      detalhe: `identificador do post fora do formato uuid: ${descrever(postId)}`,
    });
  }
  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  return consultar(operacao, () =>
    cliente.dados
      .rpc(FUNCAO_DE_REGISTRO_DE_LEITURA, { p_post_id: postId.trim() })
      .abortSignal(sinalDePrazo()),
  );
}

/** O formato de uma linha da visão. `null` quando está bem. */
function problemaNaLeitura(linha) {
  if (linha === null || typeof linha !== "object" || Array.isArray(linha)) {
    return `esperava um objeto e veio ${descrever(linha)}`;
  }
  if (typeof linha.post_id !== "string" || linha.post_id === "") return "`post_id` ausente";
  for (const campo of ["total", "ultimos_30_dias"]) {
    if (!Number.isSafeInteger(linha[campo]) || linha[campo] < 0) {
      return `\`${campo}\` não é um inteiro não negativo: ${descrever(linha[campo])}`;
    }
  }
  return null;
}

/**
 * Os totais de leitura, um por Post que já foi lido ao menos uma vez.
 *
 * Post sem leitura nenhuma NÃO aparece na resposta: ausência é zero, e quem
 * mostra decide como dizer isso. O teto é o da camada — a visão tem no máximo
 * uma linha por Post.
 */
export async function listarLeiturasDoPainel() {
  const operacao = "listarLeiturasDoPainel";
  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from(VISAO_DE_LEITURAS)
      .select("post_id,total,ultimos_30_dias")
      .range(0, LIMITE_MAXIMO - 1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  return exigirLista(resposta.dados, { operacao, validarItem: problemaNaLeitura });
}

/* ─── A evolução, para a tela de Leituras ────────────────────────────────── */

/** As duas funções de banco que a tela de Leituras chama. */
export const FUNCAO_DE_LEITURAS_POR_DIA = "leituras_por_dia";
export const FUNCAO_DE_LEITURAS_POR_POST = "leituras_por_post_no_periodo";

/** O período mais longo que a camada pede. O banco corta no mesmo número. */
export const MAXIMO_DE_DIAS = 366;

/**
 * O período pedido, ou `null` quando ele não é um número de dias utilizável.
 *
 * Recusado, e não corrigido: o banco cortaria em silêncio, e a tela mostraria
 * "últimos 30 dias" em cima de um gráfico de outro tamanho.
 */
export function diasValidos(dias) {
  return Number.isInteger(dias) && dias >= 1 && dias <= MAXIMO_DE_DIAS ? dias : null;
}

function periodoRecusado(operacao, dias) {
  return falha(ERRO_INESPERADO, {
    operacao,
    mensagem: "O período pedido não existe. Escolha o período de novo.",
    detalhe: `dias fora de [1, ${MAXIMO_DE_DIAS}]: ${descrever(dias)}`,
  });
}

/** `AAAA-MM-DD`, que é como o PostgREST entrega uma coluna de data. */
const FORMATO_DE_DIA = /^\d{4}-\d{2}-\d{2}$/;

function problemaNoDia(linha) {
  if (linha === null || typeof linha !== "object" || Array.isArray(linha)) {
    return `esperava um objeto e veio ${descrever(linha)}`;
  }
  if (typeof linha.dia !== "string" || !FORMATO_DE_DIA.test(linha.dia)) {
    return `\`dia\` fora do formato AAAA-MM-DD: ${descrever(linha.dia)}`;
  }
  if (!Number.isSafeInteger(linha.total) || linha.total < 0) {
    return `\`total\` não é um inteiro não negativo: ${descrever(linha.total)}`;
  }
  return null;
}

/**
 * As leituras de cada dia dos últimos `dias` dias, do mais antigo para hoje.
 *
 * Um ponto por dia, sempre: dia sem leitura vem com zero. `postId` restringe a
 * um Post; ausente, soma todos. Identificador fora do formato é recusado, e não
 * ignorado — ignorá-lo mostraria o total do blog com o nome de um Post em cima.
 */
export async function lerLeiturasPorDia({ dias = 30, postId = null } = {}) {
  const operacao = "lerLeiturasPorDia";
  const periodo = diasValidos(dias);
  if (periodo === null) return periodoRecusado(operacao, dias);

  const semPost = postId === null || postId === undefined || postId === "";
  if (!semPost && !ehUuid(postId)) {
    return falha(ERRO_INESPERADO, {
      operacao,
      mensagem: "O post escolhido não existe mais. Escolha o post de novo.",
      detalhe: `identificador do post fora do formato uuid: ${descrever(postId)}`,
    });
  }

  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .rpc(FUNCAO_DE_LEITURAS_POR_DIA, {
        p_dias: periodo,
        p_post_id: semPost ? null : postId.trim(),
      })
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  return exigirLista(resposta.dados, { operacao, validarItem: problemaNoDia });
}

function problemaNoPostLido(linha) {
  if (linha === null || typeof linha !== "object" || Array.isArray(linha)) {
    return `esperava um objeto e veio ${descrever(linha)}`;
  }
  if (typeof linha.post_id !== "string" || linha.post_id === "") return "`post_id` ausente";
  if (typeof linha.titulo !== "string") return "`titulo` ausente";
  if (!Number.isSafeInteger(linha.total) || linha.total < 0) {
    return `\`total\` não é um inteiro não negativo: ${descrever(linha.total)}`;
  }
  return null;
}

/**
 * Os Posts mais lidos nos últimos `dias` dias, do mais lido para o menos lido.
 *
 * Só aparece quem teve leitura no período. A ordem é a do banco, com desempate
 * determinístico, e a tela não reordena.
 */
export async function listarPostsMaisLidos({ dias = 30 } = {}) {
  const operacao = "listarPostsMaisLidos";
  const periodo = diasValidos(dias);
  if (periodo === null) return periodoRecusado(operacao, dias);

  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .rpc(FUNCAO_DE_LEITURAS_POR_POST, { p_dias: periodo })
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  return exigirLista(resposta.dados, { operacao, validarItem: problemaNoPostLido });
}