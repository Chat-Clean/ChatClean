/**
 * Os metadados do Post, do lado da tela: quais campos existem, como eles saem
 * de um Post gravado e como voltam para a função de escrita.
 *
 * Vive em módulo próprio, e não dentro de `GavetaDeMetadados.jsx`, pela mesma
 * razão que `conteudo.js` vive fora de `Editor.jsx`: arquivo de componente que
 * exporta função perde a recarga rápida em desenvolvimento, e o lint cobra. As
 * funções também são **puras** — a verificação as importa e executa sem montar
 * React nenhum, que é a única forma de provar a regra do Slug em vez de a ler.
 */

import {
  deCampoDeInstante,
  formatarDataEHoraPorExtenso,
  paraCampoDeInstante,
} from "@/domain/blog/formato";
/* As regras da Tag digitada vêm do DOMÍNIO — as MESMAS que o servidor usa para
   normalizar o que chega pela rede. Uma segunda regra aqui faria a tela e o
   servidor discordarem sobre o que é a mesma Tag. */
import { separarTags, textoDasTags } from "@/domain/blog/tags";
/* A regra do par capa + descrição vem do DOMÍNIO, e é a MESMA que o servidor
   cobra e que `posts_imagem_exige_alt` impõe no banco desde a Story 2.1. */
/* As duas regras do par da capa vêm do DOMÍNIO — a do texto alternativo e a do
   ENDEREÇO (Story 3.2). Este módulo monta o corpo do pedido e é código puro:
   importar de um módulo de interface para saber o que é endereço aceitável
   inverteria a seta da arquitetura, e a regra é a MESMA que o servidor cobra e
   que a restrição do banco espelha em SQL. */
import {
  problemaNoEnderecoDaImagem,
  problemaNoTextoAlternativo,
} from "@/domain/blog/arquivos";
/* O teto de HIGIENE dos campos de SEO vem do DOMÍNIO (Story 3.4), pela mesma
   razão: é o mesmo número que o servidor cobra e que a restrição do banco
   impõe, e o comprimento USUAL — o que o contador sinaliza — não entra aqui,
   porque ele nunca bloqueia. */
import {
  CAMPOS_DE_SEO,
  CAMPOS_DE_TEXTO_DE_SEO,
  CAMPO_DE_IMAGEM_DE_SEO,
  problemaNoTextoDeSeo,
} from "@/domain/blog/compartilhamento";

/**
 * Os ONZE campos da gaveta, na ordem em que ela os oferece.
 *
 * A ordem é significativa e está declarada uma vez: Título e Slug primeiro
 * porque um gera o outro; Resumo em seguida porque é o segundo obrigatório; e a
 * classificação depois, porque ela é escolha e não escrita.
 *
 * A CAPA entra entre Resumo e Categoria (Story 3.1) porque ela é CONTEÚDO: o
 * que o Post diz de si mesmo, não como ele é classificado. E a descrição vem
 * colada nela, e não num bloco de acessibilidade lá embaixo — o banco recusa
 * capa sem descrição, e oferecer as duas separadas produziria a recusa tardia
 * que a story existe para não ter.
 *
 * OS TRÊS CAMPOS DE SEO (Story 3.4) vêm por ÚLTIMO, numa seção própria, e a
 * posição é a decisão: eles não descrevem o Post, descrevem como ele APARECE
 * fora do site — e todos os três são opcionais, porque vazio não é falta,
 * vazio herda. Pô-los no meio dos obrigatórios faria a pessoa que desce a
 * gaveta preenchendo tudo achar que parou de preencher algo necessário.
 */
export const CAMPOS_DA_GAVETA = Object.freeze([
  "titulo",
  "slug",
  "resumo",
  "imagem_url",
  "imagem_alt",
  "categoria_id",
  "tags",
  "tempo_leitura",
  /* Espalhados do DOMÍNIO: a ordem entre eles é a de lá, e a lista não é
     escrita de novo em cada camada. */
  ...CAMPOS_DE_SEO,
]);

