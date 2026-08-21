/**
 * A seção de SEO da gaveta, do lado da tela: o contador que sinaliza, e as
 * frases que contam ao Autor o que será herdado.
 *
 * Vive fora do componente pela convenção do projeto — arquivo de componente que
 * exporta função perde a recarga rápida e o lint cobra —, e porque é isto que
 * torna "o contador não bloqueia" e "a tela mostra o que será herdado" regras
 * EXECUTÁVEIS: a verificação importa estas funções e as chama, em vez de
 * procurar um trecho de JSX com uma expressão regular.
 *
 * ─── ESTE MÓDULO NÃO DECIDE HERANÇA NENHUMA ─────────────────────────────────
 *
 * Quem decide o que um Post declara é `metadadosDoPost`, em
 * `domain/blog/compartilhamento.js`, e é ela que `herancaDoFormulario` chama.
 * Um `valores.seo_titulo || valores.titulo` escrito aqui seria a segunda
 * opinião que o épico proíbe (AD-20): a Prévia da Story 3.5 e o emissor de
 * metadado do Épico 4 leriam a decisão de lá, a gaveta a de cá, e as duas
 * divergiriam no primeiro campo novo — que é exatamente o defeito que a Prévia
 * existe para não ter. `verificar:interface` varre o projeto atrás disso.
 *
 * ─── DOIS NÚMEROS, DOIS TRABALHOS, E SÓ UM MORA AQUI ────────────────────────
 *
 * O contador desta tela conhece o comprimento USUAL, e só ele. Ele **sinaliza**
 * o excesso e não faz mais nada: não bloqueia o salvamento, não corta o texto e
 * não vira `maxLength` no controle — é a decisão que a Story 3.1 já tinha
 * tomado para a descrição da imagem, e o motivo está escrito lá: um campo que
 * simplesmente PARA de aceitar texto no caractere 60 faz quem colou um título
 * pronto perder o resto sem aviso.
 *
 * O teto de HIGIENE — o número que recusa — não é assunto desta tela: ele vem
 * do domínio, o servidor o cobra e o banco o impõe.
 */

import {
  COMPRIMENTO_USUAL_DE_SEO,
  DEFEITO_DE_DOMINIO_AUSENTE,
  ROTULOS_DE_SEO,
  caracteresDe,
  metadadosDoPost,
} from "@/domain/blog/compartilhamento";

/* ─── O contador ───────────────────────────────────────────────────────────
 *
 * "Dados em pilha monoespaçada com numeral tabular" é regra do épico para
 * contador de caractere, como para data e slug — quem desenha isso é a gaveta,
 * com a classe `dado`. O que mora aqui é o NÚMERO e o julgamento.
 */

/**
 * Quantos caracteres o texto tem, aparado nas pontas — como o que é gravado.
 *
 * A contagem é por PONTO DE CÓDIGO, e vem do domínio: um contador que usasse
 * `.length` diria 320 para 160 emojis, e o número na tela não bateria nem com
 * o que a porta cobra nem com o que a restrição do banco conta.
 */
export function comprimentoDoTexto(valor) {
  return caracteresDe(String(valor ?? "").trim());
}

/**
 * O contador em texto: `"62 / 60"`.
 *
 * Os DOIS números aparecem, e não só o que falta: "faltam -2" é uma conta que
 * a pessoa precisa fazer de cabeça, e o segundo número é o que dá sentido ao
 * primeiro. Campo fora do vocabulário devolve `""` em vez de lançar, pela mesma
 * razão de `falaDoEnvio`: uma exceção aqui derrubaria a gaveta inteira por
 * causa de um rótulo.
 */
export function textoDoContador(campo, valor) {
  const usual = COMPRIMENTO_USUAL_DE_SEO[campo];
  if (usual === undefined) return "";
  return `${comprimentoDoTexto(valor)} / ${usual}`;
}

/** Passou do comprimento usual? Só isso — o julgamento não é uma recusa. */
export function acimaDoUsual(campo, valor) {
  const usual = COMPRIMENTO_USUAL_DE_SEO[campo];
  if (usual === undefined) return false;
  return comprimentoDoTexto(valor) > usual;
}

