/**
 * Resolução de slug aposentado para o Post atual.
 *
 * Quando o slug de um Post publicado muda, o antigo vai para `slugs_antigos` e
 * a URL de fora continua existindo. Esta função é o que a Story 4.5 vai usar
 * para o redirecionamento permanente (301) — ela nasce aqui porque é leitura
 * da mesma camada, pelo mesmo cliente público e com o mesmo contrato.
 *
 * A ordem de consulta que o consumidor deve seguir é: slug ATIVO primeiro
 * (`lerPostPublicoPorSlug`), aposentado só depois. É o que dá sentido à
 * exceção deliberada da Story 2.1, em que um Post pode retomar um slug
 * aposentado que aponta para ele mesmo.
 *
 * A visibilidade é derivada, nunca repetida: a política de `slugs_antigos` só
 * devolve a linha quando o Post apontado é visível para quem pergunta. Slug
 * aposentado de rascunho responde NÃO ENCONTRADO — do mesmo jeito que um slug
 * que nunca existiu.
 */

import { clientePublicoOuFalha, ehSlug } from "./comum.js";
import {
  consultar,
  descrever,
  exigirLista,
  naoEncontrado,
  sinalDePrazo,
  sucesso,
} from "./resultado.js";

const SELECAO = "slug,post_id,post:posts(id,slug,estado,publicado_em)";

function problemaNaLinha(linha) {
  if (linha === null || typeof linha !== "object" || Array.isArray(linha)) {
    return `esperava um objeto e veio ${descrever(linha)}`;
  }
  if (typeof linha.slug !== "string" || linha.slug === "") return "`slug` ausente";
  if (typeof linha.post_id !== "string" || linha.post_id === "") {
    return "`post_id` ausente";
  }
  return null;
}

/**
 * Devolve `{ slugAntigo, postId, slugAtual }` para um slug aposentado visível.
 *
 * `slugAtual` é `null` quando a linha existe mas o Post embutido não veio —
 * situação que a integridade referencial não permite hoje, e que é devolvida
 * como dado em vez de virar `undefined` na montagem do destino do 301.
 */
export async function resolverSlugAposentado(slug) {
  const operacao = "resolverSlugAposentado";
  const alvo = typeof slug === "string" ? slug.trim() : "";
  if (!ehSlug(alvo)) {
    return naoEncontrado({
      operacao,
      detalhe: "slug ausente ou fora do formato que o banco aceita",
    });
  }

  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from("slugs_antigos")
      .select(SELECAO)
      .eq("slug", alvo)
      .limit(1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  const lista = exigirLista(resposta.dados, {
    operacao,
    validarItem: problemaNaLinha,
  });
  if (!lista.ok) return lista;

  if (lista.dados.length === 0) {
    return naoEncontrado({
      operacao,
      detalhe: "nenhum slug aposentado visível com este valor",
    });
  }

  const linha = lista.dados[0];
  const slugAtual =
    typeof linha.post?.slug === "string" && linha.post.slug !== ""
      ? linha.post.slug
      : null;

  return sucesso({
    slugAntigo: linha.slug,
    postId: linha.post_id,
    slugAtual,
  });
}
