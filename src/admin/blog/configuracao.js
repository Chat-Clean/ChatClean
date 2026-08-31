/**
 * A ponte entre o schema fechado e o editor — derivação, nunca declaração.
 *
 * Este módulo não decide nada: ele traduz `src/domain/blog/schema.js` em duas
 * coisas que o Tiptap e o React entendem, e é o único lugar onde essa tradução
 * acontece.
 *
 *   `extensoesDoEditor()`  — as extensões do editor, ligadas ou desligadas
 *                            conforme o nó ou a marca esteja no schema.
 *   `controlesDaBarra()`   — um controle por elemento do schema, na ordem
 *                            declarada. A barra percorre esta lista; ela não
 *                            tem lista própria.
 *
 * **Por que ele é `.js` e não `.jsx`.** Sem React dentro, o Node importa e
 * executa este arquivo — e é isso que permite à verificação provar a derivação
 * rodando o código em vez de lendo o código. Uma barra escrita à mão que hoje
 * coincide com o schema é uma coincidência que a próxima mudança desfaz.
 */

import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";

/* Caminho relativo com extensão, e não o apelido `@/`: é o que a camada de
   dados já faz, e é o que permite ao Node importar este módulo sem o
   resolvedor do Vite — a condição para a verificação EXECUTAR a derivação em
   vez de ler o código. */
import {
  ALINHAMENTOS_DE_TEXTO,
  ALTERNA,
  CORES_DE_DESTAQUE,
  ELEMENTOS,
  MARCAS_PERMITIDAS,
  NIVEIS_DE_TITULO,
  NOS_PERMITIDOS,
  enderecoPermitido,
} from "../../domain/blog/schema.js";
import { diagnosticarRotuloDeAcao } from "../shell/voz.js";

/**
 * A classe da área de escrita.
 *
 * `artigo` é a classe global da Story 2.3 — a MESMA que o Blog Público e o
 * HTML servido vão vestir. O Autor escreve na aparência em que vai publicar
 * porque é literalmente o mesmo estilo, não uma imitação dele.
 *
 * **A medida do texto não aparece aqui, e isso é deliberado.** `.artigo` já
 * declara `max-width: 68ch`; redeclarar seria uma segunda fonte para a mesma
 * medida, e a que fosse esquecida numa mudança futura é a que ganharia. Como a
 * medida vive no próprio elemento e não no contêiner, recolher qualquer coisa
 * ao redor não a estica — a coluna apenas se recentraliza (`mx-auto`).
 *
 * **Sem `py`.** O invólucro em `Editor.jsx` já aplica `py-6` — o respiro
 * vertical da área de escrita. Repeti-lo aqui somava os dois, e o primeiro
 * caractere do post nascia com o dobro de respiro antes dele.
 */
export const CLASSE_DA_AREA_DE_ESCRITA =
  "artigo mx-auto w-full min-h-[24rem] px-1 focus:outline-hidden";

/**
 * O que o StarterKit instala de verdade, perguntado A ELE.
 *
 * A versão anterior mantinha à mão uma tabela de sub-extensões — exatamente a
 * segunda lista que este desenho existe para eliminar, e sem nada que a
 * comparasse com a realidade. Aqui a lista vem do próprio pacote: cada entrada
 * traz `name` (o nó, a marca ou a extensão) e `type`.
 */
export function extensoesInstaladasPeloKit() {
  const kit = StarterKit.configure({});
  return kit.config.addExtensions.call({
    options: kit.options,
    name: kit.name,
    editor: undefined,
  });
}

/**
 * O nome da extensão, quando ele difere da chave de configuração do kit.
 *
 * Só os casos em que os dois divergem. Um nome novo que não esteja aqui vira
 * uma chave que o kit ignora — e a extensão continuaria ligada. É por isso que
 * a verificação afirma, executando, que o editor montado não tem nó nem marca
 * fora do schema: esta tabela é uma conveniência, não a garantia.
 */
const CHAVE_DE_OPCAO = Object.freeze({
  doc: "document",
  dropCursor: "dropcursor",
  gapCursor: "gapcursor",
});

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

