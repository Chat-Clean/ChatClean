/**
 * A configuração do editor do Post: a ligação fina entre o vocabulário do
 * Post e o núcleo comum.
 *
 * O núcleo (`src/admin/comum/configuracaoDoEditor.js`) traduz um vocabulário
 * de documento em extensões do Tiptap e em controles da barra, e não conhece
 * domínio nenhum. Este arquivo entrega a ele `VOCABULARIO_DO_POST`, declarado
 * uma vez em `src/domain/blog/schema.js`, e reexporta o resultado com os
 * MESMOS nomes e os MESMOS padrões de sempre: quem importava daqui continua
 * importando daqui, e o Blog não muda de comportamento.
 *
 *   `extensoesDoEditor()`  as extensões do editor, ligadas ou desligadas
 *                          conforme o nó ou a marca esteja no schema;
 *   `controlesDaBarra()`   um controle por elemento do schema, na ordem
 *                          declarada.
 *
 * **Por que ele é `.js` e não `.jsx`.** Sem React dentro, o Node importa e
 * executa este arquivo, e é isso que permite à verificação provar a derivação
 * rodando o código em vez de lendo o código.
 */

/* Caminho relativo com extensão, e não o apelido `@/`: é o que permite ao Node
   importar este módulo sem o resolvedor do Vite. */
import { VOCABULARIO_DO_POST } from "../../domain/blog/schema.js";
import {
  CLASSE_DA_AREA_DE_ESCRITA,
  criarConfiguracaoDoEditor,
  extensoesInstaladasPeloKit,
} from "../comum/configuracaoDoEditor.js";

export { CLASSE_DA_AREA_DE_ESCRITA, extensoesInstaladasPeloKit };

/**
 * As extensões do kit que não instalam nó nem marca, e por isso não têm o que
 * ser cruzado com o schema. Cada uma está aqui por uma decisão, e a verificação
 * exige IGUALDADE com o que o kit realmente instala: uma extensão nova, que
 * mexa no documento sem declarar vocabulário, falha a auditoria em vez de
 * entrar por omissão.
 */
export const EXTENSOES_SEM_VOCABULARIO = Object.freeze({
  dropCursor: "marca onde o bloco arrastado vai cair; não altera o documento.",
  gapCursor: "põe o cursor antes ou depois de um nó atômico — sem ele, não há como escrever acima de uma linha divisória que abre o post.",
  undoRedo: "desfazer e refazer; o Autor conta com isso e nada o substitui.",
  listKeymap: "Tab e Backspace dentro de lista; só move o que já existe.",
  trailingNode: "mantém um parágrafo no fim do documento, para haver onde clicar depois do último bloco.",
});

const doPost = criarConfiguracaoDoEditor(VOCABULARIO_DO_POST);

/** A configuração do StarterKit, derivada do schema do Post. */
export const configuracaoDoKit = doPost.configuracaoDoKit;

/** As extensões do editor do Post, na configuração derivada do schema. */
export const extensoesDoEditor = doPost.extensoesDoEditor;

/** As opções do editor que não são extensão. O rótulo padrão é "Conteúdo do post". */
export const opcoesDoEditor = doPost.opcoesDoEditor;

/** A barra flutuante deve aparecer para esta seleção? Só para texto. */
export const aBarraFlutuanteAparece = doPost.aBarraFlutuanteAparece;

/** Os rótulos de controle que não dizem o que fazem. Padrão: `ELEMENTOS`. */
export const problemasDeVozDosControles = doPost.problemasDeVozDosControles;

/** `Mod-Alt-2` → `Control+Alt+2`, para `aria-keyshortcuts`. */
export const atalhoCanonico = doPost.atalhoCanonico;

/** `Mod-Alt-2` → `Ctrl+Alt+2` (ou `⌘⌥2` no Mac). */
export const atalhoLegivel = doPost.atalhoLegivel;

/** Um controle por elemento do schema, na ordem declarada. Padrão: `ELEMENTOS`. */
export const controlesDaBarra = doPost.controlesDaBarra;

/* O que a barra precisa saber, derivado do schema do Post pelo núcleo: a barra
   lê daqui (e não de propriedades à parte), para não oferecer um controle que
   o editor não tem. */

/** O vocabulário do Post tem imagem: o botão de enviar imagem existe. */
export const comImagem = doPost.comImagem;

/** O vocabulário do Post tem destaque de cor. */
export const comDestaque = doPost.comDestaque;

/** As cores do destaque, na ordem do schema (`CORES_DE_DESTAQUE`). */
export const coresDeDestaque = doPost.coresDeDestaque;
