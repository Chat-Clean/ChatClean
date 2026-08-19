/**
 * As regras puras da pré-visualização de Post (Story 2.13).
 *
 * Mesma razão de `acoes.js`, `listagem.js` e `gaveta.js` existirem: função pura
 * em arquivo de componente quebra a recarga rápida e o lint cobra. O ganho é o
 * de sempre — a verificação **executa** estas funções, e "a tela diz o que
 * houve e o que fazer" deixa de ser uma frase sobre JSX e vira regra provada.
 *
 * Os ENDEREÇOS não moram aqui: eles são vocabulário compartilhado com a
 * listagem, com o Editor e com a declaração de rotas, e vivem em `rotas.js`.
 *
 * ─── `noindex` EM DUAS CAMADAS, E A PRIMEIRA NÃO É JAVASCRIPT ───────────────
 *
 * A reescrita apanha-tudo da entrega serve o mesmo `index.html` para toda rota,
 * e ele diz `index, follow`. Um rastreador que não executa JavaScript lê
 * exatamente isso. O cabeçalho de resposta (`vercel.json`) é a camada que
 * responde antes de o JavaScript existir; `aplicarNoindex` é a segunda voz
 * dizendo o mesmo, dentro do documento — nunca a primeira.
 */

import {
  ERRO_CONFIGURACAO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
} from "@/data/blog/resultado";

/* ─── As situações da tela ───────────────────────────────────────────────── */

export const SITUACAO_CARREGANDO = "carregando";
export const SITUACAO_PRONTA = "pronta";
export const SITUACAO_AUSENTE = "ausente";
export const SITUACAO_SEM_PERMISSAO = "sem-permissao";
export const SITUACAO_FALHA = "falha";
/**
 * Falha que repetir NÃO resolve: ambiente mal configurado, defeito inesperado.
 *
 * Ela é separada de `falha` porque as duas pedem coisas diferentes de quem está
 * olhando. Rede fora pede insistir; ambiente sem variável e defeito de
 * programação pedem outra pessoa. Oferecer "tentar de novo" para as duas é
 * ensinar a apertar um botão que não resolve — e a frase que culpa a conexão
 * manda procurar o problema no lugar errado.
 */
export const SITUACAO_FALHA_PERMANENTE = "falha-permanente";

/**
 * As situações em que a tela NÃO mostra o artigo. Lista fechada: uma situação
 * nova só entra editando este arquivo, e nunca vira tela em branco.
 */
export const SITUACOES_SEM_ARTIGO = Object.freeze([
  SITUACAO_AUSENTE,
  SITUACAO_SEM_PERMISSAO,
  SITUACAO_FALHA,
  SITUACAO_FALHA_PERMANENTE,
]);

/**
 * O erro tipado da camada vira a situação da tela.
 *
 * Ausência, permissão, falha que passa e falha que fica são coisas DIFERENTES
 * para quem está olhando: uma diz que o Post não existe, outra que a sessão
 * acabou, a terceira que a rede falhou e vale tentar de novo, a quarta que
 * insistir não vai adiantar. Colapsá-las é o mesmo defeito de confundir erro
 * com vazio na listagem.
 *
 * A leitura é por lista de PERMISSÃO: só tipo conhecido escolhe situação, e o
 * desconhecido cai na falha permanente — a única que não promete nada.
 */
export function situacaoDoErro(erro) {
  const tipo = erro?.tipo;
  if (tipo === ERRO_NAO_ENCONTRADO) return SITUACAO_AUSENTE;
  if (tipo === ERRO_PERMISSAO) return SITUACAO_SEM_PERMISSAO;
  if (tipo === ERRO_REDE) return SITUACAO_FALHA;
  if (tipo === ERRO_CONFIGURACAO) return SITUACAO_FALHA_PERMANENTE;
  return SITUACAO_FALHA_PERMANENTE;
}

/**
 * O que houve e o que fazer, por situação — mais se vale oferecer repetir.
 *
 * Repetir só aparece onde repetir pode dar certo: um Post que não existe não
 * passa a existir por insistência, uma sessão encerrada não volta por recarregar
 * a leitura, e ambiente sem configuração continua sem configuração no segundo
 * clique.
 */
const FALAS = Object.freeze({
  [SITUACAO_AUSENTE]: Object.freeze({
    oQueHouve: "Este post não existe",
    oQueFazer:
      "Ele pode ter sido excluído, ou o endereço veio errado. Volte para a listagem e abra o post por lá.",
    repetir: false,
  }),
  [SITUACAO_SEM_PERMISSAO]: Object.freeze({
    oQueHouve: "Sua sessão não permite abrir este post",
    oQueFazer: "Entre de novo no Painel e abra a pré-visualização outra vez.",
    repetir: false,
  }),
  [SITUACAO_FALHA]: Object.freeze({
    oQueHouve: "Não deu para abrir a pré-visualização",
    oQueFazer: "Confira a conexão e tente carregar de novo.",
    repetir: true,
  }),
  [SITUACAO_FALHA_PERMANENTE]: Object.freeze({
    oQueHouve: "A pré-visualização não pôde ser aberta",
    oQueFazer:
      "Não é a sua conexão, e tentar de novo não resolve. Avise quem cuida do site e mostre o detalhe do erro.",
    repetir: false,
  }),
});

