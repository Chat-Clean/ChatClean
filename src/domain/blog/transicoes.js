/**
 * A máquina de estados do Post: de cada Estado, o que se pode fazer e para onde
 * isso leva.
 *
 * Domínio puro, como `estados.js`: sem React, sem rede, sem armazenamento — o
 * servidor a importa em Node e a tela a importa no navegador, e é essa dupla
 * cidadania que é o ponto inteiro deste arquivo.
 *
 * ─── UMA DECLARAÇÃO, DOIS CONSUMIDORES ──────────────────────────────────────
 *
 * A tela **deriva** os botões daqui; o servidor **valida** a transição contra a
 * mesma tabela. Não há segunda lista em lugar nenhum, e é isso que impede o
 * caso clássico: a barra deixa de oferecer "voltar para rascunho", todo mundo
 * considera a regra cumprida, e um `fetch` direto continua fazendo exatamente
 * isso. Só a tela é uma regra contornável; só o servidor é uma tela que oferece
 * botão que falha.
 *
 * ─── POR QUE DE `publicado` SÓ SE SAI ARQUIVANDO ────────────────────────────
 *
 * Um Post publicado tem endereço divulgado e pode estar em índice de busca.
 * Voltar para rascunho o faria sumir sem deixar rastro para quem já tinha o
 * link. Arquivar também tira do ar — pela política de leitura, que exige estado
 * publicável —, mas preserva o registro e mantém a intenção explícita. É a
 * regra mais forte deste arquivo, e a que mais tenta ser afrouxada depois:
 * nenhuma ação de `publicado` tem `rascunho` ou `agendado` como destino.
 *
 * ─── SALVAR É UMA AÇÃO, E O DESTINO DELA É O PRÓPRIO ESTADO ─────────────────
 *
 * Todo Estado tem uma ação `salvar` cujo destino é ele mesmo. Isso não é
 * redundância: é o que faz "salvar não é transição" ser uma propriedade da
 * tabela em vez de um comentário. O servidor só escreve a coluna `estado`
 * quando o destino difere do Estado atual, então salvar um Post publicado não
 * toca nem a coluna nem a data de publicação.
 */

import { ESTADOS, ehEstado, rotuloDoEstado } from "./estados.js";

/**
 * O Estado em que todo Post nasce — o mesmo padrão da coluna no banco.
 *
 * Está declarado aqui porque a criação também é uma transição: o servidor
 * valida "de `rascunho` para o que o cliente pediu" antes de gravar o primeiro
 * comando, e sem esta constante ele teria de escrever a palavra à mão.
 */
export const ESTADO_INICIAL = "rascunho";

/**
 * Os Estados que o banco só aceita com data de publicação.
 *
 * É o espelho da restrição `posts_publicavel_exige_data`:
 * `estado not in ('publicado', 'agendado') or publicado_em is not null`. As
 * duas listas são comparadas por igualdade pela ferramenta de verificação, que
 * lê a restrição do catálogo do projeto — divergir daqui é agendar um Post que
 * o banco recusa, com erro de banco no lugar de campo mal preenchido.
 */
export const EXIGE_DATA_DE_PUBLICACAO = Object.freeze(["publicado", "agendado"]);

export function exigeDataDePublicacao(estado) {
  return EXIGE_DATA_DE_PUBLICACAO.includes(estado);
}

/** As duas ênfases que a tela conhece. Fechadas, como todo vocabulário aqui. */
export const ENFASE_PRINCIPAL = "principal";
export const ENFASE_SECUNDARIA = "secundaria";

/**
 * A chave da ação que põe o Post no ar imediatamente.
 *
 * Está nomeada — e não escrita à mão nas duas linhas da tabela — porque ela
 * viaja: quando o servidor recusa um agendamento para o passado, a recusa
 * carrega esta chave como **saída oferecida**, e a tela a procura na tabela
 * do Estado atual para desenhar o botão com o rótulo que já está aqui. É o que
 * impede a alternativa de virar uma string solta escrita duas vezes, uma em
 * `api/` e outra na tela, que divergem na primeira revisão de redação.
 *
 * A busca na tabela também é a LISTA DE PERMISSÃO da oferta: o servidor não
 * consegue mandar a tela executar nada que a máquina não declare para o Estado
 * em que o Post está.
 */
