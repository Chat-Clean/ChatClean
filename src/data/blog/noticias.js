/**
 * Leitura das Notícias: os vídeos do blog.
 *
 * ─── DOIS CLIENTES, COMO EM TODA A CAMADA ───────────────────────────────────
 *
 * O site lê pelo cliente PÚBLICO, incondicionalmente: quem tem sessão aberta no
 * mesmo navegador vê o que um visitante vê. Nenhuma consulta pública repete o
 * filtro de `publicada`: o que aparece é o que a política de leitura anônima
 * libera, e se esta camada precisasse repetir o filtro para estar correta, o
 * erro estaria na política.
 *
 * O Painel lê pelo cliente do PAINEL, que exige sessão: sem ela o PostgREST
 * responderia 200 com o subconjunto anônimo, e a tela mostraria só as
 * publicadas achando que está completa.
 *
 * **Nenhuma função daqui escreve.** Criar, editar e excluir passam por
 * `data/blog/escrita.js`, que fala com a função de servidor.
 */

import { ehIdDoYoutube } from "../../domain/blog/noticias.js";
import {
  clienteDoPainelOuFalha,
  clientePublicoOuFalha,
  deslocamentoValido,
  ehUuid,
  limiteValido,
} from "./comum.js";
import {
  consultar,
  descrever,
  ehFaixaAlemDoFim,
  exigirLista,
  naoEncontrado,
  sinalDePrazo,
  sucesso,
} from "./resultado.js";

/** A MESMA lista de `COLUNAS_DA_NOTICIA_NA_ESCRITA`, em `api/_nucleo/acesso.js`. */
export const COLUNAS_DA_NOTICIA = Object.freeze([
  "id",
  "titulo",
  "descricao",
  "youtube_id",
  "publicada",
  "publicada_em",
  "criado_em",
  "atualizado_em",
]);

const SELECAO = COLUNAS_DA_NOTICIA.join(",");

/**
 * O que impede uma linha de `noticias` de virar cartão, ou `null`.
 *
 * O identificador do vídeo é exigido no formato: é dele que saem a miniatura e
 * o reprodutor, e uma linha sem ele desenharia um cartão que não toca nada.
 */
export function problemaNaNoticia(linha) {
  if (linha === null || typeof linha !== "object" || Array.isArray(linha)) {
    return `esperava um objeto e veio ${descrever(linha)}`;
  }
  if (typeof linha.id !== "string" || linha.id === "") return "`id` ausente";
  if (typeof linha.titulo !== "string" || linha.titulo.trim() === "") return "`titulo` ausente";
  if (!ehIdDoYoutube(linha.youtube_id)) return "`youtube_id` ausente ou fora do formato";
  return null;
}

/**
 * As Notícias publicadas, da mais nova para a mais antiga.
 *
 * A ordem é `publicada_em` decrescente com `id` de desempate: sem o desempate,
 * duas Notícias publicadas no mesmo instante trocariam de lugar entre duas
 * páginas, e uma delas apareceria duas vezes.
 */
export async function listarNoticiasPublicas({ limite, deslocamento } = {}) {
  const operacao = "listarNoticiasPublicas";

  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const tamanho = limiteValido(limite);
  const inicio = deslocamentoValido(deslocamento);

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from("noticias")
      .select(SELECAO)
      .order("publicada_em", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(inicio, inicio + tamanho - 1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) {
    return ehFaixaAlemDoFim(resposta) ? sucesso([]) : resposta;
  }

  return exigirLista(resposta.dados, { operacao, validarItem: problemaNaNoticia });
}

/**
 * Uma Notícia publicada, pelo identificador.
 *
 * Notícia que não existe e Notícia não publicada dão a MESMA resposta,
 * `nao_encontrado`: a política não devolve a segunda, e distinguir as duas
 * diria a quem visita que há algo ali.
 */
export async function lerNoticiaPublica(id) {
  const operacao = "lerNoticiaPublica";
  if (!ehUuid(id)) {
    return naoEncontrado({
      operacao,
      detalhe: "identificador de notícia ausente ou fora do formato uuid",
    });
  }

  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from("noticias")
      .select(SELECAO)
      .eq("id", id.trim())
      .limit(1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  const lista = exigirLista(resposta.dados, { operacao, validarItem: problemaNaNoticia });
  if (!lista.ok) return lista;
  if (lista.dados.length === 0) {
    return naoEncontrado({ operacao, detalhe: `nenhuma notícia visível com id ${id.trim()}` });
  }
  return sucesso(lista.dados[0]);
}

/**
 * TODAS as Notícias, publicadas ou não: a leitura da tela do Painel.
 *
 * Da mais recentemente criada para a mais antiga: quem acabou de cadastrar um
 * vídeo o encontra no topo, publicado ou não.
 */
export async function listarNoticiasDoPainel({ limite, deslocamento } = {}) {
  const operacao = "listarNoticiasDoPainel";

  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const tamanho = limiteValido(limite);
  const inicio = deslocamentoValido(deslocamento);

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from("noticias")
      .select(SELECAO)
      .order("criado_em", { ascending: false })
      .order("id", { ascending: true })
      .range(inicio, inicio + tamanho - 1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) {
    return ehFaixaAlemDoFim(resposta) ? sucesso([]) : resposta;
  }

  return exigirLista(resposta.dados, { operacao, validarItem: problemaNaNoticia });
}
