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
