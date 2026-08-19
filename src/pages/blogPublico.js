/**
 * As regras puras das duas telas públicas do blog (Story 2.15).
 *
 * Mesma razão de `admin/blog/listagem.js`, `acoes.js` e `previa.js` existirem:
 * função pura em arquivo de componente quebra a recarga rápida e o lint cobra.
 * O ganho é o de sempre — a verificação **executa** estas funções, e "a tela
 * diz o que houve e o que fazer" deixa de ser uma frase sobre JSX e vira regra
 * provada.
 *
 * ─── LER DO BANCO É ESPERAR ─────────────────────────────────────────────────
 *
 * Até esta story as duas páginas liam do armazenamento do navegador: a resposta
 * era síncrona e não havia estado nenhum a desenhar. Agora há cinco na listagem
 * — carregando, pronta, vazia, sem-resultado, falha e falha permanente — e
 * cinco no artigo, e a diferença entre eles é o que separa "ainda não há
 * artigos" de "não consegui carregar". Trocar um pelo outro manda quem lê para
 * a conclusão errada, e página em branco é o modo de falha que estas telas não
 * podem ter.
 *
 * ─── DOIS VOCABULÁRIOS, E ELES NÃO COMPARTILHAM VALOR ───────────────────────
 *
 * Cada tela tem o seu conjunto fechado, e os valores são prefixados
 * (`lista-…`, `artigo-…`) de propósito. Enquanto `LISTA_FALHA` e `ARTIGO_FALHA`
 * eram os dois `"falha"`, `falaDaLista(ARTIGO_FALHA)` não lançava: devolvia a
 * fala da OUTRA tela. A guarda de situação desconhecida existe justamente para
 * a confusão plausível, e a confusão plausível entre duas telas irmãs é trocar
 * uma pela outra.
 *
 * ─── DATA E TEMPO SÃO APRESENTAÇÃO ──────────────────────────────────────────
 *
 * O que vem do banco é um instante (`timestamptz`) e um número de minutos. O
 * fuso e o formato se aplicam AQUI, sobre eles, pelas funções de `domain/blog`
 * — nunca por uma segunda formatação escrita na tela.
 *
 * **Nada aqui lança**, fora as duas guardas de vocabulário fechado.
 * `domain/blog/formato.js` falha alto de propósito, e isso é certo no caminho
 * de escrita e errado no meio de uma página pública: um `publicado_em`
 * corrompido derrubaria o artigo inteiro por causa de uma linha de metadado.
 * Aqui a exceção vira ausência.
 *
 * Módulo puro: sem React, sem rede, sem DOM.
 */

import { formatarData, formatarNumero } from "@/domain/blog/formato";
import {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
  MENSAGENS_DE_LEITURA,
} from "@/data/blog/resultado";

/* ─── O vocabulário do filtro ────────────────────────────────────────────── */

/**
 * A escolha que significa "sem filtro".
 *
 * Ela NÃO é uma Categoria — cadastrá-la no banco criaria uma Categoria que
 * ninguém pode usar num Post —, e por isso continua escrita no código. Morava
 * em `lib/blogStore.js`, que saiu do projeto com o armazenamento no navegador;
 * mudou de casa sem mudar de dono: continua existindo UMA vez.
 */
export const CATEGORIA_TODOS = "Todos";

/**
 * Quanto a página espera antes de perguntar ao banco o que foi digitado.
 *
 * A busca agora vai ao servidor. Sem esta espera, uma palavra de oito letras
 * dispara oito consultas, sete delas descartadas antes de chegar — e a última
 * pode voltar depois de uma anterior, deixando na tela o resultado da pergunta
 * errada. É o mesmo número e o mesmo motivo da busca do Painel.
 */
export const ESPERA_DA_BUSCA_MS = 300;

/**
 * Quantos artigos por página.
 *
 * O teto da camada de dados é 200, e ele é de SEGURANÇA, não de produto: a
 * página que pede 200 cartões de uma vez carrega o vigésimo primeiro post que
 * ninguém vai rolar até ver, e o post 201 fica inalcançável sem que nada diga
 * isso. Com página e "carregar mais", o fim da lista é uma resposta, e não um
 * corte silencioso.
 */
export const TAMANHO_DA_PAGINA = 12;

