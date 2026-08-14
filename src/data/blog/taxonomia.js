/**
 * Leitura de Categorias e de Tags.
 *
 * Ambas pelo cliente PÚBLICO, e por um motivo de produto: o filtro do Blog
 * Público precisa da lista inteira antes de qualquer Post ser lido — abrir a
 * página com o filtro vazio enquanto os posts carregam é o defeito que isso
 * evita. O Painel usa as mesmas listas: Categoria e Tag são vocabulário
 * público, não dado restrito.
 *
 * A visibilidade continua sendo decidida no banco: `categorias` é legível por
 * todos, e `tags` só devolve tag associada a algum Post visível — derivação
 * escrita uma vez, na política, nunca repetida aqui.
 */

import {
  clientePublicoOuFalha,
  deslocamentoValido,
  limiteValido,
} from "./comum.js";
import {
  consultar,
  descrever,
  ehFaixaAlemDoFim,
  exigirLista,
  sinalDePrazo,
  sucesso,
} from "./resultado.js";

export const COLUNAS_DA_CATEGORIA = Object.freeze([
  "id",
  "nome",
  "slug",
  "icone",
  "cor",
  "ordem",
]);

export const COLUNAS_DA_TAG = Object.freeze(["id", "nome", "slug"]);

/** Formato mínimo comum às duas: identificador, nome e slug. */
function problemaNoVerbete(linha) {
  if (linha === null || typeof linha !== "object" || Array.isArray(linha)) {
    return `esperava um objeto e veio ${descrever(linha)}`;
  }
  if (typeof linha.id !== "string" || linha.id === "") return "`id` ausente";
  if (typeof linha.nome !== "string" || linha.nome === "") return "`nome` ausente";
  if (typeof linha.slug !== "string" || linha.slug === "") return "`slug` ausente";
  return null;
}

/**
 * Categoria e Tag são listas curtas por natureza, mas "curta por natureza" é
 * uma expectativa, não uma garantia: o mesmo teto de `posts` vale aqui, pelo
 * mesmo motivo, e tratar risco igual de forma diferente é como uma das duas
 * acaba sem proteção.
 */
async function listarVerbetes(operacao, tabela, colunas, ordens, { limite, deslocamento }) {
  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const tamanho = limiteValido(limite);
  const inicio = deslocamentoValido(deslocamento);

  const resposta = await consultar(operacao, () => {
    let consulta = cliente.dados.from(tabela).select(colunas.join(","));
    for (const coluna of ordens) {
      consulta = consulta.order(coluna, { ascending: true });
    }
    return consulta.range(inicio, inicio + tamanho - 1).abortSignal(sinalDePrazo());
  });
  if (!resposta.ok) {
    return ehFaixaAlemDoFim(resposta) ? sucesso([]) : resposta;
  }

  return exigirLista(resposta.dados, { operacao, validarItem: problemaNoVerbete });
}

/**
 * As Categorias, na ordem que o Painel definir (`ordem`) e, em empate, por
 * nome — para que a lista não mude de sequência entre dois carregamentos.
 */
export function listarCategorias({ limite, deslocamento } = {}) {
  return listarVerbetes(
    "listarCategorias",
    "categorias",
    COLUNAS_DA_CATEGORIA,
    ["ordem", "nome"],
    { limite, deslocamento },
  );
}

/** As Tags visíveis, em ordem alfabética. */
export function listarTags({ limite, deslocamento } = {}) {
  return listarVerbetes("listarTags", "tags", COLUNAS_DA_TAG, ["nome"], {
    limite,
    deslocamento,
  });
}