/**
 * `publicado_em` NÃO está em `CAMPOS_DA_GAVETA`.
 *
 * Ele continua sendo um valor do Post — `valoresVazios`, `valoresDoPost` e
 * `corpoDoPedido` continuam lendo e escrevendo a chave —, mas deixou de ter
 * campo próprio na gaveta (correção de UI/UX do Editor): ele era redundante
 * com o botão "Agendar publicação" da tela, que hoje abre um modal para o
 * mesmo dado. `CAMPOS_DA_GAVETA` é "o que a gaveta desenha, na ordem"; um
 * valor que não tem mais controle ali não pertence à lista.
 */

/**
 * Os que a gravação exige.
 *
 * A lista existe aqui **e** na função de servidor, e as duas são comparadas pela
 * verificação: a tela precisa saber o que marcar como obrigatório antes de
 * mandar, e o servidor precisa recusar de qualquer jeito — inclusive de quem não
 * passou pela tela.
 */
export const CAMPOS_OBRIGATORIOS = Object.freeze(["titulo", "resumo"]);

/**
 * A frase de cada campo que falta.
 *
 * Uma por campo, e não uma genérica: "preencha os campos obrigatórios" obriga a
 * pessoa a percorrer a gaveta procurando qual é. `conteudo` está aqui mesmo não
 * sendo campo da gaveta porque a função de servidor pode nomeá-lo como faltante,
 * e a tela precisa ter o que dizer quando isso acontecer.
 */
export const FRASES_DE_FALTA = Object.freeze({
  titulo: "O título é obrigatório: é ele que nomeia o post na listagem e no site.",
  resumo: "O resumo é obrigatório: é ele que aparece no cartão da listagem e na busca.",
  slug: "O endereço é obrigatório: é por ele que o post é encontrado no site.",
  conteudo: "O post precisa de conteúdo antes de ser salvo.",
  /* Agendar sem data é o único caso em que a gaveta marca este campo, e até a
     Story 2.9 a marca apontava, por `aria-describedby`, para um parágrafo que
     não existia: quem usa leitor de tela ouvia o campo ser inválido e não
     recebia motivo nenhum. */
  publicado_em:
    "Para agendar, informe o dia e a hora em que o post deve ir ao ar, o horário é o de Brasília.",
  /* Story 3.1. A frase é a MESMA de `problemaNoTextoAlternativo`, e a
     verificação compara as duas: duas grafias seriam duas explicações para a
     mesma recusa, uma na gaveta e outra na notificação. */
  imagem_alt:
    "A capa precisa de uma descrição: é ela que quem não enxerga a imagem recebe no lugar dela.",
});

/** A gaveta de um Post que ainda não existe. */
export function valoresVazios() {
  return {
    titulo: "",
    slug: "",
    resumo: "",
    /* A capa é ENDEREÇO, e o endereço é o que a tela guarda: o arquivo já
       está no bucket quando este campo deixa de ser vazio. */
    imagem_url: "",
    imagem_alt: "",
    categoria_id: "",
    /* TEXTO, e não lista: o campo é digitado, e um valor normalizado a cada
       tecla impediria de escrever a vírgula que separa a próxima tag. Quem
       transforma texto em lista é `separarTags`, na hora de montar o pedido. */
    tags: "",
    publicado_em: "",
    tempo_leitura: "",
    /* OS TRÊS DE SEO (Story 3.4), todos opcionais. Vazio aqui não é campo por
       preencher: é o pedido explícito de HERDAR o título do Post, o Resumo e a
       Imagem de Capa — e a gaveta mostra o que será herdado ao lado de cada um,
       para que a herança se confira antes de publicar em vez de depois. */
    ...Object.fromEntries(CAMPOS_DE_SEO.map((campo) => [campo, ""])),
  };
}

/**
 * Os valores da gaveta a partir de uma linha de `posts`.
 *
 * Tudo vira **texto**, inclusive o número: um campo controlado do React com
 * `value={null}` passa a não controlado no meio da digitação, e o aviso disso
 * aparece no console muito depois de o defeito ter acontecido.
 *
 * `publicado_em` é o único que converte, e converte para hora de parede em São
 * Paulo — é o que o campo de data e hora mostra. O instante em UTC continua
 * sendo o que está gravado.
 */
