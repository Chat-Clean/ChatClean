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

/* As chaves das duas operações que a linha executa vêm do MESMO vocabulário
   fechado que a camada de dados e a função de servidor usam. */
import { OPERACAO_DESTACAR, OPERACAO_EXCLUIR } from "@/domain/blog/operacoes";
/* Os endereços do Painel são vocabulário compartilhado — a listagem, o Editor e
   a declaração de rotas leem os mesmos. Eles vivem em `rotas.js`, e não no
   módulo de uma tela: um módulo compartilhado apontando para o módulo de UMA
   tela é uma seta invertida e um ciclo esperando acontecer. */
import { enderecoDaPrevia, temIdentificadorCorrompido } from "@/admin/blog/rotas";

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

/* ─── ONDE A AÇÃO DE VER LEVA (Story 2.13) ───────────────────────────────── */

/**
 * Os dois destinos possíveis. Vocabulário fechado, pela razão de sempre: a
 * linha e o Editor tomam a MESMA decisão, e duas telas decidindo por conta
 * própria é como um sinônimo entra no projeto.
 */
export const DESTINO_SITE = "site";
export const DESTINO_PREVIA = "previa";

/**
 * Para onde a ação de ver leva — ou `null` quando não há para onde levar.
 *
 * Post publicado com endereço vai para o site; qualquer outro vai para a
 * pré-visualização sob `/admin`, que é a Story 2.13. **Não ter endereço deixou
 * de ser motivo de recusa**: a prévia abre por identificador, e é justamente o
 * rascunho sem slug que mais precisa ser conferido antes de publicar.
 *
 * O único caso sem destino é o Post que ainda não existe no banco — sem
 * identificador não há prévia, e o Editor de um Post que nunca foi salvo é
 * exatamente esse caso. Aí a ação não mente: ou some (no Editor, onde criar é o
 * estado normal), ou fica indisponível dizendo o motivo (na linha, onde a
 * ausência de identificador seria dado corrompido).
 *
 * As duas saídas abrem em ABA NOVA. É o que preserva o que o Autor estava
 * fazendo — no Editor, o texto ainda não salvo; na listagem, a busca e os
 * filtros, que são estado local da página e não sobrevivem a uma navegação.
 */
export function destinoDeVer(post, { pendente = false } = {}) {
  if (podeVerNoSite(post)) {
    return { tipo: DESTINO_SITE, endereco: enderecoPublico(post) };
  }
  /* A pendência viaja só para a prévia: ela é o aviso de que o que está na tela
     ainda não foi gravado, e o site nunca mostrou nada além do gravado. */
  const previa = enderecoDaPrevia(post, { pendente });
  if (previa !== "") {
    return { tipo: DESTINO_PREVIA, endereco: previa };
  }
  return null;
}

/**
 * Por que não dá para ver este Post — as duas metades, para a notificação: o
 * que houve e o que fazer. Devolve `null` quando dá.
 *
 * Sobraram DOIS casos depois da Story 2.13, e nenhum deles é sobre Estado:
 *
 *   - o Post que ainda não foi gravado, e por isso não tem identificador. A
 *     saída é salvar, e ela é a saída de verdade;
 *   - o Post cujo identificador existe mas está fora do formato do banco. Isso
 *     é dado corrompido, e mandar "salve o post" seria mandar a pessoa refazer
 *     um trabalho que já foi feito, por um defeito que não é dela.
 *
 * Duas causas, duas frases — exatamente como o ramo "sem endereço" da Story
 * 2.12 tinha motivo próprio. A ação **existe** e fica indisponível dizendo o
 * motivo, em vez de sumir: um controle que desaparece deixa a pessoa procurando
 * o que fez de errado, e um link que abre uma página quebrada é pior que os
 * dois.
 */
export function motivoDeNaoVer(post) {
  if (destinoDeVer(post) !== null) return null;
  const titulo = tituloParaFrase(post);
  if (temIdentificadorCorrompido(post)) {
    return {
      oQueHouve: `O identificador do post ${titulo} está corrompido`,
      oQueFazer:
        "Recarregue o Painel. Se o post continuar assim, avise quem cuida do site: nada que você faça aqui conserta isso.",
    };
  }
  return {
    oQueHouve: `O post ${titulo} ainda não foi gravado no servidor`,
    oQueFazer:
      "Salve o post pelo Editor: a pré-visualização abre pelo identificador que a gravação cria.",
  };
}

/**
 * O nome do controle de ver — um só para os três casos.
 *
 * Ele diz PARA ONDE vai, e não só que é "ver": o mesmo desenho leva ao site
 * quando o Post está no ar e à prévia quando não está, e quem ouve a tela
 * precisa da diferença antes de apertar.
 */
export function rotuloDeVer(post) {
  const titulo = tituloParaFrase(post);
  const destino = destinoDeVer(post);
  if (destino === null) {
    return `Ver o post ${titulo}, indisponível: ${motivoDeNaoVer(post).oQueHouve}`;
  }
  return destino.tipo === DESTINO_SITE
    ? `Ver o post ${titulo} no site, em nova aba`
    : `Pré-visualizar o post ${titulo}, em nova aba`;
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
