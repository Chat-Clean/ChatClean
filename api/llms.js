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
 *
 * ─── AS VAGAS, COM A FALHA ISOLADA (Story 5.9) ────────────────────────────
 *
 * A seção `## Vagas` vem depois de `## Artigos`, lida por `vagasIsoladas()`
 * (sobre `vagasAbertasServidas()`, a MESMA leitura do mapa e da listagem
 * servida), em paralelo com os Posts e com prazo próprio. Se ela falha ou
 * vence o prazo, o índice sai 200 com as páginas e os artigos, sem a seção,
 * `no-store`, e o diagnóstico diz que as Vagas faltaram: a falha de
 * Carreiras não derruba o Blog (C-FR-22). A dos Posts derruba tudo, Vagas
 * incluídas.
 */

import { PAGINAS_DO_SITE } from "./_nucleo/paginasDoSite.js";
import { postsNoAr, vagasIsoladas } from "./_nucleo/leitura.js";
import { ETIQUETA_DE_CARREIRAS } from "./_nucleo/cache.js";
import {
  dominioDoAmbiente,
  metodoRecusado,
  responderDefeito,
  responderDocumento,
} from "./_nucleo/entrega.js";
import {
  DIAGNOSTICO_LEITURA_FALHOU,
  DIAGNOSTICO_OK,
  DIAGNOSTICO_SEM_DOMINIO,
  DIAGNOSTICO_VAGAS_FALHARAM,
} from "./_nucleo/diagnostico.js";
import { enderecoDaPaginaDaVaga } from "../src/domain/carreiras/vaga.js";

export const TIPO_DO_INDICE = "text/plain; charset=utf-8";

/** O nome desta rota, para o diagnóstico e o registro de evento. */
const ROTA = "llms";

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
 * O texto de um link Markdown (Story 5.9): `\`, `[` e `]` escapados. Um título
 * como "a](https://mal.example)" fecharia o link cedo e apontaria para outro
 * lugar. Vale só para as Vagas: o título dos Posts continua como era (a spec
 * não deixa mudar o formato dos Posts).
 */
export function textoDeLinkMarkdown(texto) {
  return umaLinha(texto).replace(/[\\[\]]/g, "\\$&");
}

/**
 * O endereço de um link Markdown: `(` e `)` codificados. O domínio já codifica
 * o Slug com `encodeURIComponent`, que deixa os parênteses passarem.
 */
export function enderecoDeLinkMarkdown(endereco) {
  return String(endereco).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/**
 * O índice inteiro.
 *
 * `posts` e `vagas` vazios OMITEM a seção de cada um: um cabeçalho sozinho
 * afirmaria que existe uma lista e que ela está vazia, que é diferente de não
 * afirmar.
 *
 * `vagas` (Story 5.9) são as linhas de `vagasAbertasServidas` (Slug, título,
 * Resumo), já filtradas pela função de banco: nenhuma regra de visibilidade
 * mora aqui. Vaga cujo endereço dá `null` (sem Slug) fica de fora, e uma lista
 * em que TODAS ficam de fora também omite a seção.
 */
export function indiceParaLlms(raiz, posts = [], vagas = []) {
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

  /* AS VAGAS (Story 5.9), no mesmo formato dos artigos, com o título escapado
     para Markdown. O endereço sai do domínio, o mesmo do mapa e da listagem;
     sem endereço, a Vaga fica de fora. Sem Vaga nenhuma, a seção é OMITIDA,
     pela mesma razão dos artigos. */
  const linhasDeVagas = (Array.isArray(vagas) ? vagas : [])
    .map((vaga) => {
      const caminho = enderecoDaPaginaDaVaga(vaga?.slug);
      if (caminho === null) return null;
      const titulo = textoDeLinkMarkdown(vaga?.titulo);
      const resumo = umaLinha(vaga?.resumo);
      const cabeca = `- [${titulo}](${enderecoDeLinkMarkdown(`${semBarra}${caminho}`)})`;
      return resumo === "" ? cabeca : `${cabeca}: ${resumo}`;
    })
    .filter((linha) => linha !== null);

  const secaoDeVagas =
    linhasDeVagas.length === 0 ? "" : `\n## Vagas\n\n${linhasDeVagas.join("\n")}\n`;

  return (
    `${TITULO_DO_INDICE}\n\n${RESUMO_DO_INDICE}\n\n` +
    `## Páginas\n\n${paginas}\n${secaoDeArtigos}${secaoDeVagas}`
  );
}

/**
 * A rota. O terceiro parâmetro só existe para a verificação trocar a leitura
 * das Vagas (a plataforma chama com dois).
 */
export default async function handler(req, res, { lerVagas = vagasIsoladas } = {}) {
  if (metodoRecusado(req, res, { rota: ROTA })) return;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    responderDefeito(res, dominio.defeito, { diagnostico: DIAGNOSTICO_SEM_DOMINIO, rota: ROTA });
    return;
  }

  const [lidos, abertas] = await Promise.all([postsNoAr(), lerVagas()]);
  if (!lidos.ok) {
    /* FALHA ALTO, pelo mesmo motivo do mapa — e pela mesma razão desta rota não
       degradar (Story 4.10): é documento só para máquina, sem shell nenhum a
       oferecer no lugar do que faltou. */
    responderDefeito(res, lidos.defeito, { diagnostico: DIAGNOSTICO_LEITURA_FALHOU, rota: ROTA });
    return;
  }

  responderDocumento(res, {
    tipo: TIPO_DO_INDICE,
    corpo: indiceParaLlms(dominio.raiz, lidos.posts, abertas.ok ? abertas.vagas : []),
    etiquetas: { colecoes: ["llms", ETIQUETA_DE_CARREIRAS] },
    diagnostico: abertas.ok ? DIAGNOSTICO_OK : DIAGNOSTICO_VAGAS_FALHARAM,
    detalhe: abertas.ok ? null : abertas.defeito,
    guardar: abertas.ok,
    rota: ROTA,
  });
}
