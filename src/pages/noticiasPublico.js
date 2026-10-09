/**
 * As regras puras e as frases das Notícias no site: a seção do blog, a
 * listagem (`/noticias`) e a página de assistir (`/noticias/:id`).
 *
 * Módulo puro, irmão de `blogPublico.js`: sem React e sem rede, para a
 * verificação poder EXECUTAR o que a tela decide em vez de ler JSX.
 *
 * ─── AS NOTÍCIAS NÃO SE MISTURAM COM OS POSTS ───────────────────────────────
 *
 * Elas têm endereço próprio, FORA de `/blog/…`: lá o segundo segmento é o Slug
 * de um Post, e a plataforma reescreve o endereço para a função que serve o
 * artigo. No blog elas aparecem numa seção só delas, antes dos Posts, com no
 * máximo `TAMANHO_DO_CARROSSEL` vídeos; o resto fica na listagem, a um clique.
 *
 * ─── A SEÇÃO DO BLOG NUNCA DERRUBA O BLOG ───────────────────────────────────
 *
 * Ela é um complemento da página de Posts. Sem Notícia publicada, ou com a
 * leitura falhando, a seção simplesmente não aparece: um aviso de erro sobre
 * vídeos no topo de um blog que carregou os artigos seria a parte gritando
 * mais alto que o todo. Na listagem e na página de assistir, que são DELAS, a
 * falha é dita.
 */

import { ehUuid } from "@/data/blog/comum";
import {
  ERRO_NAO_ENCONTRADO,
  ERRO_REDE,
  MENSAGENS_DE_LEITURA,
  ERRO_INESPERADO,
} from "@/data/blog/resultado";
import { formatarData, formatarNumero } from "@/domain/blog/formato";

/* ─── Os endereços ───────────────────────────────────────────────────────── */

/** A listagem de todas as Notícias. */
export const ENDERECO_DAS_NOTICIAS = "/noticias";

/** A rota da listagem, como o roteador a declara. */
export const ROTA_DAS_NOTICIAS = ENDERECO_DAS_NOTICIAS;

/** O nome do parâmetro de rota. Escrito uma vez: a rota e a tela o leem daqui. */
export const PARAMETRO_DA_NOTICIA = "id";

/** A rota da página de assistir. */
export const ROTA_DA_NOTICIA = `${ENDERECO_DAS_NOTICIAS}/:${PARAMETRO_DA_NOTICIA}`;

/** O endereço do blog, para onde a listagem oferece voltar. */
export const ENDERECO_DO_BLOG = "/blog";

/**
 * O endereço de uma Notícia. Sem identificador utilizável, a listagem: um link
 * para `/noticias/undefined` cairia na tela de ausência.
 */
export function enderecoDaNoticia(noticia) {
  const id = typeof noticia?.id === "string" ? noticia.id.trim() : "";
  return ehUuid(id) ? `${ENDERECO_DAS_NOTICIAS}/${id}` : ENDERECO_DAS_NOTICIAS;
}

/* ─── Os tamanhos ────────────────────────────────────────────────────────── */

/** Quantos vídeos o carrossel do blog mostra. O resto fica na listagem. */
export const TAMANHO_DO_CARROSSEL = 6;

/** Quantos vídeos a listagem pede por vez. */
export const TAMANHO_DA_PAGINA_DE_NOTICIAS = 12;

/** Quantos vídeos a página de assistir sugere embaixo. */
export const TAMANHO_DAS_OUTRAS_NOTICIAS = 3;

/** Um lote cheio é a única evidência de que pode haver mais. */
export function haMaisNoticias(recebidas, tamanho = TAMANHO_DA_PAGINA_DE_NOTICIAS) {
  return Array.isArray(recebidas) && recebidas.length >= tamanho;
}

/* ─── As situações ───────────────────────────────────────────────────────── */