export function valoresDoPost(post, tags = []) {
  if (post === null || typeof post !== "object") return valoresVazios();
  return {
    titulo: typeof post.titulo === "string" ? post.titulo : "",
    slug: typeof post.slug === "string" ? post.slug : "",
    resumo: typeof post.resumo === "string" ? post.resumo : "",
    imagem_url: typeof post.imagem_url === "string" ? post.imagem_url : "",
    imagem_alt: typeof post.imagem_alt === "string" ? post.imagem_alt : "",
    categoria_id: typeof post.categoria_id === "string" ? post.categoria_id : "",
    // As Tags do Post viram o TEXTO do campo, na forma que `separarTags` lê
    // de volta sem mudar nada — é o que faz abrir e fechar o Editor sem tocar
    // em nada não acusar pendência.
    tags: textoDasTags(tags),
    publicado_em: post.publicado_em ? paraCampoDeInstante(post.publicado_em) : "",
    tempo_leitura:
      Number.isFinite(Number(post.tempo_leitura)) && Number(post.tempo_leitura) > 0
        ? String(post.tempo_leitura)
        : "",
    /* Story 3.4. Sem estas três linhas, reabrir um Post que TEM campos de SEO
       gravados abriria com os três em branco — e o primeiro salvamento os
       apagaria, porque `corpoDoPedido` manda `null` para campo vazio. É o
       mesmo defeito destrutivo que a revisão da Story 3.1 pegou na capa. */
    ...Object.fromEntries(
      CAMPOS_DE_SEO.map((campo) => [
        campo,
        typeof post[campo] === "string" ? post[campo] : "",
      ]),
    ),
  };
}

/**
 * O corpo do pedido de gravação.
 *
 * Devolve `{ ok: true, corpo }` ou `{ ok: false, campo, motivo }` — a recusa
 * nomeia o CAMPO para que a gaveta possa apontá-lo, em vez de a tela mostrar uma
 * frase solta no rodapé.
 *
 * **`estado` é o DESTINO da ação escolhida** (Story 2.8), e não um campo da
 * gaveta: ele vem da máquina de transições, que é quem sabe para onde cada ação
 * leva. Omiti-lo é dizer ao servidor "fique onde está". Quem decide se a
 * mudança é permitida é o servidor, contra a mesma máquina — a tela não oferecer
 * o botão é conveniência, não garantia.
 *
 * Autor continua de fora: ele é resolvido no servidor, sempre.
 */
