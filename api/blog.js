/**
 * As rotas de página do blog: `/blog` e `/blog/:slug`.
 *
 * ─── O QUE ELA FAZ, E O QUE AINDA NÃO FAZ ─────────────────────────────────
 *
 * Ela serve o SHELL DO BUILD — o mesmo `dist/index.html` que a hospedagem
 * serviria, com os ativos com hash daquele build — com a região de metadados
 * trocada pela do Post (Story 4.3), o corpo do artigo em `<noscript>` (4.4), o
 * STATUS que diz a verdade (4.5), os dados estruturados completos (4.6) e o
 * diagnóstico de toda resposta (4.10).
 *
 * ─── O STATUS NÃO É DECIDIDO AQUI ─────────────────────────────────────────
 *
 * Ele sai de `STATUS_DA_SITUACAO`, mapa fechado no domínio. Um `if` por caso
 * nesta função é exatamente onde a situação nova nasceria respondendo 200 sem
 * ninguém ter decidido — que é o defeito que a Story 4.5 conserta.
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
 *
 * ─── E QUANDO A LEITURA FALHA, O CORPO É O SHELL DE VERDADE (Story 4.10) ──
 *
 * O status continua 500 — a Story 4.5 protege isso, e continua valendo: nunca
 * 200, nunca 404 numa falha de leitura. O que muda é o CORPO, que passa a ser
 * a aplicação de verdade em vez de um parágrafo de texto. É a diferença entre
 * quem lê o status (rastreador, monitoramento) e quem vê a página (uma
 * pessoa): a máquina continua recebendo o sinal certo, e a pessoa recebe algo
 * que carrega e funciona — a aplicação assume dali, buscando pelo cliente do
 * navegador, exatamente como fazia antes deste Épico existir.
 *
 * Isto NÃO se aplica a `inexistente` nem a `arquivado`: essas são respostas
 * HONESTAS da leitura, não falhas dela, e continuam servindo o shell com o
 * metadado do site — o comportamento que a Story 4.3 já construiu.
 */

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
  DIAGNOSTICO_REGIAO_AUSENTE,
  DIAGNOSTICO_SEM_DOMINIO,
  DIAGNOSTICO_SEM_SHELL,
} from "./_nucleo/diagnostico.js";
import { situacaoDoEndereco } from "./_nucleo/leitura.js";
import {
  REDIRECIONADO,
  STATUS_DA_SITUACAO,
  statusDaSituacao,
} from "../src/domain/blog/entrega.js";
import {
  MARCA_CORPO_FIM,
  MARCA_CORPO_INICIO,
  corpoDoArtigo,
} from "./_nucleo/artigo.js";
import { MARCA_FIM, MARCA_INICIO, metadadosDaPagina, regiaoDeMetadados } from "./_nucleo/metadados.js";
import { lerShell, trocarRegiao } from "./_nucleo/shell.js";

