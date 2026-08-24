/**
 * As rotas de página do blog: `/blog` e `/blog/:slug`.
 *
 * ─── O QUE ELA FAZ, E O QUE AINDA NÃO FAZ ─────────────────────────────────
 *
 * Ela serve o SHELL DO BUILD — o mesmo `dist/index.html` que a hospedagem
 * serviria, com os ativos com hash daquele build — com a **região de metadados
 * trocada pela do Post** (Story 4.3). O conteúdo do artigo servido é a 4.4, o
 * status HTTP por Estado é a 4.5 e os dados estruturados são a 4.6: até lá esta
 * rota responde 200 para tudo, e isso está dito para não parecer esquecimento.
 *
 * ─── O DADO CHEGA POR PARÂMETRO ───────────────────────────────────────────
 *
 * A reescrita entrega `?slug=`. O caminho que chega em `req.url` é o DESTA
 * função, e não o do visitante — derivar o endereço do Post dali produziria
 * `/api/blog`. A Story 4.5 registra esse engano por escrito ao proibir montar a
 * canônica a partir da requisição; aqui ele já vale.
 *
 * ─── E O SLUG DA CANÔNICA VEM DO BANCO ────────────────────────────────────
 *
 * `?slug=` traz o que o visitante digitou, que pode ser um endereço APOSENTADO.
 * A canônica de um aposentado é o endereço de hoje — é para isso que a leitura
 * da Story 4.2 devolve `slug_atual`. Usar o da URL faria dois endereços se
 * declararem canônicos um do outro.
 */

import {
  dominioDoAmbiente,
  metodoRecusado,
  responderDefeito,
  responderDocumento,
} from "./_nucleo/entrega.js";
import { situacaoDoEndereco } from "./_nucleo/leitura.js";
import { MARCA_FIM, MARCA_INICIO, metadadosDaPagina, regiaoDeMetadados } from "./_nucleo/metadados.js";
import { lerShell, trocarMetadados } from "./_nucleo/shell.js";

/** O tipo do documento que esta rota promete. */
export const TIPO_DA_PAGINA = "text/html; charset=utf-8";

/** O `slug` da consulta, ou `null` — a listagem `/blog` não traz nenhum. */
export function slugDaConsulta(req) {
  const bruto = req?.query?.slug;
  /* Um parâmetro repetido (`?slug=a&slug=b`) chega como ARRAY. Concatená-lo
     produziria "a,b", que não é endereço de nada e viraria consulta ao banco.
     Repetição é pergunta ambígua, e pergunta ambígua não tem resposta. */
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo === "" ? null : limpo;
}

export default async function handler(req, res) {
  if (metodoRecusado(req, res)) return;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    /* SEM DOMÍNIO NÃO SE SERVE. A alternativa seria emitir canônica relativa —
       que rastreador nenhum resolve para o lugar certo — e o sintoma seria um
       artigo que nunca indexa, sem nada acusando por quê. */
    responderDefeito(res, dominio.defeito);
    return;
  }

  const shell = await lerShell();
  if (!shell.ok) {
    responderDefeito(res, shell.defeito);
    return;
  }

  const slug = slugDaConsulta(req);

  /* A LISTAGEM `/blog` não consulta endereço nenhum: não há Post para resolver,
     e uma consulta com slug nulo gastaria uma viagem para receber
     `inexistente`. */
  let situacao = null;
  let post = null;
  let slugAtual = null;
  if (slug !== null) {
    const lida = await situacaoDoEndereco(slug);
    if (!lida.ok) {
      /* A leitura falhou — e servir o shell com o metadado da HOME seria
         responder 200 anunciando outra página. Falha de leitura é falha. */
      responderDefeito(res, lida.defeito);
      return;
    }
    situacao = lida.situacao;
    post = lida.post;
    slugAtual = lida.slugAtual;
  }

  const pagina = metadadosDaPagina({
    situacao,
    post,
    slug: slugAtual,
    raiz: dominio.raiz,
  });

  const trocado = trocarMetadados(shell.html, regiaoDeMetadados(pagina), {
    inicio: MARCA_INICIO,
    fim: MARCA_FIM,
  });
  if (!trocado.ok) {
    responderDefeito(res, trocado.defeito);
    return;
  }

  responderDocumento(res, { tipo: TIPO_DA_PAGINA, corpo: trocado.html });
}