export const ACAO_PUBLICAR = "publicar";

/**
 * A tabela. Para cada Estado, as ações **na ordem em que a tela as oferece**.
 *
 * `chave`     identifica a ação no código e na verificação;
 * `rotulo`    é o que o Autor lê ANTES de acionar, e diz o que a ação FAZ —
 *             passa pelas guardas de voz de `admin/shell/voz.js`, como todo
 *             controle do Painel;
 * `confirmacao` é o que ele lê DEPOIS, e diz o que aconteceu. As duas frases
 *             são diferentes de propósito: "Publicar agora" é promessa, "Post
 *             publicado" é fato, e repetir o rótulo na confirmação deixa a
 *             pessoa sem saber se a ação chegou a acontecer;
 * `destino`   é o Estado em que o Post fica depois;
 * `exigeData` marca as ações que não fazem sentido sem data de publicação, para
 *             que a tela recuse antes de viajar, com frase melhor que a do
 *             banco;
 * `enfase`    diz qual é a ação de sempre (salvar) e quais são as de decisão.
 */
const MAQUINA = Object.freeze({
  rascunho: Object.freeze([
    Object.freeze({
      chave: "salvar",
      rotulo: "Salvar rascunho",
      confirmacao: "Rascunho salvo",
      destino: "rascunho",
      exigeData: false,
      enfase: ENFASE_PRINCIPAL,
    }),
    Object.freeze({
      chave: "agendar",
      rotulo: "Agendar publicação",
      confirmacao: "Publicação agendada",
      destino: "agendado",
      exigeData: true,
      enfase: ENFASE_SECUNDARIA,
    }),
    Object.freeze({
      chave: ACAO_PUBLICAR,
      rotulo: "Publicar agora",
      confirmacao: "Post publicado",
      destino: "publicado",
      exigeData: false,
      enfase: ENFASE_SECUNDARIA,
    }),
  ]),
  agendado: Object.freeze([
    Object.freeze({
      chave: "salvar",
      rotulo: "Salvar agendamento",
      confirmacao: "Agendamento salvo",
      destino: "agendado",
      exigeData: false,
      enfase: ENFASE_PRINCIPAL,
    }),
    /* Reagendar grava o mesmo que salvar — o que muda é a exigência da data e a
       intenção declarada. Duas ações com o mesmo destino não são duplicação:
       "salvei o texto" e "mudei a hora" são coisas diferentes para quem escreve,
       e uma barra que só oferece "salvar" faz o Autor descobrir a segunda por
       acidente. */
    Object.freeze({
      chave: "reagendar",
      rotulo: "Reagendar publicação",
      confirmacao: "Publicação reagendada",
      destino: "agendado",
      exigeData: true,
      enfase: ENFASE_SECUNDARIA,
    }),
    Object.freeze({
      chave: "cancelar_agendamento",
      rotulo: "Cancelar agendamento",
      confirmacao: "Agendamento cancelado",
      destino: "rascunho",
      exigeData: false,
      enfase: ENFASE_SECUNDARIA,
    }),
    Object.freeze({
      chave: ACAO_PUBLICAR,
      rotulo: "Publicar agora",
      confirmacao: "Post publicado",
      destino: "publicado",
      exigeData: false,
      enfase: ENFASE_SECUNDARIA,
    }),
  ]),
  publicado: Object.freeze([
    Object.freeze({
      chave: "salvar",
      rotulo: "Salvar alterações no post",
      confirmacao: "Alterações salvas",
      destino: "publicado",
      exigeData: false,
      enfase: ENFASE_PRINCIPAL,
    }),
    Object.freeze({
      chave: "arquivar",
      rotulo: "Arquivar post",
      confirmacao: "Post arquivado",
      destino: "arquivado",
      exigeData: false,
      enfase: ENFASE_SECUNDARIA,
    }),
  ]),
  arquivado: Object.freeze([
    Object.freeze({
      chave: "salvar",
      rotulo: "Salvar alterações no post",
      confirmacao: "Alterações salvas",
      destino: "arquivado",
      exigeData: false,
      enfase: ENFASE_PRINCIPAL,
    }),
    Object.freeze({
      chave: "republicar",
      rotulo: "Republicar post",
      confirmacao: "Post republicado",
      destino: "publicado",
      exigeData: false,
      enfase: ENFASE_SECUNDARIA,
    }),
  ]),
});

