/**
 * Os ativos de prévia do site, e a regra de O QUE UM POST DECLARA quando um
 * link dele é compartilhado: título, descrição e imagem.
 *
 * Puro: sem React, sem rede, sem `fetch`, sem cliente, sem `fs`. É a função
 * que a Prévia do Editor (Story 3.5) e a Função de Borda que emite metadado no
 * HTML servido (Épico 4) chamam — **a mesma**. A divergência entre o que o
 * Autor vê na Prévia e o que o rastreador recebe é exatamente o defeito que
 * esta função existe para não ter, e duas implementações da mesma cadeia
 * divergiriam na primeira mudança.
 *
 * ─── UMA CHAMADA, TRÊS CAMPOS (Story 3.4) ─────────────────────────────────
 *
 * `metadadosDoPost` responde pelos três de uma vez. Ela nasceu como
 * `imagemDoPost`, respondendo só pela imagem, e CRESCEU em vez de ganhar duas
 * irmãs: duas funções respondendo "o que este Post declara" divergiriam no dia
 * em que um campo novo aparecesse — ele entraria só numa delas, e ninguém
 * saberia qual das duas o consumidor de amanhã chamou.
 *
 * ─── POR QUE A CADEIA NASCEU INTEIRA, SEM O CAMPO QUE FALTAVA ─────────────
 *
 * `seo_imagem_url` existe na coluna desde a Story 2.1 e, até a Story 3.4, não
 * tinha caminho de escrita: ela não estava em `CAMPOS_ACEITOS`
 * (`api/_nucleo/salvarPost.js`). A Story 3.3 fez a função responder pelos três
 * elos mesmo assim, e a 3.4 só ligou o campo — que é o proveito de a cadeia ter
 * nascido inteira.
 *
 * ─── A ORDEM, E POR QUE ELA É ESTA ────────────────────────────────────────
 *
 * Imagem de Compartilhamento → Imagem de Capa → Imagem Padrão do Site.
 *
 * O campo de SEO é o mais específico: ele existe justamente para o Autor dizer
 * "na prévia, mostre ESTA, e não a capa". Vazio, ele **herda** a capa — é o que
 * o épico promete ("Vazios herdam respectivamente o título do Post, o Resumo e
 * a Imagem de Capa"). E sem nenhuma das duas, o padrão do site: retângulo
 * cinza não é uma opção, porque é o defeito que esta story conserta.
 *
 * ─── POR QUE VETOR NÃO SERVE, NEM VINDO DO POST ───────────────────────────
 *
 * WhatsApp, Facebook e LinkedIn não renderizam SVG em prévia de link. Um
 * endereço de capa apontando para vetor é um `og:image` que existe e não
 * aparece — pior que ausente, porque nada acusa. A conferência é LISTA DE
 * PERMISSÃO, derivada do mesmo vocabulário de espécie que a capa já usa: o que
 * não tem extensão de raster conhecida não serve como imagem de
 * compartilhamento e **cai para o elo seguinte**.
 *
 * O custo está medido e é aceito: um endereço de fora sem extensão
 * (`https://cdn.exemplo.com/imagem?id=7`) também cai. A troca é "prévia com a
 * marca" contra "prévia possivelmente vazia", e a primeira nunca é pior. Capa
 * do bucket sempre tem extensão, por construção (`caminhoDaCapa`).
 *
 * ─── POR QUE O DOMÍNIO CANÔNICO É PARÂMETRO, E NUNCA CONSTANTE ────────────
 *
 * O endereço da prévia precisa ser ABSOLUTO — rastreador não resolve caminho
 * relativo —, e o domínio vem do ambiente, decisão registrada no épico. Fixá-lo
 * aqui faria a Prévia do Editor mentir em qualquer ambiente que não fosse
 * produção, que é a única situação em que alguém a olha antes de publicar.
 */

import {
  ESPECIES_DE_IMAGEM,
  ROTULOS_DE_IMAGEM,
  enderecoDeImagemPermitido,
  problemaNoEnderecoDaImagem,
} from "./arquivos.js";

/* ─── Os dois ativos, e por que são DOIS ──────────────────────────────────── */

/**
 * A Imagem Padrão do Site: o cartão que a prévia de link mostra.
 *
 * ─── AS MEDIDAS SÃO DECLARAÇÃO, E A VERIFICAÇÃO AS COMPARA COM OS BYTES ───
 *
 * Este módulo é puro e não pode abrir arquivo: a largura e a altura precisam
 * estar escritas em algum lugar. Escritas AQUI, elas são a fonte de onde o
 * arquivo NASCE — `scripts/gerar-imagem-padrao.mjs` importa estas constantes e
 * rasteriza exatamente nestas medidas — e `verificar:interface` lê o cabeçalho
 * do PNG e afirma que o que está gravado nos bytes é o que está aqui. O número
 * não pode divergir do arquivo porque o arquivo é feito a partir dele e medido
 * contra ele.
 *
 * 1200×630 é a medida que `summary_large_image` e o gerador de prévia da Meta
 * esperam; abaixo disso a prévia degrada para o cartão pequeno.
 */