/**
 * A tela nasce esperando resposta?
 *
 * Só quando há o que esperar. Identificador fora do formato não produz pedido
 * nenhum, e anunciar "abrindo…" para algo que nunca vai abrir é a tela mentindo
 * sobre o que está fazendo. O contrário também engana: nascer `false` com um
 * identificador válido faz o primeiro quadro dizer "este post não existe" sobre
 * um Post que está sendo lido naquele instante.
 *
 * É uma função, e não um literal dentro de `useState`, pelo mesmo motivo da
 * ordem dos ramos: o quadro em que o engano aparece é curto demais para um teste
 * de DOM pegar — o `act` do React descarrega o efeito antes de a tela ser lida.
 * Aqui é uma linha que a verificação executa.
 */
export function nasceCarregando(valido) {
  return valido === true;
}

/**
 * A situação da tela inteira, a partir do que ela sabe.
 *
 * Mora aqui, e não no componente, porque a ORDEM dos ramos é uma regra e não um
 * detalhe de escrita — e regra que vive dentro de um ternário de JSX só pode ser
 * conferida por leitura.
 *
 * **`valido` vem antes de `carregando`, e é isso que a função existe para
 * fixar.** Um identificador ruim que chega por NAVEGAÇÃO — sem desmontar a tela
 * — encontra `carregando` ainda `true` do endereço anterior: com a ordem
 * invertida, a tela desenha o esqueleto de uma leitura que nunca vai sair, e o
 * quadro em que isso acontece é curto demais para qualquer teste de DOM pegar.
 * Aqui a combinação é só mais uma entrada de tabela.
 */
export function situacaoDaTela({
  valido = false,
  carregando = false,
  erro = null,
  post = null,
} = {}) {
  if (!valido) return SITUACAO_AUSENTE;
  if (carregando) return SITUACAO_CARREGANDO;
  if (erro !== null && erro !== undefined) return situacaoDoErro(erro);
  return post === null || post === undefined ? SITUACAO_AUSENTE : SITUACAO_PRONTA;
}

/**
 * A fala de uma situação. Lança para situação fora da lista fechada: situação
 * desconhecida é erro de programação, e devolver um objeto neutro produziria a
 * tela em branco que esta story existe para impedir.
 */
export function falaDaSituacao(situacao) {
  if (!Object.hasOwn(FALAS, situacao)) {
    throw new Error(
      `Situação de pré-visualização desconhecida: ${JSON.stringify(situacao)}. ` +
        `A lista é fechada — os únicos valores são: ${SITUACOES_SEM_ARTIGO.join(", ")}.`,
    );
  }
  return FALAS[situacao];
}

/* ─── As frases da tela ──────────────────────────────────────────────────── */

/** O que a região viva anuncia enquanto a leitura corre. */
export const TEXTO_DE_CARREGANDO = "Abrindo a pré-visualização do post.";

/** O rótulo da volta. Ela diz para onde vai, não só que volta. */
export const ROTULO_DE_VOLTAR = "Voltar para a listagem de posts";

/** O rótulo do que tenta a leitura outra vez. */
export const ROTULO_DE_REPETIR = "Tentar abrir a pré-visualização de novo";

/**
 * O detalhe da ausência quando o endereço nem traz um identificador utilizável.
 *
 * É a diferença entre "procuramos e não achamos" e "não havia o que procurar" —
 * e ela importa porque no segundo caso NENHUM pedido saiu para a rede. Vale
 * também para o endereço desconhecido do Painel, que cai na mesma tela.
 */
export const DETALHE_DE_IDENTIFICADOR_INVALIDO =
  "O endereço aberto não traz um identificador de post válido.";

/** O aviso permanente de que isto não é o site: é uma prévia sob o Painel. */
export const AVISO_DA_PREVIA =
  "Pré-visualização: só quem tem sessão no Painel enxerga esta página.";

/**
 * O aviso de que o Autor está vendo a versão GRAVADA, e não a que ele acabou de
 * escrever.
 *
 * A prévia lê do banco. Quem a abre com alterações pendentes no Editor confere
 * um texto que não é o que está na tela dele — e conclui que o que escreveu não
 * pegou, ou pior, que pegou. O aviso existe para essa confusão não acontecer em
 * silêncio.
 */