/** O nome está no schema, como nó ou como marca? */
function noSchema(nome) {
  return NOS_PERMITIDOS.includes(nome) || MARCAS_PERMITIDAS.includes(nome);
}

/**
 * A configuração do StarterKit, derivada do schema.
 *
 * Devolve um objeto simples — sem React e sem DOM — para que a verificação
 * possa afirmar sobre ele sem montar navegador nenhum.
 */
export function configuracaoDoKit() {
  const configuracao = {};

  for (const extensao of extensoesInstaladasPeloKit()) {
    // Extensão sem nó nem marca não tem vocabulário para cruzar com o schema;
    // ela é julgada pela lista declarada acima, na auditoria.
    if (extensao.type === "extension") continue;
    if (noSchema(extensao.name)) continue;
    configuracao[CHAVE_DE_OPCAO[extensao.name] ?? extensao.name] = false;
  }

  // Os níveis de título vêm do schema. É por aqui que `h1` deixa de existir no
  // editor: sem o nível na lista, o comando não existe e o `<h1>` colado não
  // encontra regra de análise — vira parágrafo em vez de virar título.
  if (configuracao.heading !== false) {
    configuracao.heading = { levels: [...NIVEIS_DE_TITULO] };
  }

  if (configuracao.link !== false) {
    configuracao.link = {
      // Clicar no link dentro do editor posiciona o cursor; não navega.
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      // O HTML do artigo não carrega classe: quem estiliza é o invólucro.
      HTMLAttributes: {},
      // A MESMA regra de endereço que a validação do domínio aplica. Duas
      // regras divergentes deixariam passar no editor o que o servidor recusa.
      isAllowedUri: (url) => enderecoPermitido(url),
      shouldAutoLink: (url) => enderecoPermitido(url),
    };
  }

  /* A LINHA QUE PREVÊ ONDE O BLOCO ARRASTADO VAI CAIR, no verde da marca.
     O padrão do `prosemirror-dropcursor` é um traço preto, e preto não é cor
     desta interface — o Painel sinaliza com `--brand-action` em todo o resto.

     A cor vai como `var(...)`, e não como o hexadecimal copiado: a extensão
     escreve o valor em `background-color` inline, e variável de CSS resolve
     ali normalmente, porque o traço nasce dentro do Painel. Assim o token
     continua sendo a fonte única — trocar a cor da marca troca esta também.
     O hexadecimal fica só como reserva, para a linha nunca sumir se a
     variável não resolver. */
  if (configuracao.dropcursor !== false) {
    configuracao.dropcursor = {
      color: "var(--brand-action, #007a2a)",
      width: 2,
    };
  }

  return configuracao;
}

/**
 * As extensões do editor, na configuração derivada do schema.
 *
 * O StarterKit já traz o atalho de teclado de oito dos treze elementos, e são
 * exatamente esses oito que declaram `atalho` no schema. Link, linha
 * divisória e os três de alinhamento declaram `null` e não ganham atalho
 * nenhum: atalho anunciado na dica e inexistente no teclado é pior que atalho
 * nenhum — e a verificação cobra a correspondência nos dois sentidos,
 * extensão por extensão.
 */
