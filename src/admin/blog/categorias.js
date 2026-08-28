/**
 * As regras puras e as frases da tela de Categorias (Story 2.14).
 *
 * Vive em módulo próprio, e não dentro de `TelaDeCategorias.jsx`, pela mesma
 * razão que `listagem.js`, `acoes.js` e `previa.js` vivem fora dos seus
 * componentes: função pura em arquivo de componente quebra a recarga rápida e o
 * lint cobra. O ganho é o de sempre — a verificação **executa** estas funções,
 * e "a recusa diz quantos posts dependem da categoria" deixa de ser uma frase
 * sobre JSX e vira uma regra provada.
 *
 * ─── O VOCABULÁRIO DE COR E DE ÍCONE NÃO MORA AQUI ──────────────────────────
 *
 * Ele é domínio (`domain/blog/categorias.js`), porque o SERVIDOR o consulta
 * para recusar o que não está nele. O que mora aqui é o que só a tela precisa:
 * as situações, os rótulos e as frases.
 *
 * ─── NADA AQUI LANÇA ────────────────────────────────────────────────────────
 *
 * Mesma disciplina de `listagem.js`: uma linha com dado corrompido não pode
 * derrubar a árvore React inteira e levar a tela junto. Categoria sem nome vira
 * "categoria sem nome", nunca exceção.
 */

import {
  COR_PADRAO,
  ICONE_PADRAO,
  ehChaveDeIconeDeCategoria,
  ehCorDeCategoria,
  lerOrdemDeCategoria,
  normalizarNomeDeCategoria,
  problemaNoNomeDeCategoria,
} from "@/domain/blog/categorias";
import {
  OPERACAO_EXCLUIR_CATEGORIA,
  OPERACAO_SALVAR_CATEGORIA,
} from "@/domain/blog/operacoes";
import { formatarNumero } from "@/domain/blog/formato";
import { problemaNoSlug } from "@/domain/blog/slug";

/* ─── As cinco situações da tela ─────────────────────────────────────────── */

export const SITUACAO_CARREGANDO = "carregando";
export const SITUACAO_ERRO = "erro";
export const SITUACAO_VAZIA = "vazio";
export const SITUACAO_LISTA = "lista";
/**
 * A quinta: criar ou editar.
 *
 * A listagem de Posts tem cinco telas porque ela tem dois vazios distintos; aqui
 * o quinto é o formulário, que é superfície própria — mostrar o formulário
 * sobreposto à lista faria a contagem de uso ficar visível atrás de um campo de
 * texto, e é justamente a contagem que decide o que a pessoa pode fazer.
 */
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
 * A situação da tela, a partir do que ela sabe.
 *
 * Mora aqui, e não num ternário de JSX, porque a ORDEM dos ramos é regra e não
 * detalhe de escrita: o formulário vem ANTES de tudo — quem está escrevendo uma
 * categoria não pode ver o esqueleto de uma releitura passar por cima do que
 * digitou —, e o erro vem antes do vazio, porque erro não é vazio e trocar um
 * pelo outro é como alguém conclui que a lista inteira sumiu.
 */
export function situacaoDaTela({
  editando = false,
  carregando = false,
  erro = null,
  categorias = [],
} = {}) {
  if (editando) return SITUACAO_FORMULARIO;
  if (carregando) return SITUACAO_CARREGANDO;
  if (erro !== null && erro !== undefined) return SITUACAO_ERRO;
  const lista = Array.isArray(categorias) ? categorias : [];
  return lista.length === 0 ? SITUACAO_VAZIA : SITUACAO_LISTA;
}

/* ─── As frases da tela ──────────────────────────────────────────────────── */

export const TITULO_DA_TELA = "Categorias do blog";

/**
 * O que a tela é, dito antes de qualquer ação.
 *
 * A frase carrega a consequência de renomear porque ela é contraintuitiva e boa:
 * o Post aponta para a Categoria e não guarda o nome dela, então renomear
 * acerta todos os Posts sem que nenhum seja tocado.
 */
export const DESCRICAO_DA_TELA =
  "Elas classificam os posts no Painel e dão os nomes do filtro do site. Renomear muda o nome em todos os posts do Painel de uma vez; no site, o filtro só volta a encontrar os posts antigos quando eles também vierem do banco.";

export const ROTULO_DE_VOLTAR = "Voltar para a listagem de posts";
export const ROTULO_DE_NOVA = "Nova categoria";

export const TITULO_DO_VAZIO = "Nenhuma categoria ainda";
export const DESCRICAO_DO_VAZIO =
  "Crie a primeira categoria para classificar os posts na listagem, no editor e no filtro do site.";
export const ROTULO_DA_PRIMEIRA = "Criar a primeira categoria";