export function corpoDoPedido({
  id = null,
  valores,
  documento,
  estado = null,
  /* ─── QUANDO AS TAGS NÃO PODEM SER ENVIADAS ─────────────────────────────
     A leitura das Tags do Post pode falhar. O aviso na tela era a única
     proteção — e aviso não impede salvar: `tags` sempre viajava, o campo
     estava vazio, e o servidor lê lista vazia como "apague todas". A proteção
     precisa ser ESTRUTURAL: campo ausente é "preserva o que está lá", e é
     exatamente isso que a função de servidor faz com `tags` indefinido. */
  omitirTags = false,
}) {
  const v = valores ?? valoresVazios();

  let publicado_em = null;
  try {
    publicado_em = deCampoDeInstante(v.publicado_em);
  } catch (erro) {
    return {
      ok: false,
      campo: "publicado_em",
      motivo:
        "A data de publicação não é um momento válido. Informe dia e hora, o horário é o de Brasília.",
      detalhe: String(erro?.message ?? erro),
    };
  }

  const minutos = String(v.tempo_leitura ?? "").trim();
  if (minutos !== "" && !/^\d{1,4}$/.test(minutos)) {
    return {
      ok: false,
      campo: "tempo_leitura",
      motivo: "O tempo de leitura é um número inteiro de minutos.",
    };
  }

  /* AS TAGS DIGITADAS. Recusa antes de o pedido sair, e a recusa NOMEIA a Tag
     que não serve: uma tag vazia entre duas vírgulas some sozinha (é o jeito
     normal de digitar uma lista), mas uma tag longa demais ou sem letra nenhuma
     é escolha da pessoa, e descartá-la em silêncio faria ela salvar cinco tags e
     reabrir com quatro. */
  const tags = separarTags(v.tags);
  if (!omitirTags && tags.problemas.length > 0) {
    return { ok: false, campo: "tags", motivo: tags.problemas.join(" ") };
  }

  /* ── A CAPA E A DESCRIÇÃO, COMO PAR (Story 3.1) ─────────────────────────
     A recusa acontece ANTES de o pedido sair, e nomeia o campo `imagem_alt`
     para a gaveta poder marcá-lo. O servidor recusa do mesmo jeito e o banco
     recusa depois dele — o que se ganha aqui é não gastar uma viagem, e não
     mostrar "o banco recusou este post" para uma descrição em branco.

     A regra é a do domínio, importada: a gaveta, este módulo, o servidor e a
     restrição do banco precisam concordar sobre o que é "capa sem descrição". */
  const imagem_url = String(v.imagem_url ?? "").trim();
  const imagem_alt = String(v.imagem_alt ?? "").trim();

  /* ── O ENDEREÇO DA CAPA, RECUSADO ANTES DO SALVAMENTO (Story 3.2) ──────
     Com o campo de endereço aberto à digitação, o que chega aqui pode ser
     qualquer coisa — `data:`, `javascript:`, um caminho relativo, um endereço
     de 4 mil caracteres. A recusa acontece AQUI, nomeando o campo, e nunca
     como violação crua vinda do banco: `violates check constraint
     posts_imagem_url_e_endereco` não é uma frase que alguém entenda.

     A regra é a do DOMÍNIO — a mesma que o servidor cobra e que a restrição do
     banco espelha. Não há segunda regra aqui, e a frase é a mesma que a gaveta
     mostra embaixo do campo. */
  const problemaNoEndereco = problemaNoEnderecoDaImagem(imagem_url);
  if (problemaNoEndereco !== null) {
    return { ok: false, campo: "imagem_url", motivo: problemaNoEndereco };
  }

  const problemaNaCapa = problemaNoTextoAlternativo(imagem_alt, {
    temCapa: imagem_url !== "",
  });
  if (problemaNaCapa !== null) {
    return { ok: false, campo: "imagem_alt", motivo: problemaNaCapa };
  }

  /* ── OS TRÊS CAMPOS DE SEO, RECUSADOS ANTES DO SALVAMENTO (Story 3.4) ──
     O que se cobra aqui é o TETO DE HIGIENE, e só ele. O comprimento usual —
     os ~60 e ~155 que o contador sinaliza — não aparece nesta função de
     propósito: ele nunca bloqueia o salvamento, e cobrá-lo aqui o
     transformaria numa recusa, que é o oposto do critério.

     A regra é a do DOMÍNIO, importada: a mesma que o servidor cobra e que
     `posts_seo_titulo_com_teto` e `posts_seo_descricao_com_teto` espelham em
     SQL. A do endereço é a MESMA da capa — não há segundo julgamento sobre o
     que é endereço aceitável. */
  const seo = {};
  for (const campo of CAMPOS_DE_TEXTO_DE_SEO) {
    const valor = String(v[campo] ?? "").trim();
    const problema = problemaNoTextoDeSeo(campo, valor);
    if (problema !== null) return { ok: false, campo, motivo: problema };
    seo[campo] = valor === "" ? null : valor;
  }
  const seoImagem = String(v[CAMPO_DE_IMAGEM_DE_SEO] ?? "").trim();
  const problemaNaImagemDeSeo = problemaNoEnderecoDaImagem(seoImagem);
  if (problemaNaImagemDeSeo !== null) {
    return { ok: false, campo: CAMPO_DE_IMAGEM_DE_SEO, motivo: problemaNaImagemDeSeo };
  }
  seo[CAMPO_DE_IMAGEM_DE_SEO] = seoImagem === "" ? null : seoImagem;

  const corpo = {
    titulo: String(v.titulo ?? "").trim(),
    slug: String(v.slug ?? "").trim(),
    resumo: String(v.resumo ?? "").trim(),
    conteudo: documento,
    categoria_id: String(v.categoria_id ?? "").trim() === "" ? null : v.categoria_id,
    /* `null` LIMPA e é o que a ausência de capa manda: campo vazio virando `""`
       faria o servidor recusar um Post sem capa nenhuma, porque `""` não é
       endereço permitido. A descrição acompanha, pelo mesmo motivo. */
    imagem_url: imagem_url === "" ? null : imagem_url,
    imagem_alt: imagem_alt === "" ? null : imagem_alt,
    /* `null` LIMPA, e limpar é HERDAR: os três campos de SEO vazios pedem ao
       Post que use o título, o Resumo e a Capa. Omiti-los faria o servidor
       PRESERVAR o que estava gravado, e aí apagar um Título SEO na tela não
       teria efeito nenhum — o campo voltaria preenchido na próxima abertura. */
    ...seo,
    publicado_em,
    tempo_leitura: minutos === "" ? 0 : Number(minutos),
  };
  /* NOMES, e não identificadores (Story 2.14): quem procura a Tag que já
     existe e cria a que falta é o servidor, pela porta única. E o campo só
     entra quando ele pode ser confiado — ausente preserva. */
  if (!omitirTags) corpo.tags = tags.nomes;
  if (id) corpo.id = id;
  if (estado) corpo.estado = estado;
  return { ok: true, corpo };
}