export function extensoesDoEditor() {
  return [
    StarterKit.configure(configuracaoDoKit()),
    /* `types` explícito: sem ele a extensão tenta se acoplar a QUALQUER nó
       que aceite atributo, e o schema só declara `textAlign` em `paragraph`
       e `heading` (`domain/blog/schema.js`) — os dois lugares onde a
       higienização sabe preservar o atributo. `alignments` vem da MESMA
       lista fechada que valida o atributo lá, para não haver uma segunda
       cópia que divirja dela. `defaultAlignment: "left"` é o que faz todo
       parágrafo nascer alinhado à esquerda, sem que o Autor precise clicar. */
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: [...ALINHAMENTOS_DE_TEXTO],
      defaultAlignment: "left",
    }),
    /* `inline: false`: a imagem é um nó de BLOCO, o mesmo nível de
       `horizontalRule` — é a forma que `NOS.image`/`BLOCOS`, em
       `domain/blog/schema.js`, esperam. `allowBase64: false` recusa
       `<img src="data:...">` colado: o vocabulário de `src` é
       `enderecoDeImagemPermitido`, que já não aceita `data:` — desligar o
       base64 aqui evita que o Tiptap sequer TENTE analisar um `src` que a
       validação ia derrubar de qualquer forma. Sem `HTMLAttributes` extra:
       o único CSS que estiliza a imagem é `.artigo img`, global. */
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: {},
    }),
    /* O destaque de cor. A extensão nasce com `color` como nome de atributo
       e o renderiza como `data-color` MAIS `style="background-color: …"` —
       e este projeto nunca emite `style` livre em atributo nenhum
       (`render/blog/paraHtml.js`). `addAttributes` é reescrito por inteiro
       (sem `this.parent()`, de propósito) para trocar `color` por `cor` — o
       MESMO nome que `MARCAS.highlight` declara — e para renderizar só
       `data-cor`: a aparência de cada cor mora em CSS
       (`.artigo mark[data-cor="…"]`), nunca no documento. `cor` só aceita o
       vocabulário fechado de `CORES_DE_DESTAQUE`; um valor fora dele não
       sobrevive à validação do documento (`validarDocumento`), mas a
       extensão não IMPEDE o Autor de tentar — é a mesma disciplina de
       `TextAlign`, que também confia na higienização como piso.
       `multicolor: true` é o que liga o vocabulário de atributo da
       extensão-base; sem ele `addAttributes` do pacote devolve `{}` e
       nenhuma cor sobrevive nem antes da reescrita. */
    Highlight.configure({ multicolor: true, HTMLAttributes: {} }).extend({
      addAttributes() {
        return {
          cor: {
            default: null,
            parseHTML: (elemento) => elemento.getAttribute("data-cor"),
            renderHTML: (atributos) =>
              CORES_DE_DESTAQUE.includes(atributos.cor)
                ? { "data-cor": atributos.cor }
                : {},
          },
        };
      },
    }),
  ];
}

/**
 * As opções do editor que não são extensão.
 *
 * `enablePasteRules: false` é a linha que faz "colar sem formatação" significar
 * o que diz. Com as regras de colagem ligadas, colar o texto puro `**assim**`
 * produzia negrito: o Autor pedia texto puro e recebia formatação. A formatação
 * do que é colado passa a vir exclusivamente da ESTRUTURA do HTML de origem,
 * filtrada pelo schema — nunca de caracteres no meio do texto.
 *
 * As regras de DIGITAÇÃO continuam ligadas: quem digita `## ` ganha um título
 * e a marcação não fica visível, que é o que a story pede.
 */