export const IMAGEM_PADRAO_DO_SITE = Object.freeze({
  /** Caminho absoluto DENTRO do site. O domínio entra na hora de resolver. */
  caminho: "/imagem-padrao-do-site.png",
  largura: 1200,
  altura: 630,
  tipo: "image/png",
  /**
   * O texto alternativo do ativo, declarado UMA vez.
   *
   * O `index.html` emite este mesmo texto em `og:image:alt`, e a verificação
   * compara os dois: duas frases descrevendo a mesma imagem divergiriam, e a
   * que o leitor de tela recebe seria a que ninguém revisou.
   */
  alternativo: "Logo da ChatClean, Plataforma de CRM e ChatBot para WhatsApp",
});

/**
 * O Logotipo Rasterizado: o que o dado estruturado chama de `logo`.
 *
 * ─── POR QUE ELE NÃO É A IMAGEM PADRÃO DO SITE ────────────────────────────
 *
 * São papéis diferentes, e usar um no lugar do outro erra os dois. `logo`, em
 * Schema.org, é o logotipo da MARCA — o painel de conhecimento do buscador o
 * mostra recortado justo, e um cartão 1200×630 com moldura vira um logotipo
 * minúsculo no meio de um retângulo vazio. A prévia de link é o oposto: ela
 * PRECISA da moldura larga, senão o cartão grande não é oferecido.
 *
 * O vetor não servia em nenhum dos dois: o rastreador que lê dado estruturado
 * também não renderiza SVG. Então o logotipo ganha o próprio raster, no
 * recorte da própria marca, sobre `--surface` — branco, que é o fundo que o
 * painel de conhecimento espera — e não sobre o tom da prévia.
 *
 * 600×120 sai do `viewBox` do ativo de marca (1125×225, exatamente 5:1) e fica
 * bem acima do piso de 112px que o buscador exige.
 */
export const LOGOTIPO_DA_MARCA = Object.freeze({
  caminho: "/logotipo-chatclean.png",
  largura: 600,
  altura: 120,
  tipo: "image/png",
  alternativo: "Logotipo da ChatClean",
});

/** Os dois ativos, para quem precisa varrer os dois sem repetir a lista. */
export const ATIVOS_DE_PREVIA = Object.freeze([IMAGEM_PADRAO_DO_SITE, LOGOTIPO_DA_MARCA]);

/* ─── O vocabulário fechado de espécie que a PRÉVIA aceita ────────────────── */

/**
 * As espécies que a capa aceita mas a PRÉVIA não — e por quê.
 *
 * Mesma disciplina de `ESPECIES_SEMPRE_RECUSADAS` em `arquivos.js`: uma lista
 * de permissão diz o que passa e não diz o que foi pensado e recusado. Sem
 * esta lista, "o WebP sumiu da prévia" e "ninguém lembrou do WebP" seriam
 * indistinguíveis.
 */
export const ESPECIES_FORA_DA_PREVIA = Object.freeze([
  Object.freeze({
    tipo: "image/webp",
    motivo:
      "o suporte a WebP nos geradores de prévia de link é irregular — é a MESMA classe de defeito " +
      "que esta story conserta (imagem que existe e não aparece), e cair para o elo seguinte " +
      "entrega uma prévia que funciona em vez de uma que talvez funcione",
  }),
]);

/** Os tipos que a prévia aceita. Derivados, e a subtração é declarada. */
export const TIPOS_NA_PREVIA = Object.freeze(
  ESPECIES_DE_IMAGEM.map((e) => e.tipo).filter(
    (tipo) => !ESPECIES_FORA_DA_PREVIA.some((fora) => fora.tipo === tipo),
  ),
);

/**
 * As extensões que identificam uma imagem que a prévia consegue mostrar.
 *
 * DERIVADO de `ESPECIES_DE_IMAGEM`, e não escrito de novo: o dia em que uma
 * espécie entrar no vocabulário da capa, ela entra aqui junto — ou sai por
 * `ESPECIES_FORA_DA_PREVIA`, com o motivo escrito. Uma segunda lista aceitaria
 * a capa e recusaria a prévia da mesma imagem, sem nada dizendo por quê.
 *
 * `jpeg` é o único acréscimo, e é ALIAS de grafia, não espécie nova: o tipo vem
 * da própria entrada de `jpg`. E ele **lança** se essa entrada sumir — num
 * módulo que grita por token ausente, o alias não pode ser o único ponto que
 * degrada calado.
 */
