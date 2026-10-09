/**
 * As regras de uma Notícia: o vídeo, o título e a descrição.
 *
 * Domínio puro (AD-1): sem React, sem rede, sem armazenamento. É importado pelo
 * **servidor** (que recusa o que não serve antes de gravar) e pela **tela** (que
 * diz o que está errado antes de o pedido sair). Uma regra, dois consumidores,
 * como em `categorias.js`.
 *
 * ─── O VÍDEO MORA NO YOUTUBE, E O QUE SE GUARDA É O IDENTIFICADOR ───────────
 *
 * Quem cadastra cola o link do jeito que o YouTube entrega: `watch?v=`,
 * `youtu.be/`, `shorts/`, `embed/` ou `live/`, com ou sem `&t=` e `&list=`.
 * `identificadorDoYoutube` aceita todas essas formas e devolve os 11 caracteres
 * do vídeo, que é o que viaja e o que o banco guarda. O endereço do reprodutor
 * e o da miniatura são DERIVADOS dele, aqui, e em nenhum outro lugar.
 *
 * O host é conferido por lista de permissão: `https://evil.example/watch?v=…`
 * tem a forma de um link do YouTube e não é um.
 */

/** O formato do identificador de um vídeo. O mesmo de `noticias_youtube_id_formato`. */
export const FORMATO_DO_ID_DO_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;

/** Os hosts de onde um link de vídeo pode vir. Lista fechada. */
const HOSTS_DO_YOUTUBE = Object.freeze([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** O host dos links curtos, em que o identificador é o próprio caminho. */
const HOST_CURTO_DO_YOUTUBE = "youtu.be";

/** Os primeiros segmentos de caminho que trazem o identificador logo depois. */
const CAMINHOS_COM_ID = Object.freeze(["embed", "shorts", "live", "v"]);

/** `true` apenas para os 11 caracteres de um vídeo. Não lança. */
export function ehIdDoYoutube(valor) {
  return typeof valor === "string" && FORMATO_DO_ID_DO_YOUTUBE.test(valor);
}

/**
 * O identificador do vídeo a partir do que foi colado, ou `""`.
 *
 * Aceita o identificador puro e as formas de link do YouTube. Qualquer outra
 * coisa devolve `""`: quem chama transforma isso em recusa nomeada. Não lança,
 * porque o valor vem de um campo de texto e, no servidor, da rede.
 */
export function identificadorDoYoutube(valor) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (texto === "") return "";
  if (ehIdDoYoutube(texto)) return texto;

  let url;
  try {
    /* Link colado sem protocolo (`youtu.be/abc…`) é o caso comum de quem copia
       da barra de endereço de alguns navegadores. */
    url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return "";
  }

  const host = url.hostname.toLowerCase();
  const segmentos = url.pathname.split("/").filter((s) => s !== "");

  if (host === HOST_CURTO_DO_YOUTUBE) {
    return ehIdDoYoutube(segmentos[0]) ? segmentos[0] : "";
  }
  if (!HOSTS_DO_YOUTUBE.includes(host)) return "";

  if (segmentos[0] === "watch") {
    const v = url.searchParams.get("v") ?? "";
    return ehIdDoYoutube(v) ? v : "";
  }
  if (CAMINHOS_COM_ID.includes(segmentos[0])) {
    return ehIdDoYoutube(segmentos[1]) ? segmentos[1] : "";
  }
  return "";
}

/** A frase de quando o link colado não é um vídeo do YouTube. */
export const VIDEO_NAO_RECONHECIDO =
  "Não reconhecemos este link como um vídeo do YouTube. Cole o endereço do vídeo, como https://www.youtube.com/watch?v=… ou https://youtu.be/…";

/** A frase de quando o vídeo falta. */
export const VIDEO_AUSENTE = "A notícia precisa do link do vídeo no YouTube.";

/**
 * O endereço do reprodutor incorporado, ou `""`.
 *
 * `youtube-nocookie.com`: o reprodutor só grava cookie quando a pessoa dá o
 * play. `rel=0` mantém as sugestões do fim no próprio canal.
 */
export function enderecoDoReprodutor(youtubeId, { tocar = false } = {}) {
  if (!ehIdDoYoutube(youtubeId)) return "";
  const parametros = new URLSearchParams({ rel: "0" });
  if (tocar) parametros.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${parametros.toString()}`;
}

/** O endereço do vídeo no YouTube, para abrir lá. `""` quando não dá. */
export function enderecoNoYoutube(youtubeId) {
  return ehIdDoYoutube(youtubeId) ? `https://www.youtube.com/watch?v=${youtubeId}` : "";
}

/**
 * A miniatura grande (1280×720). Nem todo vídeo a tem: quando falta, o YouTube
 * responde com um quadro cinza de `LARGURA_DA_MINIATURA_AUSENTE` pixels, e a
 * tela troca pela de reserva.
 */
export function miniaturaDoVideo(youtubeId) {
  return ehIdDoYoutube(youtubeId)
    ? `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`
    : "";
}

/** A miniatura de reserva (480×360), que todo vídeo tem. */
export function miniaturaDeReserva(youtubeId) {
  return ehIdDoYoutube(youtubeId) ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : "";
}

/** A largura do quadro cinza que o YouTube devolve no lugar da miniatura que falta. */
export const LARGURA_DA_MINIATURA_AUSENTE = 120;

/* ─── O título e a descrição ─────────────────────────────────────────────── */

/** O teto de `noticias_titulo_nao_vazio`, no banco. Escrito uma vez. */
export const TAMANHO_MAXIMO_DO_TITULO_DA_NOTICIA = 160;

/** O teto de `noticias_descricao_com_teto`, no banco. */
export const TAMANHO_MAXIMO_DA_DESCRICAO_DA_NOTICIA = 5000;

/** O título normalizado: aparado, com espaço interno colapsado. */
export function normalizarTituloDaNoticia(valor) {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
}

/**
 * A descrição normalizada: aparada nas pontas, com as quebras de linha de quem
 * escreveu preservadas. Ela é texto puro, e a tela a mostra como texto.
 */
export function normalizarDescricaoDaNoticia(valor) {
  return typeof valor === "string" ? valor.replace(/\r\n?/g, "\n").trim() : "";
}

/** O que impede este texto de ser título de Notícia, ou `null`. */
export function problemaNoTituloDaNoticia(valor) {
  const limpo = normalizarTituloDaNoticia(valor);
  if (limpo === "") return "A notícia precisa de um título.";
  if (limpo.length > TAMANHO_MAXIMO_DO_TITULO_DA_NOTICIA) {
    return `O título da notícia passa de ${TAMANHO_MAXIMO_DO_TITULO_DA_NOTICIA} caracteres. Encurte antes de salvar.`;
  }
  return null;
}

/** O que impede este texto de ser descrição de Notícia, ou `null`. */
export function problemaNaDescricaoDaNoticia(valor) {
  if (valor !== undefined && valor !== null && typeof valor !== "string") {
    return "A descrição da notícia precisa ser um texto.";
  }
  if (normalizarDescricaoDaNoticia(valor).length > TAMANHO_MAXIMO_DA_DESCRICAO_DA_NOTICIA) {
    return `A descrição da notícia passa de ${TAMANHO_MAXIMO_DA_DESCRICAO_DA_NOTICIA} caracteres. Encurte antes de salvar.`;
  }
  return null;
}
