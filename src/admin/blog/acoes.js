/**
 * As regras puras das ações por linha da listagem (Story 2.12).
 *
 * Vive em módulo próprio, e não dentro de `ListaDePosts.jsx`, pela mesma razão
 * que `listagem.js`, `gaveta.js` e `pendencia.js` vivem fora dos seus
 * componentes: função pura em arquivo de componente quebra a recarga rápida e o
 * lint cobra. O ganho é o de sempre — a verificação **executa** estas funções,
 * e "a confirmação nomeia o post" deixa de ser uma frase sobre JSX e vira uma
 * regra provada.
 *
 * ─── AS QUATRO AÇÕES, E POR QUE ELAS TÊM NOME COMPLETO ──────────────────────
 *
 * Numa lista de vinte linhas, vinte controles chamados "Excluir" são vinte
 * controles indistinguíveis para quem navega por leitor de tela — e o que se
 * ouve antes de apertar é justamente o que decide se a pessoa aperta. Por isso
 * todo rótulo aqui **nomeia o Post**.
 *
 * ─── A CONFIRMAÇÃO DIZ O TÍTULO, E DIZ A CONSEQUÊNCIA ───────────────────────
 *
 * Diálogo que pergunta "tem certeza?" ensina a clicar em "sim" sem ler. Diálogo
 * que diz o título faz a pessoa parar quando o título está errado — que é
 * exatamente o caso que a confirmação existe para pegar. E a consequência é
 * factual, não alarmista: o que muda é o que o Post arrasta junto, e quem já
 * tem o link.
 *
 * ─── NADA AQUI LANÇA ────────────────────────────────────────────────────────
 *
 * Mesma disciplina de `listagem.js`: uma linha com dado corrompido não pode
 * derrubar a árvore React inteira e levar a listagem junto. Post sem título vira
 * "post sem título", nunca exceção.
 */

/* O vocabulário de Estado vem do domínio, e a frase da indisponibilidade sai
   dele: escrever "rascunho" à mão aqui criaria o sinônimo que a lista fechada
   existe para impedir. */
import { ehEstado, rotuloDoEstado } from "@/domain/blog/estados";
/* As chaves das duas operações que a linha executa vêm do MESMO vocabulário
   fechado que a camada de dados e a função de servidor usam. */
import { OPERACAO_DESTACAR, OPERACAO_EXCLUIR } from "@/domain/blog/operacoes";

/* ─── O título do Post, sempre utilizável ────────────────────────────────── */

/**
 * O título como ele aparece nas frases — nunca vazio.
 *
 * Post sem título é possível: a listagem mostra o que está gravado, e um Post
 * pode ter nascido com o campo em branco antes de a exigência existir. Uma
 * confirmação que diz "Excluir “”?" é pior que uma que diz "sem título".
 */
export function tituloParaFrase(post) {
  const titulo = String(post?.titulo ?? "").trim();
  return titulo === "" ? "post sem título" : titulo;
}

/* ─── Editar ─────────────────────────────────────────────────────────────── */
/*
 * O rótulo do controle que abre o Post no Editor NÃO mora aqui: ele já existe
 * em `listagem.js`, como `rotuloParaAbrir`, desde a Story 2.10 — e é o único
 * dos quatro que já existia. Uma segunda função com a mesma finalidade seria o
 * sinônimo que a convenção do projeto proíbe, e a divergência apareceria como
 * duas frases para o mesmo controle conforme quem o renderizasse.
 */

/* ─── Ver no site ────────────────────────────────────────────────────────── */

/**
 * O endereço público do Post, ou `""` quando ele não tem um utilizável.
 *
 * Escrito uma vez, aqui, porque ele já existe no Editor: duas montagens da
 * mesma URL divergem no dia em que o prefixo do blog mudar, e a divergência
 * aparece como um link que erra — que é justamente o que esta ação não pode ser.
 */
export function enderecoPublico(post) {
  const slug = String(post?.slug ?? "").trim();
  return slug === "" ? "" : `/blog/${slug}`;
}

/**
 * Dá para ver este Post no site?
 *
 * A regra é a MESMA que o Editor usa para oferecer "Ver no site": Estado
 * `publicado`, com endereço. Ela não é a política de visibilidade do banco
 * reescrita em JavaScript — e não pode ser: a política é a única guardiã do
 * que o visitante enxerga, e repeti-la aqui criaria uma segunda regra que
 * divergiria dela em silêncio. O que esta função responde é mais modesto e é o
 * suficiente para a tela: o Autor declarou este Post publicado?
 */
export function podeVerNoSite(post) {
  return post?.estado === "publicado" && enderecoPublico(post) !== "";
}

/** O nome do controle que abre o Post no site, em aba nova. */
export function rotuloDeVerNoSite(post) {
  return `Ver o post ${tituloParaFrase(post)} no site, em nova aba`;
}

/**
 * Por que ainda não dá para ver este Post — as duas metades, para a
 * notificação: o que houve e o que fazer.
 *
 * Devolve `null` quando dá. A ação **existe** e fica indisponível dizendo o
 * motivo, em vez de sumir: um controle que desaparece deixa a pessoa procurando
 * o que fez de errado, e um link que abre uma página quebrada é pior que os
 * dois. A pré-visualização de Post não publicado é a Story 2.13, e até lá a
 * resposta honesta é esta.
 */