export const TIPO_POR_EXTENSAO = Object.freeze(
  (() => {
    const aceitas = ESPECIES_DE_IMAGEM.filter((e) => TIPOS_NA_PREVIA.includes(e.tipo));
    const mapa = Object.fromEntries(aceitas.map((e) => [e.extensao, e.tipo]));
    const doJpg = aceitas.find((e) => e.extensao === "jpg")?.tipo;
    if (typeof doJpg !== "string") {
      throw new Error(
        "O vocabulário de prévia perdeu a entrada `jpg`: o alias `jpeg` não tem de onde derivar o tipo.",
      );
    }
    mapa.jpeg = doJpg;
    return mapa;
  })(),
);

/**
 * O tipo desta imagem pela extensão do endereço, ou `null`.
 *
 * `null` significa "não sei o que é", e "não sei" é recusa: é o que devolve
 * para `.svg`, para endereço sem extensão e para qualquer coisa fora do
 * vocabulário. A pergunta é feita sobre o CAMINHO — consulta e âncora saem
 * antes, senão `foto.png?v=2` não seria reconhecida.
 */
export function tipoDaImagem(endereco) {
  if (typeof endereco !== "string") return null;
  const caminho = endereco.replace(/[?#].*$/s, "");
  const ultimo = caminho.slice(caminho.lastIndexOf("/") + 1);
  const ponto = ultimo.lastIndexOf(".");
  if (ponto <= 0) return null;
  const extensao = ultimo.slice(ponto + 1).toLowerCase();
  return TIPO_POR_EXTENSAO[extensao] ?? null;
}

/* ─── O Domínio Canônico ──────────────────────────────────────────────────── */

/**
 * O defeito NOMEADO de montagem: a resolução foi chamada sem o domínio.
 *
 * Ela LANÇA em vez de devolver algo — e a escolha é deliberada. Devolver
 * endereço relativo produziria uma prévia que o rastreador não resolve;
 * devolver `null` produziria uma Prévia silenciosamente sem imagem, que é o
 * retângulo cinza de volta com outra causa. A variável de ambiente ausente é
 * defeito de quem monta, não erro de quem escreve o Post, e precisa aparecer
 * como tal.
 */
export const DEFEITO_DE_DOMINIO_AUSENTE =
  "A imagem de compartilhamento não pôde ser resolvida: o Domínio Canônico não chegou. " +
  "É defeito de montagem: a variável de ambiente VITE_DOMINIO_DO_SITE não foi lida.";

/**
 * A raiz absoluta do site, sem barra no fim — ou lança.
 *
 * A permissão é a MESMA de `enderecoDeImagemPermitido`: `https://` para
 * qualquer host, `http://` só para host local. Uma segunda opinião sobre o que
 * é endereço bom divergiria na primeira mudança, e este projeto já pagou por
 * isso uma vez.
 *
 * E o domínio é SÓ a origem: caminho, consulta ou âncora aqui produziriam
 * `https://site.com/blog?x=1/imagem-padrao-do-site.png`, que é endereço
 * malformado com cara de endereço bom.
 */
export function raizDoSite(dominio) {
  const texto = typeof dominio === "string" ? dominio.trim() : "";
  const semBarra = texto.replace(/\/+$/, "");
  if (semBarra === "" || !enderecoDeImagemPermitido(semBarra)) {
    throw new Error(DEFEITO_DE_DOMINIO_AUSENTE);
  }
  /* Só a origem. `enderecoDeImagemPermitido` já garantiu o esquema e a
     autoridade; o que sobra depois da autoridade tem de ser nada. */
  const semEsquema = semBarra.replace(/^https?:\/\//i, "");
  if (/[/?#]/.test(semEsquema)) throw new Error(DEFEITO_DE_DOMINIO_AUSENTE);
  return semBarra;
}

/** O endereço absoluto de um ativo de prévia sob um domínio. */
export function enderecoDoAtivo(dominio, ativo) {
  return `${raizDoSite(dominio)}${ativo.caminho}`;
}

/** O endereço absoluto da Imagem Padrão do Site sob um domínio. */
export function enderecoDaImagemPadrao(dominio) {
  return enderecoDoAtivo(dominio, IMAGEM_PADRAO_DO_SITE);
}

/** O endereço absoluto do Logotipo Rasterizado sob um domínio. */
export function enderecoDoLogotipo(dominio) {
  return enderecoDoAtivo(dominio, LOGOTIPO_DA_MARCA);
}

/* ─── OS DOIS NÚMEROS DE CADA CAMPO DE TEXTO (Story 3.4) ──────────────────── */

/**
 * Os três campos de SEO do Post, na ordem em que a tela os oferece.
 *
 * Lista FECHADA e declarada uma vez: ela é lida pela gaveta, pela função de
 * servidor e pela verificação. Um quarto campo entra aqui, e não em quatro
 * lugares.
 */
export const CAMPOS_DE_SEO = Object.freeze([
  "seo_titulo",
  "seo_descricao",
  "seo_imagem_url",
]);

/**
 * Os dois de TEXTO, e o de IMAGEM — a partição de `CAMPOS_DE_SEO`.
 *
 * Eles existem porque os consumidores tratam os dois grupos de forma
 * diferente, e todos escreviam a divisão à mão: a porta percorre os de texto
 * para cobrar o teto de higiene e trata o de imagem pelo vocabulário de
 * esquema; a gaveta desenha os dois primeiros com contador e o terceiro com o
 * controle de duas origens. Cada cópia dessa divisão é um lugar a mais para o
 * quarto campo não entrar.
 */
export const CAMPOS_DE_TEXTO_DE_SEO = Object.freeze(["seo_titulo", "seo_descricao"]);
export const CAMPO_DE_IMAGEM_DE_SEO = "seo_imagem_url";

/* A PARTIÇÃO É CONFERIDA NO CARREGAMENTO, e LANÇA. Um quarto campo em
   `CAMPOS_DE_SEO` que ninguém classificasse ficaria invisível para a porta e
   para a tela ao mesmo tempo — presente na lista, tratado por ninguém. */
{
  const classificados = [...CAMPOS_DE_TEXTO_DE_SEO, CAMPO_DE_IMAGEM_DE_SEO];
  const faltando = CAMPOS_DE_SEO.filter((campo) => !classificados.includes(campo));
  const sobrando = classificados.filter((campo) => !CAMPOS_DE_SEO.includes(campo));
  if (faltando.length > 0 || sobrando.length > 0 || classificados.length !== CAMPOS_DE_SEO.length) {
    throw new Error(
      "Os campos de SEO precisam ser exatamente os de texto mais o de imagem: " +
        `sem classificação [${faltando.join(", ")}], fora da lista [${sobrando.join(", ")}].`,
    );
  }
}

/**
 * O nome de cada um, em palavras de gente. Declarado UMA vez: a recusa do
 * servidor e o rótulo da gaveta falam do mesmo campo, e duas grafias fariam o
 * Autor procurar na tela um campo que a mensagem chama de outro nome.
 */
export const ROTULOS_DE_SEO = Object.freeze({
  seo_titulo: "Título SEO",
  seo_descricao: "Meta Descrição",
  seo_imagem_url: "Imagem de Compartilhamento",
});

/**
 * O comprimento USUAL de cada campo — o número que o contador **sinaliza**.
 *
 * É conselho de quem EXIBE o resultado de busca, não regra de quem escreve:
 * passar dele é escolha legítima, o mecanismo corta na exibição e ninguém é
 * penalizado. Por isso ele nunca bloqueia, nunca trunca e nunca chega ao banco
 * — ele só aparece na tela, ao lado do que está escrito.
 *
 * Os dois números vêm do épico: ~60 para o título, ~155 para a descrição.
 */
export const COMPRIMENTO_USUAL_DE_SEO = Object.freeze({
  seo_titulo: 60,
  seo_descricao: 155,
});

/**
 * O teto de HIGIENE de cada campo — o número que **recusa**.
 *
 * Trabalho completamente diferente do de cima: uma coluna de texto sem limite
 * nenhum é problema de armazenamento e de saída (uma etiqueta de metadado com
 * dez mil caracteres viaja em toda resposta), e a defesa que sobrevive a um
 * esquecimento da aplicação mora no banco — `posts_seo_titulo_com_teto` e
 * `posts_seo_descricao_com_teto` cobram estes MESMOS números.
 *
 * Ele não existe para disciplinar o Autor, e é por isso que está LONGE do
 * usual: ver `DISTANCIA_MINIMA_ENTRE_OS_DOIS`.
 */
export const TETO_DE_HIGIENE_DE_SEO = Object.freeze({
  seo_titulo: 300,
  seo_descricao: 1000,
});

/**
 * Quantas vezes o teto de higiene precisa ser maior que o comprimento usual.
 *
 * ─── POR QUE A DISTÂNCIA É DECLARADA, E NÃO APENAS OBSERVADA ──────────────
 *
 * Se os dois números ficarem perto, o teto de higiene passa a disciplinar o
 * Autor — que é exatamente o que o critério proíbe ao dizer que o comprimento
 * usual sinaliza e não bloqueia. Um teto de 70 para um usual de 60 recusaria o
 * título de 65 caracteres que o critério manda **aceitar**, e o defeito
 * apareceria como "não consigo salvar", sem ninguém ligar uma coisa à outra.
 *
 * O fator é conferido no carregamento do módulo, e LANÇA: um número editado
 * para perto do outro não pode virar comportamento novo em silêncio. É a mesma
 * disciplina do alias de `TIPO_POR_EXTENSAO`, logo acima.
 */
export const DISTANCIA_MINIMA_ENTRE_OS_DOIS = 4;

for (const campo of Object.keys(COMPRIMENTO_USUAL_DE_SEO)) {
  const usual = COMPRIMENTO_USUAL_DE_SEO[campo];
  const teto = TETO_DE_HIGIENE_DE_SEO[campo];
  if (!Number.isInteger(usual) || !Number.isInteger(teto)) {
    throw new Error(
      `Os dois números de \`${campo}\` precisam ser inteiros: usual=${usual}, teto=${teto}.`,
    );
  }
  if (teto < usual * DISTANCIA_MINIMA_ENTRE_OS_DOIS) {
    throw new Error(
      `O teto de higiene de \`${campo}\` (${teto}) encostou no comprimento usual (${usual}): ` +
        `a distância mínima é ${DISTANCIA_MINIMA_ENTRE_OS_DOIS}x, e sem ela o teto passa a ` +
        "disciplinar o Autor em vez de proteger o armazenamento.",
    );
  }
}

/**
 * Quantos CARACTERES este texto tem — pontos de código, não unidades UTF-16.
 *
 * ─── POR QUE `.length` NÃO SERVE ──────────────────────────────────────────
 *
 * `char_length` no Postgres conta CARACTERES; `String.prototype.length` conta
 * unidades UTF-16, e todo ponto de código fora do BMP ocupa duas. Uma Meta
 * Descrição de 160 emojis é 160 para a restrição do banco e 320 para um
 * `.length` — a porta recusaria um texto que o banco aceita, e a recusa diria
 * um número que não corresponde a nada que a pessoa consegue contar.
 *
 * O projeto afirma em dois lugares que "os dois lados dizem a mesma coisa", e
 * enquanto toda asserção usasse `repeat('a', …)` a divergência nunca apareceria.
 * Este é o mesmo motivo pelo qual o monograma extrai por ponto de código.
 */
export function caracteresDe(valor) {
  return [...String(valor ?? "")].length;
}

/* ─── O TEXTO COMO ELE VAI SER EMITIDO ────────────────────────────────────
 *
 * Um título de busca é uma etiqueta de UMA LINHA. `seo_titulo` é digitado num
 * `<textarea>` — que aceita Enter — e nada impedia uma quebra de linha, uma
 * tabulação ou um caractere de controle de atravessar a tela, a porta e a
 * restrição e virar um `<title>` partido ao meio.
 *
 * A normalização mora AQUI, e não na gravação, e a escolha é deliberada: o que
 * a pessoa escreveu continua inteiro na coluna — o projeto não corta o texto do
 * Autor —, e o que muda é o valor EMITIDO, decidido no único lugar que decide o
 * que um Post declara. Assim a tela mostra exatamente a etiqueta que o
 * rastreador vai receber, que é a promessa da Prévia.
 *
 * Não é truncagem: nenhum caractere de conteúdo é perdido. Espaço em branco de
 * qualquer espécie vira UM espaço, e o que sai são os controles C0/C1, que não
 * são representáveis numa etiqueta de metadado.
 */
/* O lint proíbe caractere de controle em expressão regular, e a proibição é
   boa: quase sempre ele chegou lá por engano de escrita. Aqui ele é o ALVO —
   a lista é justamente a dos controles C0/C1 que não podem sair numa etiqueta
   de metadado —, e a exceção é nomeada em vez de a regra ser desligada. */
// eslint-disable-next-line no-control-regex
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** O texto como ele vai para a etiqueta: sem controle, e numa linha só. */
export function textoDeMetadado(valor) {
  if (typeof valor !== "string") return "";
  return valor.replace(CONTROLES, "").replace(/\s+/gu, " ").trim();
}

/** A recusa do teto de higiene — e ela DIZ o teto, como toda recusa daqui. */
export function recusaDeTextoDeSeo(campo) {
  const teto = TETO_DE_HIGIENE_DE_SEO[campo];
  if (teto === undefined) return null;
  return (
    `${ROTULOS_DE_SEO[campo]}: o texto passa de ${teto} caracteres, que é o limite de ` +
    "armazenamento do campo. Encurte antes de salvar."
  );
}

/**
 * O problema deste texto de SEO, ou `null` quando não há nenhum.
 *
 * **Só o teto de higiene recusa.** Passar do comprimento usual não aparece
 * aqui de propósito: quem sinaliza isso é o contador da tela, e trazer a
 * sinalização para cá a transformaria numa recusa — o defeito que a distância
 * entre os dois números existe para impedir.
 *
 * Vazio e só-espaços devolvem `null`: campo de SEO em branco não é falta, é
 * herança.
 */
export function problemaNoTextoDeSeo(campo, valor) {
  if (TETO_DE_HIGIENE_DE_SEO[campo] === undefined) return null;
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") {
    return `${ROTULOS_DE_SEO[campo]}: o valor precisa ser texto.`;
  }
  const texto = valor.trim();
  if (texto === "") return null;
  /* CARACTERES, e não unidades UTF-16 — o mesmo que `char_length` conta na
     restrição do banco. Ver `caracteresDe`. */
  return caracteresDe(texto) > TETO_DE_HIGIENE_DE_SEO[campo]
    ? recusaDeTextoDeSeo(campo)
    : null;
}

/* ─── A regra de resolução ────────────────────────────────────────────────── */

/**
 * As origens possíveis, na ORDEM de precedência. Vocabulário fechado: quem lê
 * `origem` fora desta lista está lendo um valor que esta função não produz.
 */
export const ORIGENS_DA_IMAGEM = Object.freeze([
  "compartilhamento",
  "capa",
  "padrao",
]);

/**
 * As origens do TÍTULO e da DESCRIÇÃO, nas mesmas ordens de precedência.
 *
 * `compartilhamento` é o primeiro elo dos TRÊS, e a palavra é a mesma de
 * propósito: ela nomeia "o campo de SEO deste Post", que é a mesma ideia nos
 * três casos. Os elos seguintes nomeiam o campo herdado — o título do Post, o
 * Resumo, a Capa —, e `null` é a quarta resposta possível dos dois campos de
 * texto: **ausente**, que não é o mesmo que vazio (ver `metadadosDoPost`).
 */
export const ORIGENS_DO_TITULO = Object.freeze(["compartilhamento", "titulo"]);
export const ORIGENS_DA_DESCRICAO = Object.freeze(["compartilhamento", "resumo"]);

/**
 * A cadeia de cada campo de texto: o campo próprio, e o campo herdado.
 *
 * Declarada como DADO, e não como dois blocos de `if`, pela mesma razão de
 * `CAMPOS_NA_ORDEM`: é isto que um consumidor lê para saber de onde cada valor
 * pode vir, sem precisar reler o corpo da função.
 */
const CADEIAS_DE_TEXTO = Object.freeze([
  Object.freeze({
    nome: "titulo",
    campo: "seo_titulo",
    herdaDe: "titulo",
    origens: ORIGENS_DO_TITULO,
  }),
  Object.freeze({
    nome: "descricao",
    campo: "seo_descricao",
    herdaDe: "resumo",
    origens: ORIGENS_DA_DESCRICAO,
  }),
]);

/**
 * Os campos do Post consultados, na ordem, e a origem que cada um nomeia.
 *
 * A ordem mora AQUI e em nenhum outro lugar — é o que a Story 3.4 lê para
 * saber onde ligar o campo que hoje não tem caminho de escrita.
 */
const CAMPOS_NA_ORDEM = Object.freeze([
  Object.freeze({ campo: "seo_imagem_url", origem: "compartilhamento" }),
  Object.freeze({ campo: "imagem_url", origem: "capa" }),
]);

/** A recusa por espécie: a prévia não mostraria este arquivo. */
export const RECUSA_DE_ESPECIE_NA_PREVIA =
  `A prévia de link só mostra ${ROTULOS_DE_IMAGEM.filter((r) => r !== "WebP").join(" e ")}. ` +
  "Endereço sem extensão conhecida, vetor ou formato fora dessa lista não aparece no WhatsApp " +
  "nem no Facebook: o link cai na imagem padrão do site.";

/** A recusa por esquema: o site é seguro e a imagem não seria alcançada. */
export const RECUSA_DE_ENDERECO_INALCANCAVEL =
  "Este endereço de imagem não é alcançável de fora: o site é servido por https e a imagem " +
  "aponta para um endereço local ou sem TLS. O rastreador não a buscaria.";

/**
 * A imagem que representa este Post, com as medidas, o tipo e a descrição.
 *
 * Devolve `{ endereco, largura, altura, tipo, alternativo, origem, herdado }`.
 * O endereço é sempre absoluto. **Não é exportada**: quem responde por um Post
 * é `metadadosDoPost`, e uma segunda porta de entrada para a mesma cadeia seria
 * a segunda opinião que este módulo existe para não ter. As recusas vão para a
 * lista compartilhada, que é a mesma dos três campos.
 *
 * ─── POR QUE `largura` E `altura` SÃO `null` FORA DO PADRÃO ───────────────
 *
 * Só dos ativos do site nós conhecemos as medidas, porque são os únicos
 * arquivos que este projeto produz. Uma capa enviada ou de fora tem as medidas
 * que tem, e declarar 1200×630 para ela seria escrever um número que o arquivo
 * desmente — exatamente o que o critério proíbe ao dizer "e os valores são os
 * do arquivo real". `null` é "não declare", e quem monta a etiqueta omite as
 * duas em vez de mentir.
 *
 * ─── E POR QUE `tipo` NÃO SEGUE A MESMA REGRA ─────────────────────────────
 *
 * `tipo` continua vindo da extensão, e a diferença é deliberada, não descuido.
 * As duas etiquetas têm papéis diferentes no rastreador: `og:image:width` e
 * `:height` são usadas para RESERVAR o cartão **antes** de a imagem chegar — um
 * número errado ali desloca o layout de forma visível —, enquanto
 * `og:image:type` é uma dica que o rastreador confirma farejando os bytes que
 * ele mesmo baixa. Uma extensão mentirosa produz, no pior caso, uma dica
 * ignorada; uma medida mentirosa produz um cartão torto. A extensão também é a
 * única evidência que uma função PURA tem sobre um arquivo que está noutro
 * servidor: exigir os bytes aqui seria exigir rede num módulo de domínio.
 *
 * ─── E O QUE FOI RECUSADO SAI NOMEADO ─────────────────────────────────────
 *
 * `recusadas` traz `{ campo, origem, motivo }` de cada elo que não serviu. Sem
 * isso, a Prévia da Story 3.5 mostraria a imagem padrão e o Autor não teria
 * como saber por que o endereço que ele digitou sumiu — que é o mesmo defeito
 * que `problemaNoEnderecoDaImagem` foi escrito para não ter no formulário.
 */
function resolverImagem(post, dominio, recusadas) {
  const raiz = raizDoSite(dominio);
  const siteSeguro = /^https:\/\//i.test(raiz);

  for (const { campo, origem } of CAMPOS_NA_ORDEM) {
    const bruto = post === null || post === undefined ? undefined : post[campo];
    const endereco = typeof bruto === "string" ? bruto.trim() : "";
    if (endereco === "") continue;

    if (!enderecoDeImagemPermitido(endereco)) {
      recusadas.push({ campo, origem, motivo: problemaNoEnderecoDaImagem(endereco) });
      continue;
    }
    /* O site é servido por https e a imagem não: nenhum rastreador de fora
       alcança `http://localhost:5173/capa.png`, e um `og:image` inalcançável é
       a prévia vazia com outra causa. Em desenvolvimento — site local — os dois
       lados são locais e a conferência não se aplica. */
    if (siteSeguro && !/^https:\/\//i.test(endereco)) {
      recusadas.push({ campo, origem, motivo: RECUSA_DE_ENDERECO_INALCANCAVEL });
      continue;
    }
    const tipo = tipoDaImagem(endereco);
    if (tipo === null) {
      recusadas.push({ campo, origem, motivo: RECUSA_DE_ESPECIE_NA_PREVIA });
      continue;
    }

    const descricao =
      typeof post?.imagem_alt === "string" && post.imagem_alt.trim() !== ""
        ? post.imagem_alt.trim()
        : null;
    return Object.freeze({
      endereco,
      largura: null,
      altura: null,
      tipo,
      alternativo: descricao,
      origem,
      herdado: origem !== "compartilhamento",
    });
  }

  return Object.freeze({
    endereco: enderecoDaImagemPadrao(dominio),
    largura: IMAGEM_PADRAO_DO_SITE.largura,
    altura: IMAGEM_PADRAO_DO_SITE.altura,
    tipo: IMAGEM_PADRAO_DO_SITE.tipo,
    alternativo: IMAGEM_PADRAO_DO_SITE.alternativo,
    origem: "padrao",
    herdado: true,
  });
}

/**
 * A herança de UM campo de texto: o próprio, depois o herdado, depois ausente.
 *
 * ─── VAZIO HERDA; SÓ ESPAÇOS TAMBÉM ──────────────────────────────────────
 *
 * O valor é APARADO antes de ser julgado, nos dois elos. Um campo com três
 * espaços é um campo que a pessoa não preencheu — gravá-lo como título de
 * busca produziria uma etiqueta em branco, que é pior que a herdada, porque
 * nada acusaria.
 *
 * ─── E O TETO DE HIGIENE RECUSA, CAINDO PARA O ELO SEGUINTE ───────────────
 *
 * A mesma forma da imagem: o elo que não serve entra em `recusadas` com campo,
 * origem e motivo, e a cadeia continua. Sem isso, um valor recusado sumiria e o
 * Autor veria o título do Post no lugar do que ele escreveu, sem explicação.
 *
 * O elo HERDADO não é conferido contra o teto, e a ausência é medida, não
 * esquecimento: `titulo` e `resumo` têm teto próprio na gravação (300 e 600),
 * os dois NÃO ACIMA do teto de higiene do campo de SEO que os herda. Isso
 * deixou de ser coincidência entre quatro números em dois arquivos e virou
 * guarda de carregamento — `TETO_DA_FONTE_HERDADA`, em `api/_nucleo/salvarPost.js`,
 * que LANÇA se alguém subir um dos dois. É lá porque é o único módulo onde os
 * quatro números são visíveis ao mesmo tempo, e o domínio não importa de `api/`.
 */
function herdarTexto({ post, cadeia, recusadas }) {
  const { campo, herdaDe, origens } = cadeia;
  const [origemPropria, origemHerdada] = origens;

  /* O valor sai NORMALIZADO — ver `textoDeMetadado`: uma etiqueta de metadado é
     de uma linha só, e o `<textarea>` do Título SEO aceita Enter. O teto é
     conferido sobre o texto NORMALIZADO porque é ele que representa o campo:
     conferir o bruto recusaria por causa de espaço em branco que não vai para
     etiqueta nenhuma. */
  const bruto = post === null || post === undefined ? undefined : post[campo];
  const proprio = textoDeMetadado(bruto);
  if (proprio !== "") {
    const problema = problemaNoTextoDeSeo(campo, proprio);
    if (problema === null) {
      return Object.freeze({ valor: proprio, origem: origemPropria, herdado: false });
    }
    recusadas.push({ campo, origem: origemPropria, motivo: problema });
  }

  const doPost = post === null || post === undefined ? undefined : post[herdaDe];
  const herdado = textoDeMetadado(doPost);
  if (herdado !== "") {
    return Object.freeze({ valor: herdado, origem: origemHerdada, herdado: true });
  }

  /* AUSENTE, e não vazio. `""` viraria uma etiqueta declarada e em branco —
     o critério manda a descrição ficar ausente quando não há Resumo, "sem
     inventar texto". `null` é a instrução de OMITIR. */
  return Object.freeze({ valor: null, origem: null, herdado: true });
}

/**
 * O que este Post declara ao ser compartilhado: título, descrição e imagem.
 *
 * Devolve `{ titulo, descricao, imagem, recusadas }`, congelado.
 *
 *   `titulo` e `descricao` — `{ valor, origem, herdado }`. `valor` é `null`
 *     quando nem o campo de SEO nem o campo herdado têm texto: ausente, e não
 *     vazio.
 *   `imagem` — `{ endereco, largura, altura, tipo, alternativo, origem,
 *     herdado }`, com o endereço sempre ABSOLUTO.
 *   `recusadas` — `{ campo, origem, motivo }` de cada elo que não serviu, dos
 *     TRÊS campos, na ordem em que foram consultados.
 *
 * ─── É ESTA A FUNÇÃO QUE TODO CONSUMIDOR CHAMA ────────────────────────────
 *
 * A gaveta do Editor a chama para mostrar o que será herdado; a Prévia (Story
 * 3.5) e o emissor de metadado (Épico 4) a chamarão para desenhar e para
 * servir. Nenhum deles decide por conta própria: um `seo_titulo || titulo`
 * escrito numa tela é a segunda opinião que diverge no primeiro campo novo, e
 * `verificar:interface` varre o projeto atrás exatamente disso.
 */
export function metadadosDoPost(post, opcoes) {
  const { dominio } = opcoes ?? {};
  const recusadas = [];

  const textos = {};
  for (const cadeia of CADEIAS_DE_TEXTO) {
    textos[cadeia.nome] = herdarTexto({ post, cadeia, recusadas });
  }
  const imagem = resolverImagem(post, dominio, recusadas);

  return Object.freeze({
    titulo: textos.titulo,
    descricao: textos.descricao,
    imagem,
    recusadas: Object.freeze(recusadas),
  });
}
