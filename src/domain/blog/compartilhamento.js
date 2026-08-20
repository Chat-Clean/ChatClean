/**
 * Os ativos de prévia do site, e a regra de QUAL imagem representa um Post
 * quando um link dele é compartilhado.
 *
 * Puro: sem React, sem rede, sem `fetch`, sem cliente, sem `fs`. É a função
 * que a Prévia do Editor (Story 3.5) e a Função de Borda que emite metadado no
 * HTML servido (Épico 4) chamam — **a mesma**. A divergência entre o que o
 * Autor vê na Prévia e o que o rastreador recebe é exatamente o defeito que
 * esta função existe para não ter, e duas implementações da mesma cadeia
 * divergiriam na primeira mudança.
 *
 * ─── POR QUE A CADEIA NASCE INTEIRA, SEM O CAMPO QUE FALTA ─────────────────
 *
 * `seo_imagem_url` existe na coluna desde a Story 2.1 e **não tem caminho de
 * escrita**: ela não está em `CAMPOS_ACEITOS` (`api/_nucleo/salvarPost.js`), e
 * ligá-la é a Story 3.4. Mesmo assim a função responde pelos três elos hoje.
 * Partir a cadeia em duas entregas produziria duas funções respondendo à mesma
 * pergunta — e a segunda nasceria discordando da primeira no dia em que a
 * primeira mudasse.
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
  alternativo: "Logo da ChatClean — Plataforma de CRM e ChatBot para WhatsApp",
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
  "É defeito de montagem — a variável de ambiente do domínio do site não foi lida.";

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
  "nem no Facebook — o link cai na imagem padrão do site.";

/** A recusa por esquema: o site é seguro e a imagem não seria alcançada. */
export const RECUSA_DE_ENDERECO_INALCANCAVEL =
  "Este endereço de imagem não é alcançável de fora: o site é servido por https e a imagem " +
  "aponta para um endereço local ou sem TLS. O rastreador não a buscaria.";

/**
 * A imagem que representa este Post, com as medidas, o tipo e a descrição.
 *
 * Devolve `{ endereco, largura, altura, tipo, alternativo, origem, recusadas }`.
 * O endereço é sempre absoluto.
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
export function imagemDoPost(post, opcoes) {
  const { dominio } = opcoes ?? {};
  const raiz = raizDoSite(dominio);
  const siteSeguro = /^https:\/\//i.test(raiz);
  const recusadas = [];

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
      recusadas: Object.freeze(recusadas),
    });
  }

  return Object.freeze({
    endereco: enderecoDaImagemPadrao(dominio),
    largura: IMAGEM_PADRAO_DO_SITE.largura,
    altura: IMAGEM_PADRAO_DO_SITE.altura,
    tipo: IMAGEM_PADRAO_DO_SITE.tipo,
    alternativo: IMAGEM_PADRAO_DO_SITE.alternativo,
    origem: "padrao",
    recusadas: Object.freeze(recusadas),
  });
}