/**
 * A resposta veio cheia — logo pode haver mais depois dela.
 *
 * Página cheia não PROVA que há mais: o total pode ser múltiplo exato do
 * tamanho, e aí o "carregar mais" traz zero. Isso é preferível ao contrário —
 * esconder o controle quando ainda há artigos é o corte silencioso que a
 * paginação existe para acabar.
 */
export function haMaisParaCarregar(recebidos) {
  return Array.isArray(recebidos) && recebidos.length >= TAMANHO_DA_PAGINA;
}

/**
 * As Categorias que viram pastilha, a partir do que o banco devolveu.
 *
 * Devolve `[{ id, nome }]`, sem "Todos" — quem monta a barra põe a ausência de
 * filtro na frente.
 *
 * ─── TRÊS RECUSAS, E CADA UMA TEM UM DEFEITO ATRÁS ──────────────────────────
 *
 * Uma Categoria chamada "Todos" produziria duas pastilhas iguais, chave de
 * React repetida e um filtro ambíguo — o clique numa delas mostraria tudo.
 * "Todos" é o rótulo da AUSÊNCIA de filtro, e por isso não pode ser também o
 * rótulo de uma Categoria.
 *
 * Nome repetido colapsa pela mesma razão. O banco tem unicidade de nome desde a
 * Story 2.14, mas a tela não pode depender disso para não desenhar duas chaves
 * iguais: quem se protege de dado que "não pode acontecer" é quem continua de
 * pé quando ele acontece.
 *
 * E o IDENTIFICADOR repetido colapsa também — a chave de React e o valor do
 * filtro são ele, não o nome. Duas linhas com o mesmo id e nomes diferentes
 * desenhariam duas pastilhas que acendem juntas e filtram a mesma coisa.
 */
export function categoriasDoFiltro(lista) {
  const entradas = Array.isArray(lista) ? lista : [];
  const escolhidas = [];
  const nomesVistos = new Set();
  const idsVistos = new Set();
  for (const categoria of entradas) {
    const nome = String(categoria?.nome ?? "").trim();
    const id = String(categoria?.id ?? "").trim();
    if (nome === "" || id === "" || nome === CATEGORIA_TODOS) continue;
    if (nomesVistos.has(nome) || idsVistos.has(id)) continue;
    nomesVistos.add(nome);
    idsVistos.add(id);
    escolhidas.push({ id, nome });
  }
  return escolhidas;
}

/* ─── As situações da listagem ───────────────────────────────────────────── */

export const LISTA_CARREGANDO = "lista-carregando";
export const LISTA_PRONTA = "lista-pronta";
/** Não há Post publicado nenhum. Convida a voltar depois; não é erro. */
export const LISTA_VAZIA = "lista-vazia";
/** Há Posts, mas nenhum atende ao que foi pedido. É o único com desfazer. */
export const LISTA_SEM_RESULTADO = "lista-sem-resultado";
export const LISTA_FALHA = "lista-falha";
/**
 * Falha que repetir NÃO resolve: ambiente mal configurado, defeito inesperado.
 *
 * Ela existe pela mesma razão que a irmã do artigo: com `.env` ausente, uma
 * listagem que só soubesse dizer "confira a conexão" mandaria o visitante
 * procurar o problema no lugar errado e ofereceria um botão que nunca vai
 * funcionar. Duas causas, duas frases.
 */
export const LISTA_FALHA_PERMANENTE = "lista-falha-permanente";

/**
 * As situações em que a listagem NÃO desenha cartão. Lista fechada: uma
 * situação nova só entra editando este arquivo, e nunca vira tela em branco.
 */
export const SITUACOES_SEM_CARTAO = Object.freeze([
  LISTA_VAZIA,
  LISTA_SEM_RESULTADO,
  LISTA_FALHA,
  LISTA_FALHA_PERMANENTE,
]);

/**
 * O erro tipado da camada vira a situação da listagem.
 *
 * Mesma leitura por lista de PERMISSÃO do artigo, e o mesmo motivo: só tipo
 * conhecido escolhe situação, e o desconhecido cai na falha permanente — a
 * única que não promete nada.
 *
 * `permissao` cai em falha permanente, e não numa tela que peça para entrar: no
 * site público não existe "entre de novo", e a leitura é anônima por
 * construção. Se ela respondeu permissão, o que houve foi configuração, não
 * sessão.
 */