export function opcoesDoEditor({ rotulo = "Conteúdo do post" } = {}) {
  return {
    enablePasteRules: false,
    editorProps: {
      attributes: {
        class: CLASSE_DA_AREA_DE_ESCRITA,
        /* A área de escrita é um campo, e o nome acessível precisa chegar ao
           ELEMENTO que carrega `role="textbox"` — o `contenteditable` que o
           ProseMirror monta. Passá-lo como propriedade de `<EditorContent>`
           punha o `aria-label` no invólucro, onde não nomeia nada: o campo
           ficava sem nome e a propriedade sem efeito. É por aqui que atributo
           chega ao elemento certo. */
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": rotulo,
      },
      /* ─── O RETRATO DO ARRASTO DA IMAGEM ───────────────────────────────
         Arrastando uma imagem para reposicioná-la, o navegador desenha por
         conta própria um retrato do elemento inteiro, em tamanho real e
         TRANSLÚCIDO — e essa transparência é do sistema operacional, não uma
         propriedade de CSS: `opacity: 1` na cópia não a alcança. A única
         saída é não deixar o navegador desenhar nada.

         É o que acontece aqui: o retrato nativo vira um pixel invisível, e
         quem desenha a prévia passa a ser React (`PreviaDeArrasto`, montada
         em `Editor.jsx`), que a anima com Motion e a mantém opaca. Este
         gancho só AVISA — o evento leva o endereço da imagem e a medida —, e
         a marca em `document.body` é o que o CSS usa para sumir com a origem.

         Por que avisar por evento, e não por chamada direta: este arquivo
         precisa continuar Node-executável, sem React e sem JSX, para a
         verificação derivar a barra sem montar navegador. Um `CustomEvent`
         atravessa essa fronteira sem quebrá-la.

         `handleDOMEvents`, e não `handleDrop`/`handlePaste`: estes dois
         continuam sem manipulador próprio (o editor não intercepta colagem
         nem soltura — há asserção sobre isso em `verificar:editor`). Este
         devolve `false`, então o ProseMirror segue tratando o arrasto inteiro
         como sempre tratou — inclusive a LINHA que prevê onde a imagem cai. */
      handleDOMEvents: {
        dragstart: (_visao, evento) => {
          const alvo = evento?.target;
          const transferencia = evento?.dataTransfer;
          if (
            !alvo ||
            alvo.tagName !== "IMG" ||
            !transferencia ||
            typeof transferencia.setDragImage !== "function"
          ) {
            return false;
          }

          const medida = alvo.getBoundingClientRect();

          /* O retrato do navegador vira um pixel invisível. Ele PRECISA estar
             no documento no instante da chamada — exigência de
             `setDragImage` —, e sai no tique seguinte, depois de o navegador
             já ter tirado a foto. */
          const invisivel = document.createElement("div");
          invisivel.style.width = "1px";
          invisivel.style.height = "1px";
          invisivel.style.position = "fixed";
          invisivel.style.top = "-10000px";
          invisivel.style.left = "-10000px";
          document.body.appendChild(invisivel);
          transferencia.setDragImage(invisivel, 0, 0);
          setTimeout(() => invisivel.remove(), 0);

          document.body.setAttribute("data-arrastando-imagem", "true");
          document.dispatchEvent(
            new CustomEvent("painel:arrasto-de-imagem", {
              detail: {
                endereco: alvo.currentSrc || alvo.src || "",
                proporcao: medida.height > 0 ? medida.width / medida.height : 1,
              },
            }),
          );

          /* A limpeza vive no MESMO lugar que a marcação, e não espalhada por
             quem escuta: `dragend` sempre dispara na origem — soltando dentro,
             fora, ou cancelando com Escape —, então é ele que garante que a
             imagem volte a aparecer em qualquer desfecho. */
          const encerrar = () => {
            document.body.removeAttribute("data-arrastando-imagem");
            document.dispatchEvent(new CustomEvent("painel:arrasto-de-imagem-fim"));
            alvo.removeEventListener("dragend", encerrar);
          };
          alvo.addEventListener("dragend", encerrar);

          return false;
        },
      },
    },
  };
}

/**
 * A barra flutuante deve aparecer para esta seleção?
 *
 * Só para TEXTO. O `shouldShow` padrão da extensão pergunta apenas se a
 * seleção está vazia — e seleção de NÓ (imagem, linha divisória, o widget de
 * envio) não está vazia. A barra aparecia sobre elas oferecendo negrito,
 * título e link para coisas que não têm texto.
 *
 * As duas conferências são diferentes e as duas são necessárias:
 *
 *   - `selection.node` existe apenas em `NodeSelection` — é o jeito de
 *     reconhecê-la sem importar a classe do ProseMirror, e recusa a imagem
 *     selecionada mesmo quando há texto em volta;
 *   - `textBetween` recusa o intervalo que não tem texto NENHUM dentro, que é
 *     o caso de arrastar a seleção por cima de uma linha divisória sozinha.
 *
 * Pura e exportada de propósito: a verificação a executa com seleções
 * montadas à mão, em vez de procurar o comportamento no JSX da barra.
 */
export function aBarraFlutuanteAparece(estado) {
  const selecao = estado?.selection;
  if (!selecao || selecao.empty) return false;
  // `NodeSelection` carrega o nó escolhido; as de texto, não.
  if (selecao.node !== undefined && selecao.node !== null) return false;

  const de = selecao.from;
  const ate = selecao.to;
  if (!(ate > de)) return false;

  const texto = estado?.doc?.textBetween?.(de, ate, " ", " ") ?? "";
  return texto.trim().length > 0;
}

/* ─── A barra, derivada ──────────────────────────────────────────────────── */

