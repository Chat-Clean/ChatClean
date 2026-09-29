/**
 * O que fazer com o conteúdo do Post que chega de fora, antes de ele entrar no
 * Editor: a ligação fina entre o schema do Post e o fabricador comum.
 *
 * O saneamento em si (validar, abrir vazio quando não é documento, avisar o
 * que saiu) mora em `src/admin/comum/conteudo.js`, que não conhece domínio
 * nenhum. Aqui o Blog entrega a ele o validador do Post, o documento vazio e as
 * frases que falam "deste post". A API é a de sempre: `prepararConteudo`.
 *
 * Vive em módulo próprio, e não dentro de `Editor.jsx`, pela mesma razão que o
 * hook de sessão vive fora do provedor: arquivo de componente que exporta
 * função perde a recarga rápida em desenvolvimento, e o lint cobra. A função
 * também é pura, e os imports são relativos e com extensão: a verificação a
 * importa e executa no Node, sem montar React nenhum.
 */

import { documentoVazio, validarDocumento } from "../../domain/blog/schema.js";
import { criarPrepararConteudo } from "../comum/conteudo.js";

/**
 * Sana o documento que chega de fora e devolve, junto, o que precisa ser dito
 * ao Autor.
 *
 * Nenhum dos dois casos é silencioso, e é essa a diferença em relação a
 * registrar no console: conteúdo que some sem aviso vira perda permanente no
 * primeiro salvamento da Story 2.5, e o Autor descobre depois de publicado.
 */
export const prepararConteudo = criarPrepararConteudo({
  // Só o documento: o vocabulário do Post é o padrão de `validarDocumento`.
  validar: (documento) => validarDocumento(documento),
  documentoVazio,
  mensagens: {
    recusado:
      "Não conseguimos ler o conteúdo gravado deste post, então o Editor abriu vazio. " +
      "Salvar agora substitui o conteúdo original: se ele importa, saia sem salvar e avise quem cuida dos dados.",
    limpo: ({ total, nomes }) =>
      `Removemos ${total} trecho(s) que este editor não guarda: ` +
      `${nomes}. ` +
      "O resto do post está aqui inteiro; salvar grava exatamente o que você está vendo.",
  },
});