/**
 * Os campos vazios entre os obrigatórios, **antes** de o pedido sair.
 *
 * A função de servidor recusa do mesmo jeito, e é ela que decide de verdade —
 * inclusive para quem chama a API direto. O que esta faz é evitar a viagem: o
 * Autor que esqueceu o resumo vê a marca no campo sem esperar o servidor
 * responder.
 */
export function faltandoNaGaveta(valores) {
  const v = valores ?? {};
  return CAMPOS_OBRIGATORIOS.filter((campo) => String(v[campo] ?? "").trim() === "");
}

/**
 * A frase que CONFIRMA um agendamento, com a data por extenso.
 *
 * Recebe a linha que o servidor **gravou**, e não o que a gaveta tinha: o
 * instante gravado é o que decide quando o Post aparece, e é ele que precisa
 * ser lido de volta. Devolve `null` para qualquer coisa que não seja um Post
 * agendado com data — quem chama cai na confirmação comum, sem inventar frase.
 *
 * A data sai por extenso, com dia da semana, porque é aqui que um erro de fuso
 * fica visível ANTES de o Post ir ao ar: quem digitou 00h30 esperando terça e
 * lê "segunda-feira" vê o engano enquanto ainda dá para corrigir.
 *
 * Nunca lança: uma data que não dá para formatar vira `null`, e uma confirmação
 * sem detalhe é melhor que uma exceção logo depois de uma gravação bem
 * sucedida.
 */
export function confirmacaoDoAgendamento(post, titulo = "") {
  if (post === null || typeof post !== "object") return null;
  if (post.estado !== "agendado" || !post.publicado_em) return null;
  let porExtenso;
  try {
    porExtenso = formatarDataEHoraPorExtenso(post.publicado_em);
  } catch {
    return null;
  }
  const nome = String(titulo ?? "").trim();
  return nome === ""
    ? `Vai ao ar ${porExtenso}.`
    : `${nome} vai ao ar ${porExtenso}.`;
}

/**
 * A data de publicação em hora de parede de São Paulo, como texto legível.
 *
 * O valor de entrada é o do próprio campo (`AAAA-MM-DDTHH:MM`), que já está em
 * hora de São Paulo: reformatá-lo fecha o ciclo e mostra, na tela, que o que se
 * digita é o que se lê. Valor parcial — o navegador entrega valores incompletos
 * enquanto a pessoa digita — vira uma frase, nunca uma exceção.
 */
export function textoDaDataDoCampo(valorDoCampo) {
  if (!valorDoCampo) return "sem data de publicação";
  const casou = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(valorDoCampo));
  if (!casou) return "data incompleta";
  const [, ano, mes, dia, hora, minuto] = casou;
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}