export const TITULO_DO_ERRO = "Não deu para carregar as categorias";
export const ROTULO_DE_RECARREGAR = "Tentar carregar as categorias de novo";

export const ROTULO_DE_CANCELAR = "Cancelar e voltar para a lista";

/** O aviso de que a tela mostra um LOTE, e não tudo o que existe. */
export const AVISO_DE_MAIS_CATEGORIAS =
  "Pode haver mais categorias além das que estão nesta lista.";

/** O rótulo do controle que traz o próximo lote. Ele diz o que fará. */
export const ROTULO_DE_CARREGAR_MAIS = "Carregar mais categorias";

/* ─── O nome, sempre utilizável ──────────────────────────────────────────── */

/**
 * O nome como ele aparece nas frases — nunca vazio.
 *
 * Categoria sem nome não deveria existir (o banco recusa por
 * `categorias_nome_nao_vazio`), mas a tela mostra o que está gravado, e uma
 * confirmação que diz "Excluir “”?" é pior que uma que diz "sem nome".
 */
export function nomeParaFrase(categoria) {
  const nome = normalizarNomeDeCategoria(categoria?.nome);
  return nome === "" ? "categoria sem nome" : nome;
}

/* ─── O uso ──────────────────────────────────────────────────────────────── */

/**
 * Quantos Posts usam esta Categoria — ou `null` quando não deu para contar.
 *
 * ─── `null` NÃO É ZERO, E A DIFERENÇA DECIDE UMA EXCLUSÃO ───────────────────
 *
 * A camada devolve `posts: null` quando a agregação do banco não pôde ser lida.
 * Tratar isso como `0` faria a tela oferecer excluir uma Categoria
 * possivelmente em uso — "nenhum post depende desta categoria" é a frase que
 * LIBERA a exclusão, e dizê-la por engano é o modo de falha mais caro que esta
 * tela tem. O `restrict` do banco salvaria o dado; a tela teria mentido antes.
 *
 * Número negativo, fracionário ou fora de forma também vira `null`: o que não
 * se sabe não vira zero.
 */
export function usoDaCategoria(categoria) {
  const total = categoria?.posts;
  if (!Number.isInteger(total) || total < 0) return null;
  return total;
}

/**
 * O uso por extenso, para a linha.
 *
 * O número aparece ANTES de a pessoa tentar excluir — é o que transforma "não
 * deu" numa decisão que ela pode tomar sozinha. Singular e plural por extenso,
 * porque "1 posts" é a marca de um texto que ninguém leu. E o desconhecido é
 * dito como desconhecido, nunca como zero.
 */
export function textoDoUso(categoria) {
  const total = usoDaCategoria(categoria);
  if (total === null) return "Uso desconhecido";
  if (total === 0) return "Nenhum post";
  if (total === 1) return "1 post";
  return `${formatarNumero(total)} posts`;
}

/**
 * Categoria sem Post pode ser excluída — e "sem Post" precisa ser SABIDO.
 *
 * Contagem que não deu para ler é `null`, e `null` não libera nada: o banco
 * recusaria de qualquer jeito por `posts_categoria_id_fkey`, e a tela não pode
 * prometer uma exclusão que ela não tem como saber se é possível.
 */
export function podeExcluir(categoria) {
  return usoDaCategoria(categoria) === 0;
}

/**
 * Por que não dá para excluir — o que houve e o que fazer. `null` quando dá.
 *
 * São dois motivos diferentes, e eles pedem coisas diferentes de quem lê: a
 * Categoria está em uso (a saída é mudar a categoria dos posts), ou a contagem
 * não pôde ser lida (a saída é recarregar). Colapsar os dois mandaria a pessoa
 * procurar posts que talvez não existam.
 *
 * A frase do primeiro diz o NÚMERO, e é a mesma informação que o servidor
 * devolve quando alguém tenta mesmo assim: quem conta, nas duas vezes, é o
 * banco.
 */
export function motivoDeNaoExcluir(categoria) {
  const total = usoDaCategoria(categoria);
  const nome = nomeParaFrase(categoria);
  if (total === null) {
    return {
      oQueHouve: `Não deu para contar quantos posts usam a categoria ${nome}`,
      oQueFazer:
        "Carregue a lista de novo. Enquanto o número não vier, a exclusão fica indisponível: excluir sem saber é o que arrastaria posts junto.",
    };
  }
  if (total === 0) return null;
  const quantos = total === 1 ? "1 post a usa" : `${formatarNumero(total)} posts a usam`;
  return {
    oQueHouve: `A categoria ${nome} não pode ser excluída: ${quantos}`,
    /* A EXPLICAÇÃO PRECISA LEVAR A ALGUM LUGAR. "Abra esses posts" não diz como
       achá-los — e a listagem não filtra por Categoria. O caminho que EXISTE é
       a busca do Painel, que desde a Story 2.11 procura no título, na
       Categoria, no Autor e nas Tags: procurar pelo nome dela devolve
       exatamente esses posts. */
    oQueFazer: `Procure por “${nome}” na busca do Painel: ela acha os posts pela categoria. Abra cada um, escolha outra categoria e a exclusão fica liberada.`,
  };
}