export function situacaoDoErroDaLista(erro) {
  const tipo = erro?.tipo;
  if (tipo === ERRO_REDE) return LISTA_FALHA;
  if (tipo === ERRO_CONFIGURACAO) return LISTA_FALHA_PERMANENTE;
  if (tipo === ERRO_PERMISSAO) return LISTA_FALHA_PERMANENTE;
  if (tipo === ERRO_NAO_ENCONTRADO) return LISTA_FALHA_PERMANENTE;
  return LISTA_FALHA_PERMANENTE;
}

/**
 * Há filtro em curso? É o que separa o vazio de busca do vazio inicial — e a
 * pergunta precisa ser feita sobre o que foi PEDIDO, não sobre o que voltou:
 * uma lista de tamanho zero é a mesma lista nos dois casos.
 */
export function haFiltroAtivo({ termo = "", categoria = CATEGORIA_TODOS } = {}) {
  const alvo = typeof termo === "string" ? termo.trim() : "";
  return alvo !== "" || (categoria !== CATEGORIA_TODOS && categoria !== "");
}

/**
 * A leitura está em curso SOBRE uma lista que já está na tela?
 *
 * É o que separa "primeira carga" de "releitura". Trocar o filtro em memória
 * por consulta ao banco piorou a percepção: com o esqueleto ligado a cada
 * tecla, os cartões somem e voltam a cada busca. Enquanto a resposta nova não
 * chega, a antiga continua na tela — e a região viva diz que está atualizando.
 */
export function estaRelendo({ carregando = false, posts = null } = {}) {
  return carregando === true && Array.isArray(posts) && posts.length > 0;
}

/**
 * A situação da listagem inteira, a partir do que ela sabe.
 *
 * Mora aqui, e não no componente, porque a ORDEM dos ramos é regra e não
 * detalhe de escrita: erro conferido DEPOIS de lista vazia faria uma queda de
 * conexão aparecer como "ainda não há artigos" — a tela dizendo que o blog
 * está vazio quando o que houve foi falha de rede. Dentro de um ternário de JSX
 * isso só poderia ser conferido por leitura; aqui é uma entrada de tabela que a
 * verificação executa.
 *
 * E o esqueleto só aparece quando não há o que mostrar: releitura mantém os
 * cartões.
 */
export function situacaoDaLista({
  carregando = false,
  erro = null,
  posts = null,
  termo = "",
  categoria = CATEGORIA_TODOS,
} = {}) {
  const lista = Array.isArray(posts) ? posts : [];
  if (carregando) return lista.length > 0 ? LISTA_PRONTA : LISTA_CARREGANDO;
  if (erro !== null && erro !== undefined) return situacaoDoErroDaLista(erro);
  if (lista.length > 0) return LISTA_PRONTA;
  return haFiltroAtivo({ termo, categoria }) ? LISTA_SEM_RESULTADO : LISTA_VAZIA;
}

/**
 * O que houve e o que fazer, por situação sem cartão — mais se vale oferecer
 * repetir e se vale oferecer limpar.
 *
 * Repetir só aparece onde repetir pode dar certo: um blog sem artigo nenhum não
 * ganha artigos por insistência, e ambiente sem configuração continua sem
 * configuração no segundo clique. Limpar só aparece onde alguém causou o vazio:
 * mandar "limpar os filtros" para quem chegou num blog sem nenhum artigo é
 * oferecer desfazer uma coisa que a pessoa não fez.
 */
const FALAS_DA_LISTA = Object.freeze({
  [LISTA_VAZIA]: Object.freeze({
    oQueHouve: "Nenhum artigo publicado ainda",
    oQueFazer:
      "Os artigos aparecem aqui assim que forem publicados. Volte em breve.",
    repetir: false,
    limpar: false,
  }),
  [LISTA_SEM_RESULTADO]: Object.freeze({
    oQueHouve: "Nenhum artigo encontrado",
    oQueFazer:
      "Nenhum artigo corresponde ao que você pediu. Tente outras palavras ou volte a ver todos.",
    repetir: false,
    limpar: true,
  }),
  [LISTA_FALHA]: Object.freeze({
    oQueHouve: "Não deu para carregar os artigos",
    oQueFazer: "Confira a conexão e tente carregar de novo.",
    repetir: true,
    limpar: false,
  }),
  [LISTA_FALHA_PERMANENTE]: Object.freeze({
    oQueHouve: "Os artigos não puderam ser carregados",
    oQueFazer:
      "Não é a sua conexão, e tentar de novo não resolve. Volte mais tarde — já estamos sabendo.",
    repetir: false,
    limpar: false,
  }),
});

