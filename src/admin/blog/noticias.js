/**
 * As regras puras e as frases da tela de Notícias do Painel.
 *
 * Vive em módulo próprio, e não dentro de `TelaDeNoticias.jsx`, pela mesma
 * razão de `categorias.js`: função pura em arquivo de componente quebra a
 * recarga rápida, e fora dele ela pode ser EXECUTADA pela verificação.
 *
 * As regras do vídeo, do título e da descrição NÃO moram aqui: são domínio
 * (`domain/blog/noticias.js`), porque o servidor as consulta para recusar.
 *
 * Nada aqui lança: uma linha com dado corrompido não pode derrubar a tela.
 */

import {
  VIDEO_AUSENTE,
  VIDEO_NAO_RECONHECIDO,
  enderecoNoYoutube,
  identificadorDoYoutube,
  normalizarDescricaoDaNoticia,
  normalizarTituloDaNoticia,
  problemaNaDescricaoDaNoticia,
  problemaNoTituloDaNoticia,
} from "@/domain/blog/noticias";
import { OPERACAO_EXCLUIR_NOTICIA, OPERACAO_SALVAR_NOTICIA } from "@/domain/blog/operacoes";
import { formatarData } from "@/domain/blog/formato";

/* ─── As cinco situações da tela ─────────────────────────────────────────── */

export const SITUACAO_CARREGANDO = "carregando";
export const SITUACAO_ERRO = "erro";
export const SITUACAO_VAZIA = "vazio";
export const SITUACAO_LISTA = "lista";
export const SITUACAO_FORMULARIO = "formulario";

/** Lista FECHADA: uma situação nova só entra editando este arquivo. */
export const SITUACOES_DA_TELA = Object.freeze([
  SITUACAO_CARREGANDO,
  SITUACAO_ERRO,
  SITUACAO_VAZIA,
  SITUACAO_LISTA,
  SITUACAO_FORMULARIO,
]);

/**
 * A situação da tela. A ORDEM dos ramos é regra, a mesma de `categorias.js`: o
 * formulário vem antes de tudo, e o erro vem antes do vazio.
 */
export function situacaoDaTela({
  editando = false,
  carregando = false,
  erro = null,
  noticias = [],
} = {}) {
  if (editando) return SITUACAO_FORMULARIO;
  if (carregando) return SITUACAO_CARREGANDO;
  if (erro !== null && erro !== undefined) return SITUACAO_ERRO;
  const lista = Array.isArray(noticias) ? noticias : [];
  return lista.length === 0 ? SITUACAO_VAZIA : SITUACAO_LISTA;
}

/* ─── As frases da tela ──────────────────────────────────────────────────── */

export const TITULO_DA_TELA = "Notícias em vídeo";

export const DESCRICAO_DA_TELA =
  "São os vídeos que aparecem no blog, numa seção própria antes dos posts. O vídeo fica no YouTube: aqui você cola o link, dá um título e uma descrição, e decide quando ele vai ao ar.";

export const ROTULO_DE_VOLTAR = "Voltar para a listagem de posts";
export const ROTULO_DE_NOVA = "Nova notícia";

export const TITULO_DO_VAZIO = "Nenhuma notícia ainda";
export const DESCRICAO_DO_VAZIO =
  "Cadastre o primeiro vídeo para a seção de notícias aparecer no blog.";
export const ROTULO_DA_PRIMEIRA = "Cadastrar a primeira notícia";

export const TITULO_DO_ERRO = "Não deu para carregar as notícias";
export const ROTULO_DE_RECARREGAR = "Tentar carregar as notícias de novo";

export const ROTULO_DE_CANCELAR = "Cancelar e voltar para a lista";

export const AVISO_DE_MAIS_NOTICIAS = "Pode haver mais notícias além das que estão nesta lista.";
export const ROTULO_DE_CARREGAR_MAIS = "Carregar mais notícias";