/**
 * O endereço de mentira com que `podeAplicar` pergunta ao editor "aqui cabe?".
 * Precisa passar por `enderecoPermitido`, senão a pergunta seria respondida
 * pelo formato do valor em vez de pelo lugar do cursor.
 */
const SONDA_DE_CONTEXTO = "https://sonda.invalido";

/**
 * Os rótulos que não dizem o que o controle faz — a voz do Painel aplicada aos
 * elementos do schema.
 *
 * **Pura, e chamada pela VERIFICAÇÃO, não pelo render.** A versão anterior
 * chamava `exigir` dentro de `controlesDaBarra`, que roda dentro de um
 * `useMemo`: um rótulo mal redigido derrubava a árvore React inteira e deixava
 * o Painel em branco, com o trabalho em aberto junto — precisamente o desfecho
 * que o cabeçalho de `Editor.jsx` argumenta não poder acontecer. Rótulo ruim é
 * defeito de quem escreve o schema, e o lugar de cobrar quem escreve o schema
 * é a auditoria, antes de a tela existir.
 */
export function problemasDeVozDosControles(elementos = ELEMENTOS) {
  return elementos
    .map((elemento) => {
      const problema = diagnosticarRotuloDeAcao(elemento.rotulo);
      return problema === null ? null : { chave: elemento.chave, problema };
    })
    .filter((entrada) => entrada !== null);
}

/**
 * `Mod-Alt-2` → `Control+Alt+2` — a notação que `aria-keyshortcuts` exige.
 *
 * A propriedade tem gramática própria, definida pela WAI-ARIA sobre os nomes
 * de tecla do UI Events: modificadores por extenso (`Control`, `Alt`, `Shift`,
 * `Meta`), unidos por `+`. O que a pessoa LÊ na dica (`Ctrl+Alt+2`, ou `⌘⌥2`
 * num Mac) não serve aqui: `aria-keyshortcuts` é lido por software, e software
 * que recebe um símbolo tipográfico no lugar de um nome de tecla simplesmente
 * não anuncia o atalho.
 */
export function atalhoCanonico(atalho, ehMac = false) {
  if (typeof atalho !== "string" || atalho === "") return null;
  return atalho
    .split("-")
    .map((tecla) => {
      if (tecla === "Mod") return ehMac ? "Meta" : "Control";
      if (tecla === "Alt") return "Alt";
      if (tecla === "Shift") return "Shift";
      return tecla.length === 1 ? tecla.toUpperCase() : tecla;
    })
    .join("+");
}

/** `Mod-Alt-2` → `Ctrl+Alt+2` (ou `⌘⌥2` no Mac). Para os olhos, não para o leitor de tela. */
export function atalhoLegivel(atalho, ehMac = false) {
  if (typeof atalho !== "string" || atalho === "") return null;
  return atalho
    .split("-")
    .map((tecla) => {
      if (tecla === "Mod") return ehMac ? "⌘" : "Ctrl";
      if (tecla === "Alt") return ehMac ? "⌥" : "Alt";
      if (tecla === "Shift") return ehMac ? "⇧" : "Shift";
      return tecla.length === 1 ? tecla.toUpperCase() : tecla;
    })
    .join(ehMac ? "" : "+");
}

/**
 * Um controle por elemento do schema, na ordem declarada.
 *
 * `elementos` é parâmetro, e não constante lida daqui de dentro, por uma razão
 * que não é elegância: é o que permite à verificação passar a lista do schema
 * MAIS um elemento sintético e observar o controle novo nascer. Derivação que
 * não pode ser exercitada é derivação que ninguém provou.
 */