export const NOTICIAS_CARREGANDO = "noticias-carregando";
export const NOTICIAS_PRONTAS = "noticias-prontas";
export const NOTICIAS_VAZIAS = "noticias-vazias";
export const NOTICIAS_FALHA = "noticias-falha";
/** Falha que repetir não resolve: ambiente mal configurado, defeito. */
export const NOTICIAS_FALHA_PERMANENTE = "noticias-falha-permanente";
/** Só da página de assistir: a Notícia não existe, ou não está no ar. */
export const NOTICIA_AUSENTE = "noticia-ausente";

/** O erro tipado da camada vira situação. Só `rede` promete que repetir serve. */
function situacaoDoErro(erro) {
  return erro?.tipo === ERRO_REDE ? NOTICIAS_FALHA : NOTICIAS_FALHA_PERMANENTE;
}

/**
 * A situação da listagem. A ORDEM é regra, a mesma de `situacaoDaLista`: erro
 * conferido depois de lista vazia faria uma queda de conexão aparecer como
 * "ainda não há vídeos". Releitura mantém os cartões.
 */
export function situacaoDasNoticias({ carregando = false, erro = null, noticias = null } = {}) {
  const lista = Array.isArray(noticias) ? noticias : [];
  if (carregando) return lista.length > 0 ? NOTICIAS_PRONTAS : NOTICIAS_CARREGANDO;
  if (erro !== null && erro !== undefined) return situacaoDoErro(erro);
  return lista.length > 0 ? NOTICIAS_PRONTAS : NOTICIAS_VAZIAS;
}

/**
 * A situação da página de assistir. `nao_encontrado` é ausência, e não falha:
 * a Notícia que saiu do ar e a que nunca existiu dão a mesma tela.
 */
export function situacaoDaNoticia({ carregando = false, erro = null, noticia = null } = {}) {
  if (carregando) return NOTICIAS_CARREGANDO;
  if (erro !== null && erro !== undefined) {
    return erro?.tipo === ERRO_NAO_ENCONTRADO ? NOTICIA_AUSENTE : situacaoDoErro(erro);
  }
  return noticia ? NOTICIAS_PRONTAS : NOTICIA_AUSENTE;
}

/**
 * A seção do blog aparece? Só com Notícia para mostrar e sem filtro em curso:
 * quem buscou um artigo ou escolheu uma Categoria está olhando para Posts.
 */
export function mostraASecaoDeNoticias({ noticias = null, filtrando = false } = {}) {
  return filtrando !== true && Array.isArray(noticias) && noticias.length > 0;
}

const FALAS = Object.freeze({
  [NOTICIAS_VAZIAS]: Object.freeze({
    oQueHouve: "Nenhum vídeo publicado ainda",
    oQueFazer: "Os vídeos aparecem aqui assim que forem publicados. Volte em breve.",
    repetir: false,
  }),
  [NOTICIAS_FALHA]: Object.freeze({
    oQueHouve: "Não deu para carregar os vídeos",
    oQueFazer: "Confira a conexão e tente carregar de novo.",
    repetir: true,
  }),
  [NOTICIAS_FALHA_PERMANENTE]: Object.freeze({
    oQueHouve: "Os vídeos não puderam ser carregados",
    oQueFazer:
      "Não é a sua conexão, e tentar de novo não resolve. Volte mais tarde, já estamos sabendo.",
    repetir: false,
  }),
  [NOTICIA_AUSENTE]: Object.freeze({
    oQueHouve: "Este vídeo não está mais disponível",
    oQueFazer: "Ele pode ter saído do ar ou o endereço pode estar incompleto. Veja os outros vídeos.",
    repetir: false,
  }),
});

/** As situações que não desenham vídeo. Lista fechada. */
export const SITUACOES_SEM_VIDEO = Object.freeze(Object.keys(FALAS));

/** A fala de uma situação sem vídeo. Lança para situação fora da lista. */
export function falaDasNoticias(situacao) {
  if (!Object.hasOwn(FALAS, situacao)) {
    throw new Error(
      `Situação de notícias desconhecida: ${JSON.stringify(situacao)}. ` +
        `A lista é fechada, e os únicos valores são: ${SITUACOES_SEM_VIDEO.join(", ")}.`,
    );
  }
  return FALAS[situacao];
}

