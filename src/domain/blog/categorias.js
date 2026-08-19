/**
 * O vocabulário fechado da APARÊNCIA de uma Categoria: cor e ícone.
 *
 * Domínio puro (AD-1): sem React, sem rede, sem armazenamento. É importado pelo
 * **servidor** (que recusa cor e ícone fora do vocabulário) e pela **tela** (que
 * oferece as opções e pinta a pílula). Essa dupla cidadania é o ponto do
 * arquivo, exatamente como em `operacoes.js`: uma segunda lista de cores no
 * servidor divergiria da do Painel no dia em que uma delas ganhasse uma entrada.
 *
 * ─── O QUE É DADO, E O QUE É VOCABULÁRIO ────────────────────────────────────
 *
 * A Categoria em si é **dado**: nome, endereço e ordem vêm do banco, e nenhuma
 * lista de Categoria existe no fonte. O que é fechado aqui é só a APARÊNCIA
 * disponível — quais cores e quais ícones um Autor pode escolher. Cor livre não
 * se mede, e contraste que não se mede é contraste que não existe.
 *
 * ─── POR QUE A COR É `var(--token)`, E NÃO CLASSE ───────────────────────────
 *
 * `bg-categoria-${cor}` é uma classe que o Tailwind não gera: ele lê o fonte
 * como texto e nunca vê a string final. Seria uma pílula sem cor nenhuma em
 * produção. O caminho é o mesmo de `estados.js` e de `PilulaDeEstado.jsx`: o
 * valor viaja como referência a token e é aplicado por `style`.
 *
 * E o valor guardado no banco é **o próprio valor CSS** — é o que o comentário
 * da coluna `categorias.cor` declara desde a Story 2.1. A lista fechada é a
 * lista desses valores; o par (fundo e tinta) é derivado dela, porque contraste
 * é propriedade de um PAR e uma cor sozinha não se mede.
 */

/**
 * O catálogo, chaveado pelo valor que fica gravado em `categorias.cor`.
 *
 * `rotulo` é a palavra que a tela oferece na escolha — sem ela a pessoa
 * escolheria entre oito strings de token. `fundo` repete a chave de propósito:
 * quem consome lê `aparencia.fundo` e não precisa saber que a chave é o fundo.
 *
 * Os oito pares estão entre 4,90:1 e 6,67:1, medidos por `verificar:fundacao`
 * sobre os tokens de `src/App.css` — e são mais do que as seis Categorias de
 * hoje, de propósito: a sétima Categoria criada no Painel precisa ter o que
 * escolher sem ninguém editar código.
 */
const CATALOGO = Object.freeze({
  "var(--categoria-verde-bg)": Object.freeze({
    rotulo: "Verde",
    sigla: "Vd",
    fundo: "var(--categoria-verde-bg)",
    tinta: "var(--categoria-verde-ink)",
  }),
  "var(--categoria-azul-bg)": Object.freeze({
    rotulo: "Azul",
    sigla: "Az",
    fundo: "var(--categoria-azul-bg)",
    tinta: "var(--categoria-azul-ink)",
  }),
  "var(--categoria-roxo-bg)": Object.freeze({
    rotulo: "Roxo",
    sigla: "Rx",
    fundo: "var(--categoria-roxo-bg)",
    tinta: "var(--categoria-roxo-ink)",
  }),
  "var(--categoria-ambar-bg)": Object.freeze({
    rotulo: "Âmbar",
    sigla: "Âm",
    fundo: "var(--categoria-ambar-bg)",
    tinta: "var(--categoria-ambar-ink)",
  }),
  "var(--categoria-rosa-bg)": Object.freeze({
    rotulo: "Rosa",
    sigla: "Rs",
    fundo: "var(--categoria-rosa-bg)",
    tinta: "var(--categoria-rosa-ink)",
  }),
  "var(--categoria-ciano-bg)": Object.freeze({
    rotulo: "Ciano",
    sigla: "Cn",
    fundo: "var(--categoria-ciano-bg)",
    tinta: "var(--categoria-ciano-ink)",
  }),
  "var(--categoria-terracota-bg)": Object.freeze({
    rotulo: "Terracota",
    sigla: "Tc",
    fundo: "var(--categoria-terracota-bg)",
    tinta: "var(--categoria-terracota-ink)",
  }),
  "var(--categoria-cinza-bg)": Object.freeze({
    rotulo: "Cinza",
    sigla: "Cz",
    fundo: "var(--categoria-cinza-bg)",
    tinta: "var(--categoria-cinza-ink)",
  }),
});