export function controlesDaBarra(elementos = ELEMENTOS, { ehMac = false } = {}) {
  return elementos.map((elemento) => {
    const atributos = elemento.atributos ?? undefined;

    return Object.freeze({
      chave: elemento.chave,
      rotulo: elemento.rotulo,
      descricao: elemento.faz,
      especie: elemento.especie,
      nome: elemento.nome,
      pede: elemento.pede ?? null,
      atalho: elemento.atalho ?? null,
      atalhoLegivel: atalhoLegivel(elemento.atalho, ehMac),
      atalhoCanonico: atalhoCanonico(elemento.atalho, ehMac),
      // Só quem alterna tem estado. A linha divisória insere e segue.
      alterna: elemento.acao === ALTERNA,

      /** O cursor está dentro deste elemento agora? */
      estaAtivo(editor) {
        if (!editor || elemento.acao !== ALTERNA) return false;
        /* `nome: null` é o alinhamento (Design Notes, `domain/blog/schema.js`):
           o atributo não troca o TIPO do nó, então travar num nome faria o
           botão acender só na metade dos blocos em que ele de fato se aplica.
           Sem nome, `isActive` procura qualquer nó com estes atributos —
           parágrafo ou título, os dois onde `textAlign` existe. */
        return elemento.nome === null
          ? editor.isActive(atributos)
          : editor.isActive(elemento.nome, atributos);
      },

      /**
       * O comando roda no estado atual? (bloco de código não aceita título)
       *
       * Quem PEDE um dado é perguntado com um valor de sonda, e não devolvido
       * como `true` por conveniência: sem isso, o botão de link ficava aceso
       * dentro de um bloco de código, o Autor digitava um endereço perfeito, a
       * aplicação falhava por CONTEXTO e a mensagem culpava o endereço.
       */
      podeAplicar(editor) {
        if (!editor) return false;
        /* `can()` SEM `focus()`. Uma pergunta não pode ter efeito colateral, e
           esta é feita dentro do seletor de `useEditorState` — ou seja, no
           caminho de render do React. `focus()` na cadeia mexia no editor
           durante o render: o React reclamava de atualização de componente
           enquanto outro renderizava, e o cursor podia sair do lugar sozinho. */
        const teste = editor.can().chain();
        const comando = teste[elemento.comando];
        if (typeof comando !== "function") return false;
        const argumentos = elemento.pede
          ? [{ [elemento.pede.propriedade]: SONDA_DE_CONTEXTO }]
          : elemento.argumentos;
        return Boolean(comando.apply(teste, argumentos).run());
      },

      /**
       * Aplica o elemento. `valor` só é usado por quem declara `pede` — hoje,
       * só o link. Valor vazio num elemento que pede significa remover.
       *
       * Devolve `true`, ou o MOTIVO da recusa — `"formato"` quando o dado não
       * serve, `"contexto"` quando o dado serve e o lugar não. Um `false` só
       * obrigaria quem chama a adivinhar qual dos dois foi, e adivinhar errado
       * é a mensagem que manda consertar o que não está quebrado.
       */
      aplicar(editor, valor) {
        if (!editor) return "contexto";

        if (elemento.pede) {
          const texto = typeof valor === "string" ? valor.trim() : "";
          const cadeiaDoPedido = editor.chain().focus();
          if (texto === "") {
            const remover = cadeiaDoPedido[elemento.pede.comandoDeRemocao];
            if (typeof remover !== "function") return "contexto";
            return remover.call(cadeiaDoPedido).run() ? true : "contexto";
          }
          if (!enderecoPermitido(texto)) return "formato";
          const aplicarComDado = cadeiaDoPedido[elemento.comando];
          if (typeof aplicarComDado !== "function") return "contexto";
          return aplicarComDado
            .call(cadeiaDoPedido, { [elemento.pede.propriedade]: texto })
            .run()
            ? true
            : "contexto";
        }

        const cadeia = editor.chain().focus();
        const comando = cadeia[elemento.comando];
        if (typeof comando !== "function") return "contexto";
        return comando.apply(cadeia, elemento.argumentos).run() ? true : "contexto";
      },

      /** A frase que explica a recusa, tirada do schema — nunca do componente. */
      recusa(motivo, valor) {
        if (!elemento.pede) return "";
        return motivo === "formato"
          ? elemento.pede.recusaDeFormato(valor)
          : elemento.pede.recusaDeContexto;
      },

      /** O endereço já aplicado, para o campo nascer preenchido ao reeditar. */
      valorAtual(editor) {
        if (!editor || !elemento.pede) return "";
        const attrs = editor.getAttributes(elemento.nome);
        const atual = attrs?.[elemento.pede.propriedade];
        return typeof atual === "string" ? atual : "";
      },
    });
  });
}