/**
 * A fala de uma situação da listagem. Lança para situação fora da lista
 * fechada: situação desconhecida é erro de programação, e devolver um objeto
 * neutro produziria a página em branco que esta story existe para impedir.
 */
export function falaDaLista(situacao) {
  if (!Object.hasOwn(FALAS_DA_LISTA, situacao)) {
    throw new Error(
      `Situação de listagem desconhecida: ${JSON.stringify(situacao)}. ` +
        `A lista é fechada — os únicos valores são: ${SITUACOES_SEM_CARTAO.join(", ")}.`,
    );
  }
  return FALAS_DA_LISTA[situacao];
}

/** O que a região viva anuncia enquanto a listagem carrega pela primeira vez. */
export const TEXTO_DE_CARREGANDO_A_LISTA = "Carregando os artigos do blog.";

/** E o que ela anuncia enquanto RELÊ, com os cartões antigos ainda na tela. */
export const TEXTO_DE_ATUALIZANDO_A_LISTA = "Atualizando a lista de artigos.";

/**
 * Quantos artigos a lista tem agora, dito em voz alta.
 *
 * Sem isto, quem usa leitor de tela digita na busca e a grade muda em SILÊNCIO:
 * não há foco a mover nem texto novo a anunciar, e a única pista é visual.
 * O singular existe porque "1 artigos" é o tipo de detalhe que denuncia que
 * ninguém leu a frase em voz alta.
 */
export function anuncioDaLista(quantidade) {
  const n = Number(quantidade);
  if (!Number.isFinite(n) || n <= 0) return "Nenhum artigo encontrado.";
  if (n === 1) return "1 artigo encontrado.";
  return `${formatarNumero(Math.floor(n))} artigos encontrados.`;
}

/** O rótulo do que tenta a leitura outra vez. */
export const ROTULO_DE_RECARREGAR_A_LISTA = "Tentar carregar os artigos de novo";

/** O rótulo do desfazer do vazio de busca. */
export const ROTULO_DE_LIMPAR_FILTROS = "Limpar a busca e ver todos os artigos";

/** O rótulo da paginação. Diz o que fará, não só "mais". */
export const ROTULO_DE_CARREGAR_MAIS = "Carregar mais artigos";

/** O aviso de que o filtro por Categoria não pôde ser montado. */
export const FALHA_DAS_CATEGORIAS =
  "Não deu para carregar as categorias. Recarregue a página para filtrar por " +
  "categoria — a busca por texto continua funcionando.";

/* ─── As situações do artigo ─────────────────────────────────────────────── */

export const ARTIGO_CARREGANDO = "artigo-carregando";
export const ARTIGO_PRONTO = "artigo-pronto";
/**
 * Ausência. É também o que um Post não publicado devolve — e a
 * indistinguibilidade é a garantia, não um efeito colateral: distinguir os dois
 * entregaria a existência do rascunho a quem não pode vê-lo.
 */
export const ARTIGO_AUSENTE = "artigo-ausente";
export const ARTIGO_FALHA = "artigo-falha";
/** Falha que repetir NÃO resolve: ambiente mal configurado, defeito inesperado. */
export const ARTIGO_FALHA_PERMANENTE = "artigo-falha-permanente";

export const SITUACOES_SEM_ARTIGO = Object.freeze([
  ARTIGO_AUSENTE,
  ARTIGO_FALHA,
  ARTIGO_FALHA_PERMANENTE,
]);

/**
 * O erro tipado da camada vira a situação da tela.
 *
 * Leitura por lista de PERMISSÃO: só tipo conhecido escolhe situação, e o
 * desconhecido cai na falha permanente — a única que não promete nada.
 *
 * `permissao` cai em AUSÊNCIA de propósito, e não numa tela própria: no site
 * público não existe "entre de novo", e uma tela que dissesse "sua sessão não
 * permite" sobre `/blog/:slug` estaria confirmando que existe algo ali para
 * quem tivesse sessão — que é exatamente a informação que a ausência esconde.
 */