/**
 * O que se diz quando o texto passa do usual — e a frase diz que DÁ PARA
 * SALVAR.
 *
 * Uma frase que só apontasse o excesso seria lida como recusa, e o Autor
 * encurtaria um título que ele escolheu de propósito. O número usual é conselho
 * de quem EXIBE o resultado: o buscador corta na exibição e não penaliza nada.
 *
 * Devolve `null` quando não há excesso — quem chama não precisa perguntar duas
 * vezes.
 */
export function avisoDeComprimento(campo, valor) {
  if (!acimaDoUsual(campo, valor)) return null;
  const usual = COMPRIMENTO_USUAL_DE_SEO[campo];
  return (
    `Acima dos ${usual} caracteres que os buscadores costumam exibir — o texto ` +
    "aparece cortado no resultado. Dá para salvar assim mesmo."
  );
}

/* ─── A herança, mostrada antes de acontecer ──────────────────────────────── */

/**
 * O Post, na forma que `metadadosDoPost` lê, montado a partir dos valores da
 * gaveta.
 *
 * A gaveta tem valores de FORMULÁRIO (tudo texto, nada nulo) e o domínio fala
 * de linha de `posts`. A tradução é uma só, aqui, e é o que permite a tela
 * mostrar a herança do que está sendo digitado AGORA — e não a do que está
 * gravado, que é o que a pessoa está justamente mudando.
 */
export function postDosValores(valores) {
  const v = valores ?? {};
  const texto = (nome) => {
    const bruto = String(v[nome] ?? "").trim();
    return bruto === "" ? null : bruto;
  };
  return {
    titulo: texto("titulo"),
    resumo: texto("resumo"),
    imagem_url: texto("imagem_url"),
    imagem_alt: texto("imagem_alt"),
    seo_titulo: texto("seo_titulo"),
    seo_descricao: texto("seo_descricao"),
    seo_imagem_url: texto("seo_imagem_url"),
  };
}

/**
 * A herança do que está no formulário — ou o defeito de montagem, NOMEADO.
 *
 * Devolve `{ ok: true, metadados }` ou `{ ok: false, defeito }`.
 *
 * ─── POR QUE O DEFEITO É DEVOLVIDO, E NÃO ENGOLIDO NEM PROPAGADO ───────────
 *
 * `metadadosDoPost` LANÇA quando o Domínio Canônico não chega, e a decisão dela
 * é certa: endereço relativo produziria uma prévia que o rastreador não
 * resolve. Mas propagar a exceção daqui derrubaria a gaveta inteira — com o
 * Título, o Resumo e o conteúdo do Post junto — por causa de uma seção; e
 * engoli-la mostraria uma seção em branco, que é o silêncio que este projeto
 * proíbe.
 *
 * O que a tela faz com `defeito` é DESENHÁ-LO. Ele é a frase do domínio, que
 * diz que a variável de ambiente não foi lida — quem a lê sabe que é defeito de
 * montagem, e não erro de quem escreve o Post.
 */
export function herancaDoFormulario(valores, { dominio } = {}) {
  try {
    return { ok: true, metadados: metadadosDoPost(postDosValores(valores), { dominio }) };
  } catch (erro) {
    /* SÓ O DEFEITO ESPERADO É DESENHADO. A versão anterior engolia QUALQUER
       exceção e a pintava na caixa vermelha do defeito de montagem: um
       `TypeError` de bug real — uma propriedade lida de `undefined` dentro do
       domínio — virava uma frase indistinguível de "faltou a variável de
       ambiente", e quem lesse a tela procuraria o defeito no lugar errado. Um
       `catch` que responde por dois fatos diferentes é o mesmo silêncio que a
       família de recusas deste projeto existe para não ter.

       O reconhecimento é por IGUALDADE com a frase que o domínio declara, e
       não por contenção: uma mensagem qualquer que por acaso citasse "domínio"
       voltaria a ser confundida. O resto SOBE — e o limite de erro do Painel,
       que existe desde a Story 2.7, é quem o mostra. */
    const mensagem = String(erro?.message ?? erro);
    if (mensagem === DEFEITO_DE_DOMINIO_AUSENTE) {
      return { ok: false, defeito: mensagem };
    }
    throw erro;
  }
}