/**
 * As cores, na ordem em que a tela as oferece.
 *
 * É contra a **lista** que a conferência acontece, e não contra as chaves de um
 * objeto: com objeto, `ehCorDeCategoria("constructor")` responderia verdadeiro
 * e a busca no catálogo devolveria uma função que ninguém declarou. É a mesma
 * armadilha que `ehOperacao` evita, e ela vale aqui porque o valor de `cor`
 * chega da rede, no corpo de um pedido de escrita.
 */
export const CORES_DE_CATEGORIA = Object.freeze(Object.keys(CATALOGO));

/** A cor de quem não escolheu nenhuma. Neutra de propósito. */
export const COR_PADRAO = "var(--categoria-cinza-bg)";

/** `true` apenas para uma das cores do vocabulário. Não lança. */
export function ehCorDeCategoria(valor) {
  return typeof valor === "string" && CORES_DE_CATEGORIA.includes(valor);
}

/**
 * O par de cor: `{ rotulo, fundo, tinta }`.
 *
 * **Lança** para valor fora do vocabulário, pela mesma razão que
 * `aparenciaDoEstado` lança: devolver um par neutro produziria uma pílula que
 * ninguém consegue explicar meses depois. Quem lê dado do banco e não quer
 * lançar usa `aparenciaDaCategoria`, que trata ausência como ausência.
 */
export function aparenciaDaCor(cor) {
  if (!ehCorDeCategoria(cor)) {
    throw new Error(
      `Cor de Categoria desconhecida: ${JSON.stringify(cor)}. ` +
        `O vocabulário é fechado — os únicos valores são: ${CORES_DE_CATEGORIA.join(", ")}.`,
    );
  }
  return CATALOGO[cor];
}

/**
 * O par de cor de uma linha de `categorias`, tolerante ao que o banco tem.
 *
 * Categoria sem cor é caso normal: a coluna nasce com `''` e uma Categoria
 * criada antes desta story não escolheu nada. Aqui isso vira a cor padrão, e
 * não exceção — uma listagem inteira não pode cair por causa de uma linha.
 * Valor PRESENTE e fora do vocabulário também cai no padrão: quem recusa é a
 * escrita, no servidor, onde ainda dá para dizer o que houve.
 */
export function aparenciaDaCategoria(categoria) {
  const cor = categoria?.cor;
  return ehCorDeCategoria(cor) ? CATALOGO[cor] : CATALOGO[COR_PADRAO];
}

/* ─── O ícone ────────────────────────────────────────────────────────────── */

/**
 * As chaves de ícone, e nada além das chaves.
 *
 * O DESENHO mora em `src/admin/blog/iconesDeCategoria.js`, que importa
 * `lucide-react` e por isso não pode ser importado pelo servidor — a função de
 * escrita roda em Node e não tem React. O que o servidor precisa é só da lista
 * fechada, e é ela que mora aqui.
 *
 * A igualdade entre esta lista e as chaves daquele mapa é cobrada **nos dois
 * sentidos** pela verificação, executando: chave órfã falha, chave faltando
 * falha. É o mesmo desenho de `icones.js` e do schema do Editor.
 *
 * As chaves nomeiam o DESENHO, não a Categoria: uma Categoria chamada
 * "Novidades" pode escolher a faísca, e uma chamada "Automação" pode escolher o
 * robô — mas nada obriga. Chave com nome de Categoria seria a lista fixa de
 * Categorias voltando pela porta dos fundos.
 */
export const CHAVES_DE_ICONE_DE_CATEGORIA = Object.freeze([
  "etiqueta",
  "pasta",
  "faisca",
  "alvo",
  "grafico",
  "robo",
  "subindo",
  "chip",
  "conversa",
  "livro",
  "raio",
  "estrela",
]);

/** O ícone de quem não escolheu nenhum. */
export const ICONE_PADRAO = "etiqueta";