export function situacaoDoErroDoArtigo(erro) {
  const tipo = erro?.tipo;
  if (tipo === ERRO_NAO_ENCONTRADO) return ARTIGO_AUSENTE;
  if (tipo === ERRO_PERMISSAO) return ARTIGO_AUSENTE;
  if (tipo === ERRO_REDE) return ARTIGO_FALHA;
  if (tipo === ERRO_CONFIGURACAO) return ARTIGO_FALHA_PERMANENTE;
  return ARTIGO_FALHA_PERMANENTE;
}

/**
 * A situação do artigo inteiro.
 *
 * **`slugValido` vem antes de `carregando`, e é isso que a função existe para
 * fixar.** Um endereço fora do formato que chega por NAVEGAÇÃO — sem desmontar
 * a tela — encontra `carregando` ainda ligado do endereço anterior: com a ordem
 * invertida, a tela desenha o esqueleto de uma leitura que nunca vai sair, e o
 * quadro em que isso acontece é curto demais para um teste de DOM pegar.
 */
export function situacaoDoArtigo({
  slugValido = false,
  carregando = false,
  erro = null,
  post = null,
} = {}) {
  if (!slugValido) return ARTIGO_AUSENTE;
  if (carregando) return ARTIGO_CARREGANDO;
  if (erro !== null && erro !== undefined) return situacaoDoErroDoArtigo(erro);
  return post === null || post === undefined ? ARTIGO_AUSENTE : ARTIGO_PRONTO;
}

/**
 * A tela do artigo nasce esperando resposta?
 *
 * Só quando há o que esperar. Slug fora do formato não produz pedido nenhum, e
 * anunciar "abrindo…" para algo que nunca vai abrir é a tela mentindo sobre o
 * que está fazendo. O contrário também engana: nascer `false` com um slug
 * válido faz o primeiro quadro dizer "artigo não encontrado" sobre um artigo
 * que está sendo lido naquele instante.
 */
export function nasceCarregandoOArtigo(slugValido) {
  return slugValido === true;
}

const FALAS_DO_ARTIGO = Object.freeze({
  [ARTIGO_AUSENTE]: Object.freeze({
    oQueHouve: "Artigo não encontrado",
    oQueFazer:
      "O artigo que você procura não existe, ou o endereço veio errado. Veja os artigos publicados.",
    repetir: false,
  }),
  [ARTIGO_FALHA]: Object.freeze({
    oQueHouve: "Não deu para carregar o artigo",
    oQueFazer: "Confira a conexão e tente carregar de novo.",
    repetir: true,
  }),
  [ARTIGO_FALHA_PERMANENTE]: Object.freeze({
    oQueHouve: "O artigo não pôde ser carregado",
    oQueFazer:
      "Não é a sua conexão, e tentar de novo não resolve. Volte para o blog e tente mais tarde.",
    repetir: false,
  }),
});

/** A fala de uma situação do artigo. Lança para situação fora da lista fechada. */
export function falaDoArtigo(situacao) {
  if (!Object.hasOwn(FALAS_DO_ARTIGO, situacao)) {
    throw new Error(
      `Situação de artigo desconhecida: ${JSON.stringify(situacao)}. ` +
        `A lista é fechada — os únicos valores são: ${SITUACOES_SEM_ARTIGO.join(", ")}.`,
    );
  }
  return FALAS_DO_ARTIGO[situacao];
}

/** O que a região viva anuncia enquanto o artigo carrega. */
export const TEXTO_DE_CARREGANDO_O_ARTIGO = "Carregando o artigo.";

/** O rótulo do que tenta a leitura do artigo outra vez. */
export const ROTULO_DE_RECARREGAR_O_ARTIGO = "Tentar carregar o artigo de novo";

/** O rótulo da volta para a listagem. Diz para onde vai, não só que volta. */
export const ROTULO_DE_VOLTAR_AO_BLOG = "Ver todos os artigos";

/** O que o artigo diz quando o Post não tem corpo gravado nenhum. */
export const ARTIGO_SEM_CONTEUDO =
  "Este artigo ainda não tem conteúdo publicado.";

/* ─── A falha que a tela inventa quando a camada lança ───────────────────── */