/* ─── Os rótulos das ações da linha ──────────────────────────────────────── */

/**
 * Numa lista de dez linhas, dez controles chamados "Editar" são dez controles
 * indistinguíveis para quem navega por leitor de tela. Todo rótulo nomeia a
 * Categoria.
 */
export function rotuloDeEditar(categoria) {
  return `Editar a categoria ${nomeParaFrase(categoria)}`;
}

/** O rótulo de excluir diz também quando ele está indisponível, e por quê. */
export function rotuloDeExcluir(categoria) {
  const nome = nomeParaFrase(categoria);
  if (!podeExcluir(categoria)) {
    return `Excluir a categoria ${nome}, indisponível: ${motivoDeNaoExcluir(categoria).oQueHouve}`;
  }
  return `Excluir a categoria ${nome}`;
}

/* ─── A confirmação ──────────────────────────────────────────────────────── */

/** A pergunta do diálogo — com o nome da Categoria dentro dela. */
export function tituloDaExclusao(categoria) {
  return `Excluir “${nomeParaFrase(categoria)}”?`;
}

/**
 * A consequência, dita ANTES da confirmação — e ela é factual.
 *
 * A exclusão só é oferecida para Categoria sem Post, então não há post a
 * perder: o que se perde é a própria categoria, no Editor e no filtro do site.
 * Prometer mais que isso seria alarme sobre consequência que não existe.
 */
export function descricaoDaExclusao() {
  return "Ela sai do editor e do filtro do site. Nenhum post é alterado, porque nenhum post usa esta categoria. Não dá para desfazer.";
}

/** O rótulo do botão que confirma. Nomeia o que faz — "Excluir" sozinho não. */
export const ROTULO_DE_CONFIRMAR_EXCLUSAO = "Excluir categoria";

/** A confirmação depois do fato, nomeando a Categoria que saiu. */
export function confirmacaoDaExclusao(categoria) {
  return `Categoria ${nomeParaFrase(categoria)} excluída`;
}

/** A falha da exclusão: o que houve. O que fazer vem da frase do erro tipado. */
export function falhaDaExclusao(categoria) {
  return `Não deu para excluir a categoria ${nomeParaFrase(categoria)}`;
}

/** A confirmação de um salvamento, distinguindo criar de renomear. */
export function confirmacaoDoSalvamento(categoria, criada) {
  const nome = nomeParaFrase(categoria);
  return criada ? `Categoria ${nome} criada` : `Categoria ${nome} salva`;
}

/** A falha de um salvamento. */
export function falhaDoSalvamento(categoria) {
  return `Não deu para salvar a categoria ${nomeParaFrase(categoria)}`;
}

/**
 * O que está acontecendo, para quem ouve a tela.
 *
 * Alvo desabilitado sem explicação é alvo que parou de funcionar. `aria-busy`
 * diz que há algo em voo, e este texto diz o quê — a tela o anuncia numa região
 * viva, uma vez, em vez de deixar o leitor de tela em silêncio.
 */
export function textoDaAcaoEmCurso(categoria, acao) {
  const nome = nomeParaFrase(categoria);
  if (acao === OPERACAO_EXCLUIR_CATEGORIA) return `Excluindo a categoria ${nome}…`;
  if (acao === OPERACAO_SALVAR_CATEGORIA) return `Salvando a categoria ${nome}…`;
  return "";
}

/* ─── O formulário ───────────────────────────────────────────────────────── */

/**
 * Os campos do formulário, na ordem em que ele os oferece.
 *
 * A ordem é significativa e é COBRADA: a verificação lê os campos que a tela
 * desenha e exige esta sequência. Sem isso a lista era uma promessa exportada
 * que ninguém importava — e o comentário afirmava uma ordem que nada garantia.
 */
export const CAMPOS_DO_FORMULARIO = Object.freeze([
  "nome",
  "slug",
  "cor",
  "icone",
  "ordem",
]);

/**
 * A frase de cada campo que falta ou que não serve.
 *
 * `slug` está aqui e NÃO é alcançável por `faltandoNoFormulario` — o endereço
 * não é obrigatório, porque ele é derivado do nome quando fica em branco. Ela é
 * a frase de reserva do campo quando a recusa vem sem motivo próprio; o caso
 * comum é a recusa NOMEADA de `corpoDaCategoria`.
 */