/** `true` apenas para uma das chaves do mapa fechado. Não lança. */
export function ehChaveDeIconeDeCategoria(valor) {
  return (
    typeof valor === "string" && CHAVES_DE_ICONE_DE_CATEGORIA.includes(valor)
  );
}

/**
 * A chave de ícone de uma linha de `categorias`, tolerante como a cor.
 *
 * Ausente ou desconhecida vira a padrão: a listagem não pode cair por causa de
 * uma linha, e o desenho errado é menos grave que a tela em branco.
 */
export function iconeDaCategoria(categoria) {
  const chave = categoria?.icone;
  return ehChaveDeIconeDeCategoria(chave) ? chave : ICONE_PADRAO;
}

/* ─── O nome ─────────────────────────────────────────────────────────────── */

/** O teto de `categorias_nome_nao_vazio`, no banco. Escrito uma vez. */
export const TAMANHO_MAXIMO_DO_NOME_DE_CATEGORIA = 120;

/**
 * O teto da coluna `ordem`.
 *
 * Não é limite de produto: é o que impede um inteiro absurdo de chegar ao banco
 * para ser recusado como erro de tipo em vez de como campo mal preenchido. Mil
 * posições é uma ordem de grandeza acima de qualquer blog com categorias que
 * uma pessoa consiga ler.
 *
 * **Ele mora no DOMÍNIO pela mesma razão que a cor e o ícone.** A tela aceitava
 * quatro dígitos (9999) e o servidor recusava acima de 1000: digitar 5000
 * passava no formulário e voltava recusado da rede, sobre um campo que a tela
 * tinha acabado de aprovar. Dois tetos para o mesmo campo é o mesmo defeito que
 * duas grafias de uma operação.
 */
export const ORDEM_MAXIMA_DA_CATEGORIA = 1000;

/**
 * O que impede este valor de ser uma `ordem`, ou `null`.
 *
 * Aceita inteiro e texto de dígitos, e **nada mais**: `Number(true)` é 1 e
 * `Number([5])` é 5 — os dois passariam por `Number.isInteger` e virariam
 * coluna. Lista de permissão frouxa num campo que vem da rede é lista de
 * permissão nenhuma.
 *
 * Devolve `{ ok: true, ordem }` quando serve.
 */
export function lerOrdemDeCategoria(bruto) {
  const ehTextoDeDigitos = typeof bruto === "string" && /^[0-9]{1,7}$/.test(bruto.trim());
  const ehInteiro = typeof bruto === "number" && Number.isInteger(bruto);
  if (!ehTextoDeDigitos && !ehInteiro) {
    return {
      ok: false,
      motivo: `A ordem da categoria é um número inteiro de 0 a ${ORDEM_MAXIMA_DA_CATEGORIA}.`,
    };
  }
  const ordem = ehInteiro ? bruto : Number(bruto.trim());
  if (ordem < 0 || ordem > ORDEM_MAXIMA_DA_CATEGORIA) {
    return {
      ok: false,
      motivo: `A ordem da categoria é um número inteiro de 0 a ${ORDEM_MAXIMA_DA_CATEGORIA}.`,
    };
  }
  return { ok: true, ordem };
}

/**
 * O que impede este texto de ser nome de Categoria, ou `null`.
 *
 * Devolve a FRASE, e não um booleano, pela razão de `problemaNoSlug`: a tela
 * precisa dizer o que está errado, e o servidor precisa recusar com a mesma
 * frase. Uma regra, dois consumidores.
 */
export function problemaNoNomeDeCategoria(valor) {
  if (typeof valor !== "string" || valor.trim() === "") {
    return "A categoria precisa de um nome.";
  }
  const limpo = valor.trim();
  if (limpo.length > TAMANHO_MAXIMO_DO_NOME_DE_CATEGORIA) {
    return `O nome da categoria passa de ${TAMANHO_MAXIMO_DO_NOME_DE_CATEGORIA} caracteres. Encurte antes de salvar.`;
  }
  return null;
}

/**
 * O nome normalizado: aparado, com espaço interno colapsado.
 *
 * "Estratégia " e "Estratégia" são a mesma Categoria para quem lê, e a
 * unicidade do banco é sobre o texto exato — sem a normalização, as duas
 * conviveriam no menu como se fossem coisas diferentes.
 */
export function normalizarNomeDeCategoria(valor) {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
}