/** O nome desta rota, para o diagnóstico e o registro de evento. */
const ROTA = "blog";

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
  if (metodoRecusado(req, res, { rota: ROTA })) return;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    /* SEM DOMÍNIO NÃO SE SERVE. A alternativa seria emitir canônica relativa —
       que rastreador nenhum resolve para o lugar certo — e o sintoma seria um
       artigo que nunca indexa, sem nada acusando por quê. E não há shell
       alternativo aqui: sem domínio não há como montar canônica nenhuma, então
       degradar para o shell só trocaria uma falha muda por uma que parece
       funcionar e não funciona. */
    responderDefeito(res, dominio.defeito, { diagnostico: DIAGNOSTICO_SEM_DOMINIO, rota: ROTA });
    return;
  }

  const shell = await lerShell();
  if (!shell.ok) {
    /* SEM SHELL NÃO HÁ SHELL PARA DEGRADAR A ELE. É a mesma razão da Story
       4.1: cair no `index.html` do repositório seria o pior dos dois lados. */
    responderDefeito(res, shell.defeito, { diagnostico: DIAGNOSTICO_SEM_SHELL, rota: ROTA });
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
      /* ─── A DEGRADAÇÃO (Story 4.10) ─────────────────────────────────────
         O status continua 500: responder 200 aqui afirmaria "este endereço
         existe e está no ar", que é exatamente a mentira que a Story 4.5
         proíbe. O que muda é o CORPO — o shell EMBUTIDO, sem passar por
         substituição de região nenhuma. Ele é o que existe sem depender de
         mais nada ter dado certo: se o próprio processo de montar metadado do
         site tivesse um bug, tentar montá-lo aqui arriscaria uma segunda
         falha em cima da primeira. */
      responderDocumento(res, {
        tipo: TIPO_DA_PAGINA,
        status: 500,
        corpo: shell.html,
        diagnostico: DIAGNOSTICO_LEITURA_FALHOU,
        rota: ROTA,
        detalhe: lida.defeito,
      });
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

  /* ─── O ENDEREÇO APOSENTADO REDIRECIONA, E NÃO SERVE NADA (Story 4.5) ───
     A tentação é servir a página junto, "para o visitante não ver nada
     quebrado". O navegador segue o `Location` e descarta o corpo, então o
     único efeito seria o rastreador que NÃO segue enxergar conteúdo num
     endereço que o site acabou de declarar morto — ensinando que ele é válido.
     É o oposto do que 301 significa. */
  if (situacao === REDIRECIONADO) {
    res.setHeader("Location", pagina.canonica);
    responderDocumento(res, {
      tipo: "text/plain; charset=utf-8",
      status: STATUS_DA_SITUACAO[REDIRECIONADO],
      corpo: `Este endereço mudou. O artigo está em ${pagina.canonica}\n`,
      diagnostico: DIAGNOSTICO_OK,
      rota: ROTA,
    });
    return;
  }

  /* O STATUS SAI DO MAPA FECHADO DO DOMÍNIO. A listagem `/blog` não resolve
     endereço nenhum e por isso não tem situação — ela é 200 por ser uma página
     que existe, e não por omissão. */
  const status = situacao === null ? 200 : statusDaSituacao(situacao);

  const comMetadados = trocarRegiao(shell.html, regiaoDeMetadados(pagina), {
    inicio: MARCA_INICIO,
    fim: MARCA_FIM,
  });
  if (!comMetadados.ok) {
    responderDefeito(res, comMetadados.defeito, { diagnostico: DIAGNOSTICO_REGIAO_AUSENTE, rota: ROTA });
    return;
  }

  /* ─── O CORPO DO ARTIGO (Story 4.4) ─────────────────────────────────────
     Conteúdo que não passa na conferência do vocabulário NÃO derruba a rota:
     um Post torto é defeito de um registro, e responder 500 tiraria todos os
     artigos do ar. O corpo é omitido, a página continua funcionando no
     navegador — onde a aplicação renderiza normalmente —, e o diagnóstico
     desta resposta (Story 4.10) registra o desvio. */
  const corpo = corpoDoArtigo({
    situacao,
    post,
    canonica: pagina.canonica,
    /* Os metadados JA RESOLVIDOS viajam junto (Story 4.6): o dado estruturado
       do artigo declara titulo, descricao e imagem, e le-los do Post de novo
       seria a terceira opiniao sobre a mesma cadeia de heranca. */
    pagina,
  });

  const comCorpo = trocarRegiao(comMetadados.html, corpo.html, {
    inicio: MARCA_CORPO_INICIO,
    fim: MARCA_CORPO_FIM,
  });
  if (!comCorpo.ok) {
    responderDefeito(res, comCorpo.defeito, { diagnostico: DIAGNOSTICO_REGIAO_AUSENTE, rota: ROTA });
    return;
  }

  responderDocumento(res, {
    tipo: TIPO_DA_PAGINA,
    status,
    corpo: comCorpo.html,
    /* A etiqueta do POST so existe quando ha Post. Na listagem sobra a da
       colecao, que e o que ela e. */
    etiquetas: { slug: slugAtual },
    diagnostico: corpo.defeito === null ? DIAGNOSTICO_OK : DIAGNOSTICO_CONTEUDO_RECUSADO,
    rota: ROTA,
    detalhe: corpo.defeito,
  });
}
