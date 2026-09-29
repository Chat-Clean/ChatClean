/**
 * O que fazer com a Descrição que chega do banco antes de ela entrar no
 * editor: a ligação fina entre o vocabulário reduzido e o fabricador comum
 * (Story 5.4).
 *
 * O saneamento (validar, abrir vazio quando não é documento, avisar o que
 * saiu) mora em `src/admin/comum/conteudo.js`. Aqui Carreiras entrega o
 * validador da projeção (`validarDescricao`), o documento vazio e as frases
 * que falam "desta vaga". Uma Descrição gravada com citação, por exemplo,
 * abre sem ela, e quem edita é avisado em vez de descobrir depois de salvar.
 *
 * Módulo `.js`, puro, com imports relativos e extensão: a verificação o
 * importa e executa no Node.
 */

import { documentoVazio } from "../../domain/blog/schema.js";
import { validarDescricao } from "../../domain/carreiras/descricao.js";
import { criarPrepararConteudo } from "../comum/conteudo.js";

export const prepararConteudoDaDescricao = criarPrepararConteudo({
  validar: (documento) => validarDescricao(documento),
  documentoVazio,
  mensagens: {
    recusado:
      "Não conseguimos ler a descrição gravada desta vaga, então o editor abriu vazio. " +
      "Salvar agora substitui a descrição original: se ela importa, saia sem salvar e avise quem cuida dos dados.",
    limpo: ({ total, nomes }) =>
      `Removemos ${total} trecho(s) que a descrição da vaga não guarda: ` +
      `${nomes}. ` +
      "O resto da descrição está aqui inteiro; salvar grava exatamente o que você está vendo.",
  },
});