/* A tabela é conferida contra o VOCABULÁRIO, na carga do módulo: todo Estado
   tem entrada, e todo destino é um Estado. É conferência contra `estados.js`,
   não contra si mesma — uma lista que se verifica sozinha não verifica nada. O
   que ela pega é o caso real: alguém acrescenta um quinto Estado ao vocabulário
   e esquece de dizer o que fazer nele, e a tela renderizaria uma barra vazia. */
for (const estado of ESTADOS) {
  if (!Array.isArray(MAQUINA[estado]) || MAQUINA[estado].length === 0) {
    throw new Error(
      `Estado sem ações declaradas: ${JSON.stringify(estado)}. ` +
        "Todo Estado de `src/domain/blog/estados.js` precisa de uma linha em `transicoes.js`.",
    );
  }
  for (const acao of MAQUINA[estado]) {
    if (!ehEstado(acao.destino)) {
      throw new Error(
        `Destino fora do vocabulário na ação ${JSON.stringify(acao.chave)} de ` +
          `${JSON.stringify(estado)}: ${JSON.stringify(acao.destino)}.`,
      );
    }
  }
}

/**
 * As ações disponíveis a partir do Estado, na ordem declarada.
 *
 * Falha alto para valor fora do vocabulário, pela mesma razão de
 * `aparenciaDoEstado`: Estado desconhecido é erro de programação, e devolver
 * lista vazia produziria uma barra sem botão nenhum que ninguém consegue
 * explicar meses depois.
 */
export function acoesDoEstado(estado) {
  if (!ehEstado(estado)) {
    throw new Error(
      `Estado de Post desconhecido: ${JSON.stringify(estado)}. ` +
        `O vocabulário é fechado — os únicos valores são: ${ESTADOS.join(", ")}.`,
    );
  }
  return MAQUINA[estado];
}

/** A ação de chave dada a partir do Estado, ou `null`. */
export function acaoDoEstado(estado, chave) {
  return acoesDoEstado(estado).find((acao) => acao.chave === chave) ?? null;
}

/**
 * Esta transição existe?
 *
 * **Não lança**, e a diferença importa: quem pergunta é o servidor, sobre valor
 * que veio de fora. Estado desconhecido dos dois lados responde `false`, que é
 * a recusa que se quer — não uma exceção que vira 500 sem tipo.
 */
export function transicaoPermitida(de, para) {
  if (!ehEstado(de) || !ehEstado(para)) return false;
  return MAQUINA[de].some((acao) => acao.destino === para);
}

/**
 * A frase que explica a recusa — para o Autor, e para quem chamou a API direto.
 *
 * Ela nomeia a saída existente em vez de só dizer "não pode": a pessoa que
 * tentou despublicar quer tirar o Post do ar, e arquivar é como se faz isso.
 */
export function motivoDaRecusa(de, para) {
  if (!ehEstado(para)) {
    return (
      `Não reconhecemos o estado ${JSON.stringify(para)}. ` +
      `Os estados de um post são: ${ESTADOS.join(", ")}.`
    );
  }
  if (!ehEstado(de)) {
    return (
      `Não reconhecemos o estado atual deste post (${JSON.stringify(de)}), ` +
      "então não dá para saber se a mudança é permitida."
    );
  }
  if (de === "publicado") {
    return (
      "Um post publicado não volta a rascunho nem a agendado, quem já tem o link " +
      "continuaria com ele. Para tirá-lo do ar preservando o registro, arquive."
    );
  }
  return (
    `Um post ${rotuloDoEstado(de).toLowerCase()} não pode ir para ` +
    `${rotuloDoEstado(para).toLowerCase()}. O que dá para fazer agora: ` +
    `${MAQUINA[de].map((acao) => acao.rotulo).join(", ")}.`
  );
}