/** As duas palavras do estado de publicação. Escritas uma vez. */
export const ROTULO_PUBLICADA = "No ar";
export const ROTULO_NAO_PUBLICADA = "Fora do ar";

/* ─── O que a tela lê de uma Notícia ─────────────────────────────────────── */

/** O título como ele aparece nas frases, nunca vazio. */
export function tituloParaFrase(noticia) {
  const titulo = normalizarTituloDaNoticia(noticia?.titulo);
  return titulo === "" ? "notícia sem título" : titulo;
}

/** A Notícia está no ar? Só o booleano verdadeiro conta. */
export function estaPublicada(noticia) {
  return noticia?.publicada === true;
}

/** A palavra do estado de publicação. */
export function rotuloDaPublicacao(noticia) {
  return estaPublicada(noticia) ? ROTULO_PUBLICADA : ROTULO_NAO_PUBLICADA;
}

/**
 * A data que a linha mostra: a da publicação quando há, a do cadastro quando
 * não. `""` quando nenhuma das duas dá para ler.
 */
export function textoDaDataDaNoticia(noticia) {
  const publicada = estaPublicada(noticia) && typeof noticia?.publicada_em === "string";
  const bruto = publicada ? noticia.publicada_em : noticia?.criado_em;
  if (typeof bruto !== "string" || bruto.trim() === "") return "";
  try {
    return `${publicada ? "Publicada em" : "Cadastrada em"} ${formatarData(bruto)}`;
  } catch {
    return "";
  }
}

/* ─── Os rótulos das ações da linha ──────────────────────────────────────── */

export function rotuloDeEditar(noticia) {
  return `Editar a notícia ${tituloParaFrase(noticia)}`;
}

export function rotuloDeExcluir(noticia) {
  return `Excluir a notícia ${tituloParaFrase(noticia)}`;
}

/** O rótulo do alvo que põe no ar ou tira do ar. Diz o que FARÁ. */
export function rotuloDeAlternarPublicacao(noticia) {
  const titulo = tituloParaFrase(noticia);
  return estaPublicada(noticia)
    ? `Tirar do ar a notícia ${titulo}`
    : `Publicar a notícia ${titulo}`;
}

export function rotuloDeVerNoYoutube(noticia) {
  return `Abrir no YouTube o vídeo da notícia ${tituloParaFrase(noticia)}`;
}

/* ─── A confirmação e as notificações ────────────────────────────────────── */

export function tituloDaExclusao(noticia) {
  return `Excluir “${tituloParaFrase(noticia)}”?`;
}

/** A consequência, dita ANTES da confirmação, e factual. */
export function descricaoDaExclusao() {
  return "Ela sai do blog e do Painel. O vídeo continua no YouTube, do jeito que está. Não dá para desfazer.";
}

export const ROTULO_DE_CONFIRMAR_EXCLUSAO = "Excluir notícia";

export function confirmacaoDaExclusao(noticia) {
  return `Notícia ${tituloParaFrase(noticia)} excluída`;
}

export function falhaDaExclusao(noticia) {
  return `Não deu para excluir a notícia ${tituloParaFrase(noticia)}`;
}

/** A confirmação de um salvamento, distinguindo criar de editar. */
export function confirmacaoDoSalvamento(noticia, criada) {
  const titulo = tituloParaFrase(noticia);
  return criada ? `Notícia ${titulo} cadastrada` : `Notícia ${titulo} salva`;
}

export function falhaDoSalvamento(noticia) {
  return `Não deu para salvar a notícia ${tituloParaFrase(noticia)}`;
}

/** A confirmação de pôr no ar ou tirar do ar, pelo valor GRAVADO. */
export function confirmacaoDaPublicacao(noticia) {
  const titulo = tituloParaFrase(noticia);
  return estaPublicada(noticia)
    ? `Notícia ${titulo} publicada`
    : `Notícia ${titulo} fora do ar`;
}

export function falhaDaPublicacao(noticia) {
  return `Não deu para mudar a publicação da notícia ${tituloParaFrase(noticia)}`;
}

