/**
 * O feed RSS do blog, em `/feed.xml`.
 *
 * ─── A VISIBILIDADE NÃO É DECIDIDA AQUI ───────────────────────────────────
 *
 * Quais Posts entram é `postsNoAr()`, a MESMA leitura do mapa do site e do
 * `/llms.txt`. O artigo de cada um é `situacaoDoEndereco()`, a MESMA leitura da
 * página do artigo. Uma consulta própria do feed seria a terceira opinião sobre
 * o que está no ar, e o sintoma da divergência seria o leitor de feed abrindo
 * um artigo que a página responde 404.
 *
 * `posts_no_ar` não traz o Conteúdo de propósito (Story 4.8), e por isso o
 * artigo vem endereço a endereço, em paralelo, só para os mais recentes. Um
 * Post que saiu do ar entre as duas leituras fica de fora.
 *
 * ─── E ESTA ROTA NÃO DEGRADA ──────────────────────────────────────────────
 *
 * Pelo mesmo motivo do mapa: é documento só para máquina. Uma leitura que
 * falha responde 500 (o leitor tenta de novo), e não um feed incompleto que
 * ficaria no cache.
 *
 * ─── E NÃO ENTRA NO ÍNDICE DO BUSCADOR ────────────────────────────────────
 *
 * `noindex, follow`: o buscador não lista o XML como resultado, mas segue os
 * links dele até os artigos. O cabeçalho é desta rota, e não de `vercel.json`,
 * onde o `noindex` é reservado ao Painel.
 */

import { ITENS_NO_FEED, TIPO_DO_FEED, feedDoBlog } from "./_nucleo/feed.js";
import { postsNoAr, situacaoDoEndereco } from "./_nucleo/leitura.js";
import { NO_AR } from "../src/domain/blog/entrega.js";
import {
  dominioDoAmbiente,
  metodoRecusado,
  responderDefeito,
  responderDocumento,
} from "./_nucleo/entrega.js";
import {
  DIAGNOSTICO_CONTEUDO_RECUSADO,
  DIAGNOSTICO_LEITURA_FALHOU,
  DIAGNOSTICO_OK,
  DIAGNOSTICO_SEM_DOMINIO,
} from "./_nucleo/diagnostico.js";

/** O nome desta rota, para o diagnóstico e o registro de evento. */
const ROTA = "feed";

/**
 * A rota. O terceiro parâmetro só existe para a verificação trocar as
 * leituras (a plataforma chama com dois).
 */
export default async function handler(
  req,
  res,
  { lerPosts = postsNoAr, lerEndereco = situacaoDoEndereco } = {},
) {
  if (metodoRecusado(req, res, { rota: ROTA })) return;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    responderDefeito(res, dominio.defeito, { diagnostico: DIAGNOSTICO_SEM_DOMINIO, rota: ROTA });
    return;
  }

  const lidos = await lerPosts();
  if (!lidos.ok) {
    responderDefeito(res, lidos.defeito, { diagnostico: DIAGNOSTICO_LEITURA_FALHOU, rota: ROTA });
    return;
  }

  const recentes = lidos.posts.slice(0, ITENS_NO_FEED);
  const artigos = await Promise.all(recentes.map((p) => lerEndereco(p?.slug ?? null)));
  const falhou = artigos.find((a) => !a.ok);
  if (falhou) {
    responderDefeito(res, falhou.defeito, { diagnostico: DIAGNOSTICO_LEITURA_FALHOU, rota: ROTA });
    return;
  }

  const posts = recentes
    .map((p, i) => ({ slug: artigos[i].slugAtual ?? p.slug, situacao: artigos[i].situacao, post: artigos[i].post }))
    .filter((p) => p.situacao === NO_AR && p.post !== null);

  const { xml, defeitos } = feedDoBlog({ raiz: dominio.raiz, posts });

  res.setHeader("X-Robots-Tag", "noindex, follow");
  responderDocumento(res, {
    tipo: TIPO_DO_FEED,
    corpo: xml,
    etiquetas: { colecoes: ["feed"] },
    diagnostico: defeitos.length === 0 ? DIAGNOSTICO_OK : DIAGNOSTICO_CONTEUDO_RECUSADO,
    detalhe: defeitos.length === 0 ? null : defeitos.join(" | "),
    rota: ROTA,
  });
}