export const AVISO_DE_PENDENCIA =
  "Você tem alterações não salvas no Editor. A pré-visualização mostra a última versão gravada.";

/** O título da tela, para o cabeçalho e para o nome acessível da região. */
export const TITULO_DA_TELA = "Pré-visualização do post";

/** O que a tela diz quando o Post não tem corpo nenhum gravado ainda. */
export const ARTIGO_VAZIO =
  "Este post ainda não tem conteúdo gravado. Escreva no Editor e salve para ver o texto aqui.";

/* ─── O fundo sobre o qual o artigo é mostrado ───────────────────────────── */

/**
 * O token do fundo do artigo, e a classe que o aplica.
 *
 * "O que se vê é o que sairá" não vale só para o texto: o par TEXTO/FUNDO é o
 * que decide contraste, e é o motivo de `.artigo` ser global. A raiz da prévia
 * é do Painel, e `--background` resolve valor DIFERENTE dentro e fora de
 * `.painel` — pintar o artigo com ele o mostraria sobre um fundo que o site
 * nunca usa. `--surface` é nome de marca declarado em `:root` e que `.painel`
 * não toca: resolve o mesmo literal nos dois escopos, que é exatamente a
 * propriedade de que a promessa depende.
 *
 * Os dois nomes vivem aqui porque a verificação precisa dos dois: a classe para
 * conferir o que a tela veste, o token para resolver o par e medir o contraste.
 */
export const TOKEN_DO_FUNDO_DO_ARTIGO = "--surface";
export const CLASSE_DO_FUNDO_DO_ARTIGO = "bg-surface";

/* ─── O `noindex` em tempo de execução ───────────────────────────────────── */

/** O nome da diretiva, escrito uma vez — o documento e a entrega o leem daqui. */
export const NOME_DA_DIRETIVA_DE_ROBOS = "robots";

/**
 * O nome do cabeçalho de resposta que declara a mesma coisa antes do
 * JavaScript. É a FONTE ÚNICA do nome: `verificar:acesso` compara o que está em
 * `vercel.json` com esta constante, de modo que renomeá-la sem renomear lá
 * derruba a verificação em vez de apagar a garantia em silêncio.
 */
export const CABECALHO_DE_ROBOS = "X-Robots-Tag";

/** O valor da diretiva. Um só, para as duas camadas não divergirem. */
export const VALOR_DE_NOINDEX = "noindex, nofollow";

/**
 * Declara `noindex` no documento e devolve como desfazer.
 *
 * **É a SEGUNDA camada, nunca a primeira.** O `index.html` do projeto declara
 * `index, follow` e é servido para toda rota pela reescrita apanha-tudo: quem
 * não executa JavaScript lê aquilo, e nada aqui muda isso. Quem responde antes
 * do JavaScript é o cabeçalho `X-Robots-Tag` da entrega.
 *
 * O que esta função faz é reescrever a meta existente em vez de acrescentar uma
 * segunda: duas metas `robots` no mesmo documento é uma contradição que cada
 * rastreador resolve do seu jeito. O valor anterior é guardado e restaurado ao
 * sair — a prévia é uma tela, não uma mudança permanente no documento.
 *
 * **Nada aqui lança.** Ela roda dentro de um efeito, e uma exceção ali derruba a
 * prévia inteira para o limite de erro: a tela que existe para nunca ficar em
 * branco acabaria em branco por causa de uma diretiva de rastreamento.
 * Documento sem `head` — um DOM parcial, um ambiente de teste — devolve um
 * desfazer inerte.
 */
export function aplicarNoindex(documento) {
  const inerte = () => {};
  try {
    if (!documento || typeof documento.querySelector !== "function") return inerte;

    const seletor = `meta[name="${NOME_DA_DIRETIVA_DE_ROBOS}"]`;
    const existente = documento.querySelector(seletor);

    if (existente) {
      const anterior = existente.getAttribute("content");
      existente.setAttribute("content", VALOR_DE_NOINDEX);
      return () => {
        try {
          if (anterior === null) existente.removeAttribute("content");
          else existente.setAttribute("content", anterior);
        } catch {
          /* documento já desmontado: não há o que restaurar */
        }
      };
    }

    const cabeca = documento.head;
    if (!cabeca || typeof cabeca.appendChild !== "function") return inerte;
    if (typeof documento.createElement !== "function") return inerte;

    const meta = documento.createElement("meta");
    meta.setAttribute("name", NOME_DA_DIRETIVA_DE_ROBOS);
    meta.setAttribute("content", VALOR_DE_NOINDEX);
    cabeca.appendChild(meta);
    return () => {
      try {
        meta.remove();
      } catch {
        /* documento já desmontado: não há o que remover */
      }
    };
  } catch {
    return inerte;
  }
}