/** O erro tipado de uma exceção que escapou da camada. A frase não é a dela. */
export function falhaDeExcecao(excecao) {
  return {
    tipo: ERRO_INESPERADO,
    mensagem: MENSAGENS_DE_LEITURA[ERRO_INESPERADO],
    detalhe: String(excecao?.message ?? excecao),
  };
}

/* ─── As frases ──────────────────────────────────────────────────────────── */

export const TITULO_DA_SECAO = "Notícias em vídeo";
export const ROTULO_DE_VER_TODAS = "Ver todos os vídeos";
export const ROTULO_DE_ASSISTIR = "Assistir";
export const ROTULO_DE_VOLTAR_AS_NOTICIAS = "Ver todos os vídeos";
export const ROTULO_DE_VOLTAR_AO_BLOG = "Ir para os artigos do blog";
export const ROTULO_DE_RECARREGAR = "Tentar carregar os vídeos de novo";
export const ROTULO_DE_CARREGAR_MAIS = "Carregar mais vídeos";
export const TITULO_DAS_OUTRAS = "Outros vídeos";
export const TEXTO_DE_CARREGANDO = "Carregando os vídeos.";
export const TEXTO_DE_CARREGANDO_O_VIDEO = "Carregando o vídeo.";

/** Quantos vídeos a lista tem agora, dito em voz alta. */
export function anuncioDasNoticias(quantidade) {
  const n = Number(quantidade);
  if (!Number.isFinite(n) || n <= 0) return "Nenhum vídeo encontrado.";
  if (n === 1) return "1 vídeo na lista.";
  return `${formatarNumero(Math.floor(n))} vídeos na lista.`;
}

/* ─── O que a tela lê de uma Notícia ─────────────────────────────────────── */

/** O título, ou `""`. */
export function tituloDaNoticia(noticia) {
  return typeof noticia?.titulo === "string" ? noticia.titulo.trim() : "";
}

/** A descrição, ou `""`. Texto puro, com as quebras de linha de quem escreveu. */
export function descricaoDaNoticia(noticia) {
  return typeof noticia?.descricao === "string" ? noticia.descricao.trim() : "";
}

/** `09/10/2026`: o dia da publicação. `""` quando não há data legível. */
export function textoDaDataDaNoticia(noticia) {
  const bruto = noticia?.publicada_em;
  if (typeof bruto !== "string" || bruto.trim() === "") return "";
  try {
    return formatarData(bruto);
  } catch {
    return "";
  }
}

/**
 * O nome acessível do cartão: diz o que fará e NOMEIA o vídeo. Seis links
 * chamados "Assistir" são seis links indistinguíveis para leitor de tela.
 */
export function rotuloDoCartaoDeNoticia(noticia) {
  const titulo = tituloDaNoticia(noticia);
  return titulo === "" ? "Assistir ao vídeo sem título" : `Assistir ao vídeo ${titulo}`;
}

/** O título do reprodutor incorporado, para quem ouve a página. */
export function tituloDoReprodutor(noticia) {
  const titulo = tituloDaNoticia(noticia);
  return titulo === "" ? "Reprodutor de vídeo do YouTube" : `Vídeo: ${titulo}`;
}

/** O rótulo do botão que dá o play. */
export function rotuloDeTocar(noticia) {
  const titulo = tituloDaNoticia(noticia);
  return titulo === "" ? "Tocar o vídeo" : `Tocar o vídeo ${titulo}`;
}

/** As outras Notícias: a lista sem a que está na tela, cortada no teto. */
export function outrasNoticias(lista, atual, tamanho = TAMANHO_DAS_OUTRAS_NOTICIAS) {
  const id = atual?.id ?? null;
  return (Array.isArray(lista) ? lista : []).filter((n) => n?.id !== id).slice(0, tamanho);
}
