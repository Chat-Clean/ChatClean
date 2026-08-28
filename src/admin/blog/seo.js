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
  CAMPOS_DE_SEO,
  CAMPOS_DE_TEXTO_DE_SEO,
  COMPRIMENTO_USUAL_DE_SEO,
  DEFEITO_DE_DOMINIO_AUSENTE,
  ROTULOS_DE_SEO,
  caracteresDe,
  metadadosDoPost,
} from "@/domain/blog/compartilhamento";
/* O nome da CAPA vem do domínio, e não é escrito de novo: a recusa de um elo
   da cadeia pode acusar a coluna da capa, e a Prévia precisa chamá-la pelo
   mesmo nome que a gaveta usa no rótulo do campo. */
import { ROTULO_DA_CAPA } from "@/domain/blog/arquivos";

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
    `Acima dos ${usual} caracteres que os buscadores costumam exibir, o texto ` +
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

/* ─── A PRÉVIA DE COMPARTILHAMENTO (Story 3.5) ──────────────────────────────
 *
 * As falas da Prévia moram AQUI, no mesmo vocabulário fechado da seção de SEO,
 * e não num módulo novo: um segundo módulo de fala seria um segundo lugar
 * dizendo as mesmas coisas sobre os mesmos três campos, e a primeira frase que
 * alguém ajustasse ficaria ajustada em só um deles.
 *
 * ─── E ESTE MÓDULO CONTINUA SEM DECIDIR NADA ────────────────────────────────
 *
 * Tudo o que a Prévia mostra vem de `metadadosDoPost`, campo a campo. O que
 * está aqui embaixo é NOME e FRASE: como o cartão se chama, como cada pedaço
 * dele se identifica no documento, e o que se diz quando um valor está ausente
 * ou quando um elo da cadeia foi recusado. Nenhuma destas funções escolhe entre
 * dois valores, completa um que falta ou formata o que recebeu.
 */

/**
 * O NOME desta Prévia — e por que ele não é "pré-visualização".
 *
 * O Painel já tem a pré-visualização do artigo, da Story 2.13
 * (`PreVisualizacaoDePost.jsx`, `previa.js`, `TITULO_DA_TELA`): ela mostra o
 * TEXTO como o leitor verá no site. Esta mostra o CARTÃO como o link aparece
 * quando alguém o compartilha. São coisas diferentes, e dois "prévia" no mesmo
 * Painel é exatamente o sinônimo que a convenção do projeto proíbe — quem
 * dissesse "abre a prévia" estaria falando de uma das duas e ninguém saberia
 * qual.
 *
 * `verificar:editor` compara as duas grafias e cobra que elas não compartilhem
 * palavra nenhuma.
 */
export const NOME_DO_CARTAO = "Cartão de Compartilhamento";

/** O que se lê acima do cartão, na gaveta. */
export const TITULO_DO_CARTAO = "Como o link vai aparecer";

/**
 * A explicação de uma linha, abaixo do título.
 *
 * Ela diz as duas coisas que o Autor precisa saber para ler o cartão: que o que
 * está ali é o EFETIVO (o próprio ou o herdado), e que a forma é aproximada —
 * cada aplicativo desenha o seu. Prometer fidelidade de pixel seria vender uma
 * precisão que ninguém pode entregar.
 */
export const EXPLICACAO_DO_CARTAO =
  "O que já está valendo agora, com o que for herdado no lugar do que está em branco. " +
  "Cada aplicativo desenha o cartão do seu jeito.";

/**
 * Como cada pedaço do cartão se identifica no documento.
 *
 * DECLARADOS, e não montados por interpolação, pela mesma razão de
 * `PAPEIS_DO_CAMPO_DE_IMAGEM` em `capa.js`: é por estes nomes que a verificação
 * encontra o valor exibido para compará-lo, campo a campo, com o que o domínio
 * devolveu — e um nome montado em tempo de execução tornaria essa comparação
 * dependente da forma da string em vez do contrato de tela.
 *
 * `defeito` reusa `heranca-indisponivel`, que é o nome que a seção de SEO já
 * usava na Story 3.4: o defeito de montagem passou a ser dito DENTRO da Prévia
 * — é ela que não pode virar cartão em branco —, e renomeá-lo teria trocado um
 * contrato de tela por simetria de string.
 */
export const PAPEIS_DO_CARTAO = Object.freeze({
  cartao: "cartao-de-compartilhamento",
  moldura: "moldura-do-cartao",
  imagem: "imagem-do-cartao",
  imagemDegradada: "imagem-degradada-no-cartao",
  imagemQuebrada: "imagem-quebrada-no-cartao",
  origemDaImagem: "origem-da-imagem-no-cartao",
  valorDoTitulo: "titulo-do-cartao",
  ausenciaDoTitulo: "titulo-ausente-no-cartao",
  origemDoTitulo: "origem-do-titulo-no-cartao",
  avisoDoTitulo: "aviso-de-comprimento-do-titulo-no-cartao",
  valorDaDescricao: "descricao-do-cartao",
  ausenciaDaDescricao: "descricao-ausente-no-cartao",
  origemDaDescricao: "origem-da-descricao-no-cartao",
  avisoDaDescricao: "aviso-de-comprimento-da-descricao-no-cartao",
  recusas: "recusas-do-cartao",
  defeito: "heranca-indisponivel",
});