export function motivoDeNaoVerNoSite(post) {
  if (podeVerNoSite(post)) return null;

  const titulo = tituloParaFrase(post);
  if (enderecoPublico(post) === "") {
    return {
      oQueHouve: `O post ${titulo} ainda não tem endereço`,
      oQueFazer: "Abra o post no Editor, defina o endereço e salve antes de vê-lo no site.",
    };
  }
  const estado = post?.estado;
  const palavra = ehEstado(estado) ? rotuloDoEstado(estado).toLowerCase() : "sem estado";
  return {
    oQueHouve: `O post ${titulo} está ${palavra} e não está no ar`,
    oQueFazer:
      "Só post publicado abre no site. A pré-visualização de post não publicado ainda não existe no Painel.",
  };
}

/** O rótulo do controle indisponível — ele diz o motivo, não só que não dá. */
export function rotuloDeVerIndisponivel(post) {
  const motivo = motivoDeNaoVerNoSite(post);
  const base = `Ver o post ${tituloParaFrase(post)} no site`;
  return motivo === null ? base : `${base} — indisponível: ${motivo.oQueHouve}`;
}

/* ─── Destaque ───────────────────────────────────────────────────────────── */

/** O Post está destacado? A coluna é booleana, e só `true` é destaque. */
export function estaDestacado(post) {
  return post?.destaque === true;
}

/**
 * O nome do controle de Destaque, que diz o que ele **fará** — não o estado em
 * que o Post está. "Destaque" sozinho num controle que alterna não diz se
 * apertar liga ou desliga, e a pessoa descobre pelo resultado.
 */
export function rotuloDeDestaque(post) {
  const titulo = tituloParaFrase(post);
  return estaDestacado(post)
    ? `Tirar o destaque do post ${titulo}`
    : `Destacar o post ${titulo}`;
}

/** A confirmação: diz o FATO, e nomeia o Post. */
export function confirmacaoDeDestaque(post, destaque) {
  const titulo = tituloParaFrase(post);
  return destaque ? `Post ${titulo} destacado` : `Destaque do post ${titulo} removido`;
}

/** A falha: o que houve, e o que fazer. A frase do "o que fazer" vem do erro. */
export function falhaDeDestaque(post, destaque) {
  const titulo = tituloParaFrase(post);
  return destaque
    ? `Não deu para destacar o post ${titulo}`
    : `Não deu para tirar o destaque do post ${titulo}`;
}

/* ─── Excluir ────────────────────────────────────────────────────────────── */

/** O nome do controle que abre a confirmação. */
export function rotuloDeExcluir(post) {
  return `Excluir o post ${tituloParaFrase(post)}`;
}

/** A pergunta do diálogo — com o título do Post dentro dela. */
export function tituloDaExclusao(post) {
  return `Excluir “${tituloParaFrase(post)}”?`;
}

/**
 * A consequência, dita ANTES da confirmação.
 *
 * ─── E ELA DIZ O QUE DE FATO ACONTECE ───────────────────────────────────────
 *
 * A primeira versão prometia que o Post saía "junto com as tags". Não é o que
 * acontece: a cascata do banco vai de `posts` para `posts_tags` — a
 * ASSOCIAÇÃO entre os dois —, e as Tags em si continuam existindo, porque uma
 * Tag é de todos os Posts e apagá-la levaria junto os artigos dos outros. A
 * própria verificação prova a diferença: ela limpa a Tag de teste por SQL, à
 * parte, exatamente porque a exclusão do Post não a leva. Aviso de consequência
 * que exagera é aviso que ensina a desconfiar do aviso.
 *
 * Duas metades: o que sai junto e o que quem já tem o link vai encontrar. A
 * segunda só aparece para Post publicado, porque só ele tem link divulgado —
 * dizê-la sobre um rascunho seria alarme sobre consequência que não existe.
 */
export function descricaoDaExclusao(post) {
  const comum =
    "O post sai do Painel, e sai das tags e dos endereços antigos em que estava. As tags em si continuam. Não dá para desfazer.";
  if (podeVerNoSite(post)) {
    return `${comum} Ele está no ar: quem tiver o link passa a receber página não encontrada.`;
  }
  return comum;
}

/** O rótulo do botão que confirma. Nomeia o que faz — "Excluir" sozinho não. */
export const ROTULO_DE_CONFIRMAR_EXCLUSAO = "Excluir post";

/** A confirmação depois do fato, nomeando o Post que saiu. */
export function confirmacaoDaExclusao(post) {
  return `Post ${tituloParaFrase(post)} excluído`;
}

/** A falha da exclusão: o que houve. O que fazer vem da frase do erro tipado. */
export function falhaDaExclusao(post) {
  return `Não deu para excluir o post ${tituloParaFrase(post)}`;
}

/* ─── Ação em curso ──────────────────────────────────────────────────────── */

/**
 * O que está acontecendo, para quem ouve a tela.
 *
 * Alvo desabilitado sem explicação é alvo que parou de funcionar. `aria-busy`
 * diz que há algo em voo, e este texto diz o quê — a listagem o anuncia numa
 * região viva, uma vez, em vez de deixar o leitor de tela em silêncio.
 */
export function textoDaAcaoEmCurso(post, acao) {
  const titulo = tituloParaFrase(post);
  if (acao === OPERACAO_EXCLUIR) return `Excluindo o post ${titulo}…`;
  if (acao === OPERACAO_DESTACAR) return `Mudando o destaque do post ${titulo}…`;
  return "";
}
