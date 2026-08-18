/**
 * O endereço do Post: como ele nasce do título, e o que o torna válido.
 *
 * Domínio puro (AD-1): nenhuma dependência de React, de Supabase ou de DOM. É
 * importável e executável fora do navegador, e é por isso que ele nasce aqui e
 * não dentro da tela de edição.
 *
 * **Por que a geração é domínio, e não um `slugify` dentro do formulário.**
 * Três lugares precisam concordar sobre o que é um endereço válido: a tela, que
 * gera e deixa editar; a função de escrita, que recusa o que o banco não
 * aceitaria; e a verificação, que precisa EXECUTAR a regra em vez de ler o
 * texto dela. Uma cópia em cada lugar são três regras parecidas, e a primeira a
 * divergir divergirá em silêncio — o endereço gerado passando na tela e sendo
 * recusado na gravação, com o Autor lendo "endereço inválido" sobre um endereço
 * que ele não escreveu.
 *
 * **O Slug é gerado uma vez, na criação, e depois é do Post.** Esta regra não
 * mora aqui — mora em quem chama —, mas a razão dela explica por que este
 * módulo separa `gerarSlug` de `problemaNoSlug`: gerar é um ato da criação;
 * validar acontece toda vez. Depois que um Post foi compartilhado, o endereço é
 * uma promessa a quem guardou o link, e corrigir uma palavra do título não pode
 * quebrá-la.
 */

/**
 * O formato que o banco impõe em `posts_slug_formato` — minúsculas ASCII,
 * dígitos e hífen simples entre segmentos. Nem hífen no começo, nem no fim, nem
 * dois seguidos.
 *
 * Declarado aqui porque é regra de domínio, e não detalhe de transporte: a
 * camada de dados (`data/blog/comum.js`), o núcleo da escrita e a restrição do
 * banco espelham este formato, e a verificação compara os quatro.
 */
export const FORMATO_DE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** O comprimento máximo de `posts.slug` e de `slugs_antigos.slug` no banco. */
export const TAMANHO_MAXIMO_DO_SLUG = 200;

/**
 * As letras que **não decompõem** em ASCII + acento.
 *
 * `á` é `a` mais um acento combinante e some na normalização; `ø` e `ß` não —
 * eles são letras próprias no Unicode, sem parte ASCII para sobrar. Sem este
 * mapa, "Zurique" continua funcionando (o trema decompõe) mas "Søren" vira
 * `s-ren`, com um buraco no meio da palavra. São poucas, e são as que de fato
 * aparecem em nome próprio e em termo técnico emprestado.
 */
const LETRAS_SEM_DECOMPOSICAO = Object.freeze({
  "æ": "ae", // æ
  "œ": "oe", // œ
  "ø": "o", // ø
  "ß": "ss", // ß
  "đ": "d", // đ
  "ð": "d", // ð
  "þ": "th", // þ
  "ł": "l", // ł
  "ħ": "h", // ħ
  "ŋ": "n", // ŋ
  "ı": "i", // ı
  // O `&` é palavra, não pontuação: "Pesquisa & Desenvolvimento" sem isto vira
  // `pesquisa-desenvolvimento`, que lê como se algo tivesse sumido no meio.
  "&": " e ",
});

/**
 * As marcas combinantes que a decomposição produz (U+0300–U+036F).
 *
 * Construída a partir dos PONTOS DE CÓDIGO, e não escrita como literal: acento
 * combinante solto dentro de um literal de expressão regular é invisível na
 * revisão — não há como olhar para o arquivo e dizer qual faixa está ali.
 */
const COMBINANTES = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * O endereço gerado a partir de um título.
 *
 * Devolve `{ ok: true, slug }` ou `{ ok: false, motivo }` — **nunca lança**,
 * porque ela roda a cada tecla enquanto o Autor digita o título, e uma exceção
 * ali derrubaria a tela no meio de uma palavra.
 *
 * O passo a passo é o que a story descreve, na ordem em que ela o descreve:
 * normaliza o acento, baixa a caixa, troca o que não é letra nem número por
 * hífen, colapsa e apara os hífens, e recusa resultado vazio.
 *
 * **Título só com símbolos não vira endereço vazio.** `"!!! ???"` não tem uma
 * letra nem um dígito: o resultado seria a string vazia, que o banco recusa por
 * `posts_slug_nao_vazio` — depois de o Autor ter escrito o artigo inteiro. A
 * recusa acontece aqui, com o motivo, enquanto ainda dá para escolher outro
 * título ou digitar o endereço à mão.
 */
export function gerarSlug(titulo) {
  if (typeof titulo !== "string") {
    return {
      ok: false,
      motivo: "O endereço é gerado do título, e o título ainda não é texto.",
    };
  }

  let texto = titulo;
  for (const [de, para] of Object.entries(LETRAS_SEM_DECOMPOSICAO)) {
    // Caixa alta e baixa: `Ø` e `ø` são caracteres diferentes, e a redução de
    // caixa só acontece depois — trocar as duas aqui evita um mapa com o dobro
    // de linhas dizendo a mesma coisa.
    texto = texto.split(de).join(para).split(de.toUpperCase()).join(para);
  }

  const semAcento = texto.normalize("NFD").replace(COMBINANTES, "");
  const bruto = semAcento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (bruto === "") {
    return {
      ok: false,
      motivo:
        "Este título não tem nenhuma letra ou número para virar endereço. " +
        "Acrescente uma palavra ao título, ou digite o endereço à mão.",
    };
  }

  /* O corte vem ANTES do aparo final, e nunca no meio de um hífen: cortar em
     200 caracteres exatos pode deixar um `-` na ponta, e `posts_slug_formato`
     recusa hífen final. Aparar depois de cortar é o que faz o teto e o formato
     conviverem sem que um deles precise ceder. */
  const slug = bruto.slice(0, TAMANHO_MAXIMO_DO_SLUG).replace(/-+$/g, "");

  if (slug === "") {
    return {
      ok: false,
      motivo:
        "O começo deste título não tem letra nem número suficientes para virar endereço.",
    };
  }

  return { ok: true, slug };
}

/**
 * O que impede este valor de ser um endereço, ou `null` quando nada impede.
 *
 * Devolve a FRASE, e não um booleano, porque a tela precisa dizer o que está
 * errado: "endereço inválido" diante de `Meu Post` manda a pessoa adivinhar se
 * o problema é a maiúscula, o espaço, ou os dois.
 */
export function problemaNoSlug(valor) {
  if (typeof valor !== "string" || valor.trim() === "") {
    return "O endereço do post não pode ficar vazio.";
  }
  const limpo = valor.trim();
  if (limpo.length > TAMANHO_MAXIMO_DO_SLUG) {
    return `O endereço passa de ${TAMANHO_MAXIMO_DO_SLUG} caracteres. Encurte antes de salvar.`;
  }
  if (!FORMATO_DE_SLUG.test(limpo)) {
    return (
      "O endereço aceita apenas letras minúsculas sem acento, números e hífen " +
      "entre palavras — sem espaço, sem acento e sem hífen no começo ou no fim."
    );
  }
  return null;
}

/** Atalho booleano de `problemaNoSlug`, para quem só precisa decidir. */
export function ehSlug(valor) {
  return problemaNoSlug(valor) === null;
}