/**
 * A frase que conta de onde cada valor virá, para um campo VAZIO.
 *
 * Ela é montada a partir do que `metadadosDoPost` decidiu — `origem` e `valor`
 * —, e nunca a partir dos valores do formulário: é isso que faz a tela mostrar
 * o que vai acontecer de verdade em vez de uma segunda adivinhação.
 *
 * Três frases, porque são três fatos diferentes:
 *
 *   o campo tem valor próprio  → `null`: não há herança a contar;
 *   o campo herda algo         → o nome da fonte, e o valor entre aspas;
 *   não há o que herdar        → a ausência, dita — "a descrição fica ausente,
 *                                 não vazia", que é o critério, e inventar
 *                                 texto seria o contrário dele.
 */
/*
 * ─── O CONTRATO DESTA FUNÇÃO É `origem`, E SÓ ELE ────────────────────────
 *
 * Ela recebe QUALQUER uma das três partes de `metadadosDoPost` — `titulo`,
 * `descricao` ou `imagem` —, e as três têm formas diferentes: as duas de texto
 * trazem `valor`, e a da imagem traz `endereco`, `largura`, `tipo` e mais. O
 * único campo que as três compartilham, e o único que esta função lê para
 * decidir, é `origem`.
 *
 * A versão anterior perguntava por `parte.valor` e, para a imagem, recebia
 * `undefined` — então ela caía na frase sem valor POR ACIDENTE. Renomear
 * `endereco` para `valor` no domínio faria a tela passar a imprimir a URL crua
 * dentro das aspas, e nada teria mudado de propósito. Agora quem decide se o
 * valor aparece é a TABELA, por origem: um título e um resumo são texto que a
 * pessoa reconhece; um endereço de arquivo não é informação para ninguém.
 */
const FONTES_POR_ORIGEM = Object.freeze({
  titulo: Object.freeze({ nome: "o título do post", mostraValor: true }),
  resumo: Object.freeze({ nome: "o resumo", mostraValor: true }),
  capa: Object.freeze({ nome: "a imagem de capa", mostraValor: false }),
  padrao: Object.freeze({ nome: "a imagem padrão do site", mostraValor: false }),
});

export function falaDaHeranca(parte) {
  if (parte === null || parte === undefined) return null;
  if (parte.origem === "compartilhamento") return null;
  const fonte = FONTES_POR_ORIGEM[parte.origem];
  if (fonte === undefined) {
    return "Vazio, e não há o que herdar: este metadado fica ausente.";
  }
  const valor = fonte.mostraValor && typeof parte.valor === "string" ? parte.valor : null;
  return valor === null ? `Herda ${fonte.nome}.` : `Herda ${fonte.nome}: “${valor}”`;
}

/**
 * Por que o valor deste campo NÃO foi aproveitado — a frase do domínio.
 *
 * ─── O ELO RECUSADO PRECISA DIZER POR QUÊ ─────────────────────────────────
 *
 * `metadadosDoPost` já devolve `recusadas: [{campo, origem, motivo}]`, e até
 * aqui o único consumidor calculava a lista e a jogava fora. O caso que isso
 * escondia é real e silencioso: uma Imagem de Compartilhamento cujo endereço o
 * vocabulário de esquema ACEITA — então nenhuma recusa de formulário aparece —
 * mas cuja espécie está fora da prévia (`.gif`, `.svg`, WebP) mostra a
 * miniatura normalmente, cai para a capa, e o Autor não recebe uma palavra
 * sobre por que a imagem que ele escolheu não vai ser usada.
 *
 * É o mesmo silêncio que o cabeçalho de `herdarTexto` diz existir para não ter,
 * e a frase já estava pronta: o que faltava era desenhá-la.
 */
export function recusaDaCadeia(metadados, campo) {
  const recusadas = metadados?.recusadas;
  if (!Array.isArray(recusadas)) return null;
  const daqui = recusadas.find((r) => r?.campo === campo);
  return typeof daqui?.motivo === "string" ? daqui.motivo : null;
}

/** O rótulo de cada campo, do DOMÍNIO — a gaveta não inventa nome de campo. */
export { ROTULOS_DE_SEO };