/** A chave da ação de alternar a publicação, para o trinco e o giro da linha. */
export const ACAO_DE_PUBLICAR = "publicar";

/** O que está acontecendo, para quem ouve a tela. */
export function textoDaAcaoEmCurso(noticia, acao) {
  const titulo = tituloParaFrase(noticia);
  if (acao === OPERACAO_EXCLUIR_NOTICIA) return `Excluindo a notícia ${titulo}…`;
  if (acao === OPERACAO_SALVAR_NOTICIA) return `Salvando a notícia ${titulo}…`;
  if (acao === ACAO_DE_PUBLICAR) return `Mudando a publicação da notícia ${titulo}…`;
  return "";
}

/* ─── O formulário ───────────────────────────────────────────────────────── */

/** Os campos do formulário, na ordem em que ele os oferece. */
export const CAMPOS_DO_FORMULARIO = Object.freeze(["video", "titulo", "descricao", "publicada"]);

/** A frase de cada campo obrigatório que falta. */
export const FRASES_DE_FALTA = Object.freeze({
  video: VIDEO_AUSENTE,
  titulo: "O título é obrigatório: é ele que aparece no cartão do vídeo e na página de assistir.",
});

/** O formulário de uma Notícia que ainda não existe. */
export function valoresVazios() {
  return { video: "", titulo: "", descricao: "", publicada: false };
}

/**
 * Os valores do formulário a partir de uma linha de `noticias`.
 *
 * O campo de vídeo recebe o ENDEREÇO do vídeo no YouTube, e não o identificador
 * cru: é o que a pessoa colou, e é o que ela reconhece.
 */
export function valoresDaNoticia(noticia) {
  if (noticia === null || typeof noticia !== "object") return valoresVazios();
  return {
    video: enderecoNoYoutube(noticia.youtube_id),
    titulo: typeof noticia.titulo === "string" ? noticia.titulo : "",
    descricao: typeof noticia.descricao === "string" ? noticia.descricao : "",
    publicada: noticia.publicada === true,
  };
}

/** Os campos obrigatórios vazios, ANTES de o pedido sair. */
export function faltandoNoFormulario(valores) {
  const v = valores ?? {};
  const faltando = [];
  if (String(v.video ?? "").trim() === "") faltando.push("video");
  if (normalizarTituloDaNoticia(v.titulo) === "") faltando.push("titulo");
  return faltando;
}

/** O identificador do vídeo que o campo tem agora, ou `""`. Alimenta a prévia. */
export function videoDoFormulario(valores) {
  return identificadorDoYoutube(valores?.video);
}

/**
 * O corpo do pedido de gravação.
 *
 * Devolve `{ ok: true, corpo }` ou `{ ok: false, campo, motivo }`: a recusa
 * nomeia o CAMPO para o formulário apontá-lo. As regras são as do domínio, as
 * MESMAS que o servidor aplica de novo.
 */
export function corpoDaNoticia(valores) {
  const v = valores ?? valoresVazios();

  const video = String(v.video ?? "").trim();
  if (video === "") return { ok: false, campo: "video", motivo: VIDEO_AUSENTE };
  if (identificadorDoYoutube(video) === "") {
    return { ok: false, campo: "video", motivo: VIDEO_NAO_RECONHECIDO };
  }

  const problemaNoTitulo = problemaNoTituloDaNoticia(v.titulo);
  if (problemaNoTitulo !== null) {
    return { ok: false, campo: "titulo", motivo: problemaNoTitulo };
  }

  const problemaNaDescricao = problemaNaDescricaoDaNoticia(v.descricao);
  if (problemaNaDescricao !== null) {
    return { ok: false, campo: "descricao", motivo: problemaNaDescricao };
  }

  return {
    ok: true,
    corpo: {
      video,
      titulo: normalizarTituloDaNoticia(v.titulo),
      descricao: normalizarDescricaoDaNoticia(v.descricao),
      publicada: v.publicada === true,
    },
  };
}