/**
 * O erro tipado de uma exceção que escapou da camada.
 *
 * ─── POR QUE A MENSAGEM NÃO É A DA EXCEÇÃO ──────────────────────────────────
 *
 * A tela mostra `mensagem` para o visitante. Pôr `String(excecao.message)` ali
 * publica texto de exceção de JavaScript — nome de módulo, sintaxe, às vezes
 * endereço — numa página de site institucional. A frase que sai é a mesma que a
 * camada usaria para o mesmo tipo, lida de `MENSAGENS_DE_LEITURA`, e o texto
 * cru vai para `detalhe`, que NENHUMA das duas telas renderiza — ele existe
 * para o console de quem for depurar.
 *
 * Ela mora aqui, e não em cada tela, porque é a mesma regra nas duas: a segunda
 * cópia é a que esquece de tirar o texto cru.
 */
export function falhaDeExcecao(excecao) {
  return {
    tipo: ERRO_INESPERADO,
    mensagem: MENSAGENS_DE_LEITURA[ERRO_INESPERADO],
    detalhe: String(excecao?.message ?? excecao),
  };
}

/* ─── O que a tela lê de um Post ─────────────────────────────────────────── */

/**
 * O nome da Categoria embutida, ou `""` quando o Post não tem uma.
 *
 * Categoria é NULÁVEL — a gaveta do Painel não a exige —, e um Post sem
 * Categoria precisa aparecer na lista e abrir sem quebrar. Devolver `""` é o
 * que permite a quem chama omitir a pastilha em vez de desenhar "undefined".
 */
export function nomeDaCategoria(post) {
  const nome = post?.categoria?.nome;
  return typeof nome === "string" ? nome.trim() : "";
}

/** O identificador da Categoria embutida, ou `null`. */
export function idDaCategoria(post) {
  const id = post?.categoria?.id ?? post?.categoria_id ?? null;
  const alvo = typeof id === "string" ? id.trim() : "";
  return alvo === "" ? null : alvo;
}

/** O nome do Autor gravado, ou `""`. O Post nunca inventa um. */
export function nomeDoAutor(post) {
  const nome = post?.autor_nome;
  return typeof nome === "string" ? nome.trim() : "";
}

/**
 * `14/08/2026` — o dia da publicação, no fuso do negócio.
 *
 * O instante é `publicado_em`, e só ele: `atualizado_em` responde outra
 * pergunta, e mostrá-lo como data de publicação faria um artigo antigo parecer
 * novo toda vez que alguém corrigisse uma vírgula. `""` quando não há data —
 * caso que a política de visibilidade torna raro, não impossível.
 */
export function textoDaData(post) {
  const bruto = post?.publicado_em;
  if (typeof bruto !== "string" || bruto.trim() === "") return "";
  try {
    return formatarData(bruto);
  } catch {
    return "";
  }
}

/**
 * `8 min de leitura` — o tempo por extenso, a partir do número gravado.
 *
 * O armazenamento no navegador guardava a frase pronta; o banco guarda
 * `tempo_leitura`, que é um número de minutos. A palavra é escrita AQUI, uma
 * vez, e o número passa pela formatação brasileira como todo número da
 * interface. `""` quando o Post não declara tempo — e a tela omite a linha em
 * vez de mostrar "0 min".
 */
export function textoDoTempoDeLeitura(post) {
  const minutos = Number(post?.tempo_leitura);
  if (!Number.isFinite(minutos) || minutos <= 0) return "";
  try {
    return `${formatarNumero(Math.floor(minutos))} min de leitura`;
  } catch {
    return "";
  }
}

/** O HTML GRAVADO do artigo, ou `""`. Nada aqui deriva HTML de documento. */
export function htmlGravado(post) {
  const html = post?.conteudo_html;
  return typeof html === "string" ? html : "";
}

/**
 * O nome acessível do cartão de um Post: diz o que fará e NOMEIA o artigo.
 *
 * Numa grade de doze cartões, doze links chamados "Ler" são doze links
 * indistinguíveis para quem navega por leitor de tela.
 */
export function rotuloDoCartao(post) {
  const titulo = String(post?.titulo ?? "").trim();
  return titulo === "" ? "Ler o artigo sem título" : `Ler o artigo ${titulo}`;
}