/**
 * O que se diz quando um dos textos está AUSENTE.
 *
 * `metadadosDoPost` devolve `valor: null` quando nem o campo de SEO nem o campo
 * herdado têm texto, e `null` é a instrução de OMITIR a etiqueta. O cartão não
 * pode desenhar uma linha em branco no lugar — uma linha vazia é indistinguível
 * de um valor que não coube — e não pode inventar texto, que é o que o critério
 * proíbe. O que ele faz é DIZER a ausência.
 *
 * As frases são declaradas por campo, e não montadas a partir do rótulo: "Sem
 * Título SEO" e "Sem Meta Descrição" concordariam em gênero por acaso, e a
 * frase que interessa não é o nome do campo — é o que vai acontecer com o link.
 */
const AUSENCIA_NO_CARTAO = Object.freeze({
  seo_titulo:
    "Ausente: o post ainda não tem título nenhum, e o link vai aparecer sem um.",
  seo_descricao:
    "Ausente: o post não tem Resumo, e nada é inventado no lugar, o link aparece só com o título.",
});

/* A COBERTURA É CONFERIDA NO CARREGAMENTO, e LANÇA. Um terceiro campo de texto
   de SEO sem frase aqui apareceria no cartão como uma ausência muda, que é o
   silêncio que este bloco existe para não ter. */
{
  const semFrase = CAMPOS_DE_TEXTO_DE_SEO.filter(
    (campo) => typeof AUSENCIA_NO_CARTAO[campo] !== "string",
  );
  const sobrando = Object.keys(AUSENCIA_NO_CARTAO).filter(
    (campo) => !CAMPOS_DE_TEXTO_DE_SEO.includes(campo),
  );
  if (semFrase.length > 0 || sobrando.length > 0) {
    throw new Error(
      "A Prévia precisa de uma frase de ausência para cada campo de texto de SEO: " +
        `sem frase [${semFrase.join(", ")}], fora da lista [${sobrando.join(", ")}].`,
    );
  }
}

/** A fala da ausência de um campo de texto, ou `""` fora do vocabulário. */
export function falaDaAusenciaNoCartao(campo) {
  return AUSENCIA_NO_CARTAO[campo] ?? "";
}

/**
 * O segundo defeito de montagem que o cartão sabe dizer: a herança não chegou.
 *
 * `herancaDoFormulario` devolve `{ok:true, metadados}` ou `{ok:false, defeito}`,
 * e essas são as duas respostas possíveis — então este ramo não acontece em uso
 * normal. Ele existe porque a alternativa era pior: um cartão montado sem
 * decisão nenhuma seria um cartão EM BRANCO, e o critério proíbe justamente
 * isso ("nunca cartão em branco nem cartão mentiroso"). Um ramo que não sabe o
 * que dizer é o silêncio de sempre, com outra roupa.
 *
 * A frase é distinta da do Domínio Canônico de propósito: as duas causas são
 * diferentes, e um `catch` que responde por dois fatos manda procurar o defeito
 * no lugar errado — foi o que a revisão da Story 3.4 encontrou em
 * `herancaDoFormulario`. `verificar:editor` monta o cartão sem herança e cobra
 * esta frase, para o ramo não ficar sem ser exercido.
 */
export const DEFEITO_SEM_HERANCA =
  "O cartão não pôde ser montado: a herança não chegou à Prévia. " +
  "É defeito de montagem: quem desenha o cartão precisa receber a decisão do domínio.";

/**
 * O nome de gente de cada campo que a cadeia pode recusar.
 *
 * `recusadas` traz o nome da COLUNA — e a coluna da capa não é campo de SEO,
 * então `ROTULOS_DE_SEO` sozinho deixaria a recusa da capa aparecer no cartão
 * como `imagem_url`. O rótulo dela vem do domínio, o mesmo que a gaveta desenha
 * no campo.
 */
const ROTULO_DO_CAMPO_RECUSADO = Object.freeze({
  ...ROTULOS_DE_SEO,
  imagem_url: ROTULO_DA_CAPA,
});

/** Os campos que podem aparecer numa recusa da cadeia — lista fechada. */
export const CAMPOS_COM_RECUSA = Object.freeze([...CAMPOS_DE_SEO, "imagem_url"]);

/* CONFERIDA NO CARREGAMENTO, e LANÇA, como a partição do domínio. */
{
  const semRotulo = CAMPOS_COM_RECUSA.filter(
    (campo) => typeof ROTULO_DO_CAMPO_RECUSADO[campo] !== "string",
  );
  const sobrando = Object.keys(ROTULO_DO_CAMPO_RECUSADO).filter(
    (campo) => !CAMPOS_COM_RECUSA.includes(campo),
  );
  if (semRotulo.length > 0 || sobrando.length > 0) {
    throw new Error(
      "Todo campo recusável precisa de um rótulo em palavras de gente: " +
        `sem rótulo [${semRotulo.join(", ")}], fora da lista [${sobrando.join(", ")}].`,
    );
  }
}

/**
 * As recusas da cadeia, prontas para o cartão desenhar — `{campo, rotulo,
 * motivo}`.
 *
 * Ela LÊ `metadados.recusadas` e não julga nada: o motivo é a frase que o
 * domínio nomeou, e o rótulo sai da tabela fechada acima. Uma recusa de campo
 * desconhecido continua aparecendo, com o nome cru — sumir com ela seria o
 * silêncio que a lista de recusas existe para não ter.
 */
export function recusasDoCartao(metadados) {
  const recusadas = metadados?.recusadas;
  if (!Array.isArray(recusadas)) return [];
  return recusadas
    .filter((r) => typeof r?.motivo === "string" && r.motivo !== "")
    .map((r) =>
      Object.freeze({
        campo: String(r.campo ?? ""),
        rotulo: ROTULO_DO_CAMPO_RECUSADO[r.campo] ?? String(r.campo ?? ""),
        motivo: r.motivo,
      }),
    );
}

/** O rótulo de cada campo, do DOMÍNIO — a gaveta não inventa nome de campo. */
export { ROTULOS_DE_SEO };
