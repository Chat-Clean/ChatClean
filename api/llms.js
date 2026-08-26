/**
 * O índice para motores generativos.
 *
 * ─── POR QUE ELE EXISTE ───────────────────────────────────────────────────
 *
 * Um rastreador que quer citar o blog precisa saber O QUE EXISTE antes de
 * decidir o que buscar. Até a Story 4.8 este arquivo listava cinco páginas
 * fixas, sem descrição e sem nenhum artigo: dizia que o site existe, não dizia
 * o que ele tem.
 *
 * ─── E A CONSULTA É A MESMA DO MAPA ───────────────────────────────────────
 *
 * `postsNoAr()` — a mesma função, a mesma chamada. O critério da story diz, com
 * estas palavras, que o mapa e o índice vêm "da mesma fonte e da mesma
 * consulta", e o motivo é concreto: duas consultas com a mesma intenção
 * divergem na primeira mudança de regra, e o sintoma seria um índice anunciando
 * artigo que o mapa não lista — ou que a página responde 404.
 *
 * A verificação não confere isso lendo o código: ela dirige as DUAS rotas
 * contra o mesmo servidor e compara os conjuntos de endereço.
 */

import { PAGINAS_DO_SITE } from "./_nucleo/paginasDoSite.js";
import { postsNoAr } from "./_nucleo/leitura.js";
import {
  dominioDoAmbiente,
  metodoRecusado,
  responderDefeito,
  responderDocumento,
} from "./_nucleo/entrega.js";

export const TIPO_DO_INDICE = "text/plain; charset=utf-8";

export const TITULO_DO_INDICE = "# ChatClean";

export const RESUMO_DO_INDICE =
  "Plataforma de CRM e chatbot para WhatsApp. Este arquivo indexa as páginas " +
  "públicas do site para leitura por máquina.";

/**
 * Uma linha só, sempre.
 *
 * O formato é de linha por item: um Resumo com quebra de linha partiria o item
 * em dois, e o segundo pedaço apareceria como se fosse outro artigo.
 */
function umaLinha(texto) {
  return String(texto ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O índice inteiro.
 *
 * `posts` vazio OMITE a seção de artigos — um cabeçalho sozinho afirmaria que
 * existe uma lista e que ela está vazia, que é diferente de não afirmar.
 */
export function indiceParaLlms(raiz, posts = []) {
  const semBarra = String(raiz).replace(/\/+$/, "");

  const paginas = PAGINAS_DO_SITE.map((p) => {
    const descricao = umaLinha(p.descricao);
    return descricao === ""
      ? `- ${semBarra}${p.caminho}`
      : `- ${semBarra}${p.caminho}: ${descricao}`;
  }).join("\n");

  const artigos = (Array.isArray(posts) ? posts : [])
    .map((post) => {
      const slug = umaLinha(post?.slug);
      if (slug === "") return null;
      const titulo = umaLinha(post?.titulo);
      const resumo = umaLinha(post?.resumo);
      const cabeca = `- [${titulo}](${semBarra}/blog/${slug})`;
      /* RESUMO AUSENTE OMITE O PEDAÇO, e não vira dois-pontos com nada
         depois — que leria como um artigo cujo resumo é o vazio. */
      return resumo === "" ? cabeca : `${cabeca}: ${resumo}`;
    })
    .filter((linha) => linha !== null);

  const secaoDeArtigos =
    artigos.length === 0 ? "" : `\n## Artigos\n\n${artigos.join("\n")}\n`;

  return (
    `${TITULO_DO_INDICE}\n\n${RESUMO_DO_INDICE}\n\n` +
    `## Páginas\n\n${paginas}\n${secaoDeArtigos}`
  );
}

export default async function handler(req, res) {
  if (metodoRecusado(req, res)) return;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    responderDefeito(res, dominio.defeito);
    return;
  }

  const lidos = await postsNoAr();
  if (!lidos.ok) {
    /* FALHA ALTO, pelo mesmo motivo do mapa: um índice com cinco páginas e zero
       artigos diz ao rastreador que o blog está vazio, e ele age nisso. */
    responderDefeito(res, lidos.defeito);
    return;
  }

  responderDocumento(res, {
    tipo: TIPO_DO_INDICE,
    corpo: indiceParaLlms(dominio.raiz, lidos.posts),
  });
}
