/**
 * A configuração do editor da Descrição da Vaga: a ligação fina entre o
 * vocabulário reduzido e o núcleo comum (Story 5.4).
 *
 * O núcleo (`src/admin/comum/configuracaoDoEditor.js`) traduz um vocabulário
 * em extensões do Tiptap e em controles da barra, e não conhece domínio. Aqui
 * Carreiras entrega a ele `VOCABULARIO_DA_VAGA`, a projeção reduzida do schema
 * do Blog com as frases da vaga: parágrafo, títulos 2 e 3, negrito, itálico,
 * as duas listas, link e quebra de linha. Nada de citação, código, imagem,
 * destaque, alinhamento nem linha divisória, porque a projeção não os tem.
 *
 * **Criada UMA vez, no topo do módulo.** A barra memoriza os controles pela
 * identidade de `controlesDaBarra`: uma configuração criada a cada render
 * refaria a lista e perderia o lugar do `tabindex` rotativo a cada tecla.
 *
 * **Por que `.js` com imports relativos e extensão.** Sem React e sem o
 * resolvedor do Vite, o Node importa este arquivo, e a verificação prova a
 * derivação executando em vez de lendo.
 */

import { VOCABULARIO_DA_VAGA } from "../../domain/carreiras/descricao.js";
import { criarConfiguracaoDoEditor } from "../comum/configuracaoDoEditor.js";

/** A configuração inteira, para a barra comum receber como `configuracao`. */
export const configuracaoDaDescricao = criarConfiguracaoDoEditor(VOCABULARIO_DA_VAGA);

/** As extensões do editor da Descrição, derivadas do vocabulário reduzido. */
export const extensoesDaDescricao = configuracaoDaDescricao.extensoesDoEditor;

/** As opções do editor. O rótulo padrão é o do vocabulário ("Descrição da vaga"). */
export const opcoesDaDescricao = configuracaoDaDescricao.opcoesDoEditor;

/** Um controle por elemento do vocabulário reduzido, na ordem declarada. */
export const controlesDaDescricao = configuracaoDaDescricao.controlesDaBarra;

/** A projeção tem imagem? Não: a barra não oferece o envio. */
export const comImagem = configuracaoDaDescricao.comImagem;

/** A projeção tem destaque de cor? Não: a barra não oferece a paleta. */
export const comDestaque = configuracaoDaDescricao.comDestaque;