export const FRASES_DE_FALTA = Object.freeze({
  nome: "O nome é obrigatório: é ele que aparece no editor, na listagem e no filtro do site.",
  slug: "O endereço aceita apenas letras minúsculas sem acento, números e hífen entre palavras.",
});

/** O formulário de uma Categoria que ainda não existe. */
export function valoresVazios() {
  return {
    nome: "",
    slug: "",
    cor: COR_PADRAO,
    icone: ICONE_PADRAO,
    ordem: "",
  };
}

/**
 * Os valores do formulário a partir de uma linha de `categorias`.
 *
 * Tudo vira **texto** — inclusive o número: um campo controlado do React com
 * `value={null}` passa a não controlado no meio da digitação, e o aviso disso
 * aparece no console muito depois de o defeito ter acontecido.
 */
export function valoresDaCategoria(categoria) {
  if (categoria === null || typeof categoria !== "object") return valoresVazios();
  return {
    nome: typeof categoria.nome === "string" ? categoria.nome : "",
    slug: typeof categoria.slug === "string" ? categoria.slug : "",
    cor: typeof categoria.cor === "string" && categoria.cor !== "" ? categoria.cor : COR_PADRAO,
    icone:
      typeof categoria.icone === "string" && categoria.icone !== ""
        ? categoria.icone
        : ICONE_PADRAO,
    /* AUSÊNCIA É AUSÊNCIA. `String(null)` é "null", e era isso que o campo
       mostrava para uma linha com `ordem` nula — texto que a gravação depois
       recusa, sobre um valor que ninguém digitou. */
    ordem: Number.isInteger(categoria.ordem) ? String(categoria.ordem) : "",
  };
}

/** Os campos obrigatórios vazios, ANTES de o pedido sair. */
export function faltandoNoFormulario(valores) {
  const v = valores ?? {};
  return normalizarNomeDeCategoria(v.nome) === "" ? ["nome"] : [];
}

/**
 * O corpo do pedido de gravação.
 *
 * Devolve `{ ok: true, corpo }` ou `{ ok: false, campo, motivo }` — a recusa
 * nomeia o CAMPO para que o formulário possa apontá-lo, em vez de a tela
 * mostrar uma frase solta no rodapé.
 *
 * O que ela NÃO faz é decidir se a cor e o ícone existem: o vocabulário é
 * fechado e quem recusa de verdade é o servidor, inclusive para quem não passou
 * por esta tela. A tela só oferece o que existe.
 *
 * Endereço vazio na CRIAÇÃO viaja ausente de propósito: quem o deriva do nome é
 * o servidor, pela mesma `gerarSlug` que o Post usa — mandar `""` faria a
 * derivação virar recusa.
 */
export function corpoDaCategoria(valores) {
  const v = valores ?? valoresVazios();

  const nome = normalizarNomeDeCategoria(v.nome);
  const problemaNoNome = problemaNoNomeDeCategoria(nome);
  if (problemaNoNome !== null) {
    return { ok: false, campo: "nome", motivo: problemaNoNome };
  }

  const slug = String(v.slug ?? "").trim();
  if (slug !== "") {
    const problema = problemaNoSlug(slug);
    if (problema !== null) return { ok: false, campo: "slug", motivo: problema };
  }

  /* O TETO É O DO DOMÍNIO, e a leitura é a MESMA que o servidor usa. A tela
     aceitava quatro dígitos e o servidor recusava acima de mil: digitar 5000
     passava aqui e voltava recusado da rede, sobre um campo que a tela tinha
     acabado de aprovar. */
  const ordem = String(v.ordem ?? "").trim();
  let ordemLida = null;
  if (ordem !== "") {
    const lida = lerOrdemDeCategoria(ordem);
    if (!lida.ok) return { ok: false, campo: "ordem", motivo: lida.motivo };
    ordemLida = lida.ordem;
  }

  const corpo = { nome };
  /* COR E ÍCONE SÓ VIAJAM QUANDO A TELA OS RECONHECE. Uma Categoria gravada
     antes deste vocabulário tem cor legada: reenviá-la faria o servidor recusar
     a gravação, e renomear ficaria travado para sempre. Omitido é "preserva o
     que está lá" — que é exatamente o que se quer, e é o mesmo caminho que a
     pílula segue ao cair no padrão sem gravar nada. */
  if (ehCorDeCategoria(v.cor)) corpo.cor = v.cor;
  if (ehChaveDeIconeDeCategoria(v.icone)) corpo.icone = v.icone;
  if (slug !== "") corpo.slug = slug;
  if (ordemLida !== null) corpo.ordem = ordemLida;
  return { ok: true, corpo };
}
