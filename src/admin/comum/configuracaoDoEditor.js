/**
 * A ponte entre um VOCABULÁRIO de documento e o editor: derivação, nunca
 * declaração.
 *
 * Este módulo não decide nada e não conhece domínio nenhum: ele traduz o
 * vocabulário que recebe (o do Post, ou a projeção reduzida da Descrição, os
 * dois exportados por `src/domain/blog/schema.js`) em coisas que o Tiptap e o
 * React entendem.
 *
 *   `extensoesDoEditor()`  as extensões do editor, ligadas ou desligadas
 *                          conforme o nó ou a marca esteja no vocabulário;
 *   `controlesDaBarra()`   um controle por elemento do vocabulário, na ordem
 *                          declarada. A barra percorre esta lista; ela não
 *                          tem lista própria.
 *
 * **Por que o vocabulário chega por parâmetro.** `admin/comum` serve o Blog e
 * Carreiras, e não importa `domain/` (emenda a AD-15): se a lista de nós
 * estivesse fixa aqui, a Descrição da Vaga herdaria imagem, destaque e
 * alinhamento sem ninguém decidir isso. Quem liga o vocabulário ao núcleo é a
 * ligação fina de cada módulo (`admin/blog/configuracao.js`, por exemplo).
 *
 * **Por que ele é `.js` e não `.jsx`.** Sem React dentro, o Node importa e
 * executa este arquivo, e é isso que permite à verificação provar a derivação
 * rodando o código em vez de lendo o código.
 */

import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";

/* Caminho relativo com extensão, e não o apelido `@/`: é o que permite ao Node
   importar este módulo sem o resolvedor do Vite. */
import { diagnosticarRotuloDeAcao } from "../shell/voz.js";

/**
 * A classe da área de escrita.
 *
 * `artigo` é a classe global da Story 2.3, a MESMA que o Blog Público e o HTML
 * servido vestem. Quem escreve vê a aparência em que vai publicar porque é
 * literalmente o mesmo estilo, não uma imitação dele.
 *
 * **A medida do texto não aparece aqui, e isso é deliberado.** `.artigo` já
 * declara `max-width: 68ch`; redeclarar seria uma segunda fonte para a mesma
 * medida.
 *
 * **Sem `py`.** O invólucro em `EditorDeTexto.jsx` já aplica o respiro
 * vertical; repeti-lo aqui somava os dois.
 */
export const CLASSE_DA_AREA_DE_ESCRITA =
  "artigo mx-auto w-full min-h-[24rem] px-1 focus:outline-hidden";

/**
 * O que o StarterKit instala de verdade, perguntado A ELE. Cada entrada traz
 * `name` (o nó, a marca ou a extensão) e `type`.
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
 * O nome da extensão, quando ele difere da chave de configuração do kit. Só
 * os casos em que os dois divergem; a garantia é a verificação, que monta o
 * editor e afirma que ele não tem nó nem marca fora do vocabulário.
 */
const CHAVE_DE_OPCAO = Object.freeze({
  doc: "document",
  dropCursor: "dropcursor",
  gapCursor: "gapcursor",
});

/**
 * Os nós em que o alinhamento de texto se acopla, quando o vocabulário tem
 * alinhamentos. Filtrados pelo vocabulário: não se acopla a nó que ele não
 * conhece.
 */
const NOS_ALINHAVEIS = Object.freeze(["heading", "paragraph", "image"]);

/**
 * A barra flutuante deve aparecer para esta seleção?
 *
 * Só para TEXTO. Seleção de NÓ (imagem, linha divisória, o widget de envio)
 * não está vazia, e a barra aparecia sobre ela oferecendo negrito, título e
 * link para coisas que não têm texto.
 *
 *   - `selection.node` existe apenas em `NodeSelection`: recusa o nó
 *     selecionado mesmo quando há texto em volta;
 *   - `textBetween` recusa o intervalo que não tem texto NENHUM dentro.
 *
 * Pura e exportada de propósito: a verificação a executa com seleções
 * montadas à mão.
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

/**
 * `Mod-Alt-2` → `Control+Alt+2`: a notação que `aria-keyshortcuts` exige
 * (modificadores por extenso, unidos por `+`). O que a pessoa LÊ na dica não
 * serve aqui: software que recebe um símbolo tipográfico no lugar de um nome
 * de tecla não anuncia o atalho.
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
 * O endereço de mentira com que `podeAplicar` pergunta ao editor "aqui cabe?".
 * Precisa passar pela regra de endereço, senão a pergunta seria respondida
 * pelo formato do valor em vez de pelo lugar do cursor.
 */
const SONDA_DE_CONTEXTO = "https://sonda.invalido";

/**
 * O retrato do arrasto de imagem: o navegador desenharia um retrato
 * translúcido do elemento, e a transparência é do sistema operacional. O
 * retrato nativo vira um pixel invisível, e quem desenha a prévia é React
 * (montada pela ligação que tem imagem). Este gancho só AVISA, por evento, e
 * devolve `false`: o ProseMirror segue tratando o arrasto inteiro. Sem imagem
 * no vocabulário, não há `<img>` para arrastar e o gancho não age.
 */
function aoComecarArrasto(_visao, evento) {
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

  /* O retrato do navegador vira um pixel invisível. Ele PRECISA estar no
     documento no instante da chamada, e sai no tique seguinte. */
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

  /* A limpeza vive no MESMO lugar que a marcação: `dragend` sempre dispara na
     origem, soltando dentro, fora, ou cancelando com Escape. */
  const encerrar = () => {
    document.body.removeAttribute("data-arrastando-imagem");
    document.dispatchEvent(new CustomEvent("painel:arrasto-de-imagem-fim"));
    alvo.removeEventListener("dragend", encerrar);
  };
  alvo.addEventListener("dragend", encerrar);

  return false;
}

/** É objeto simples (não `null`, não lista)? */
function ehObjeto(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

/**
 * O que falta no vocabulário para o núcleo trabalhar, em frases curtas. Lista
 * vazia é vocabulário completo. Pura, e exportada para a verificação.
 */
export function problemasDoVocabulario(vocabulario) {
  if (!ehObjeto(vocabulario)) return ["o vocabulário não é um objeto"];
  const problemas = [];
  if (!ehObjeto(vocabulario.nos)) problemas.push("`nos` precisa ser um objeto");
  if (!ehObjeto(vocabulario.marcas)) problemas.push("`marcas` precisa ser um objeto");
  for (const lista of ["elementos", "niveisDeTitulo", "alinhamentos", "coresDeDestaque"]) {
    if (!Array.isArray(vocabulario[lista])) problemas.push(`\`${lista}\` precisa ser uma lista`);
  }
  if (typeof vocabulario.enderecoPermitido !== "function") {
    problemas.push("`enderecoPermitido` precisa ser uma função");
  }
  if (typeof vocabulario.mensagens?.rotuloDoConteudo !== "string") {
    problemas.push("`mensagens.rotuloDoConteudo` precisa ser um texto");
  }
  return problemas;
}

/**
 * O núcleo, ligado a um vocabulário.
 *
 * `vocabulario` traz `nos`, `marcas`, `elementos`, `niveisDeTitulo`,
 * `alinhamentos`, `coresDeDestaque`, `enderecoPermitido`, `acaoQueAlterna` e
 * `mensagens`. Devolve as MESMAS funções que o Blog sempre exportou, agora
 * sobre o vocabulário recebido: TextAlign, Image e Highlight só entram quando
 * o vocabulário os contém, e na mesma ordem de sempre. Devolve também o que
 * derivou do vocabulário e a barra precisa saber (`comImagem`, `comDestaque`,
 * `coresDeDestaque`): a barra lê daqui, e não de uma propriedade à parte que
 * pudesse oferecer um controle que o editor não tem.
 *
 * Vocabulário incompleto é defeito de quem liga o módulo, e lança `TypeError`
 * AQUI, na criação, com o que falta nomeado.
 *
 * **Crie a configuração UMA vez, fora do render** (no topo do módulo da
 * ligação, como `admin/blog/configuracao.js` faz). A barra memoriza os
 * controles pela IDENTIDADE de `controlesDaBarra`: uma configuração criada a
 * cada render teria funções novas a cada render, e a barra refaria a lista e
 * perderia o lugar do `tabindex` rotativo a cada tecla.
 *
 * @param {object} vocabulario
 */
export function criarConfiguracaoDoEditor(vocabulario) {
  const problemas = problemasDoVocabulario(vocabulario);
  if (problemas.length > 0) {
    throw new TypeError(
      `criarConfiguracaoDoEditor: vocabulário incompleto: ${problemas.join("; ")}.`,
    );
  }

  const {
    nos,
    marcas,
    elementos: elementosDoVocabulario,
    niveisDeTitulo,
    alinhamentos,
    coresDeDestaque,
    enderecoPermitido,
    acaoQueAlterna,
    mensagens,
  } = vocabulario;

  const comImagem = Object.hasOwn(nos, "image");
  const comDestaque = Object.hasOwn(marcas, "highlight") && coresDeDestaque.length > 0;
  const comAlinhamento = alinhamentos.length > 0;

  /** O nome está no vocabulário, como nó ou como marca? */
  function noVocabulario(nome) {
    return Object.hasOwn(nos, nome) || Object.hasOwn(marcas, nome);
  }

  /**
   * A configuração do StarterKit, derivada do vocabulário. Um objeto simples,
   * sem React e sem DOM, para a verificação afirmar sobre ele.
   */
  function configuracaoDoKit() {
    const configuracao = {};

    for (const extensao of extensoesInstaladasPeloKit()) {
      // Extensão sem nó nem marca não tem vocabulário para cruzar; ela é
      // julgada pela lista declarada na ligação, na auditoria.
      if (extensao.type === "extension") continue;
      if (noVocabulario(extensao.name)) continue;
      configuracao[CHAVE_DE_OPCAO[extensao.name] ?? extensao.name] = false;
    }

    // Os níveis de título vêm do vocabulário. É por aqui que `h1` deixa de
    // existir no editor: sem o nível na lista, o comando não existe.
    if (configuracao.heading !== false) {
      configuracao.heading = { levels: [...niveisDeTitulo] };
    }

    if (configuracao.link !== false) {
      configuracao.link = {
        // Clicar no link dentro do editor posiciona o cursor; não navega.
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        // O HTML do artigo não carrega classe: quem estiliza é o invólucro.
        HTMLAttributes: {},
        // A MESMA regra de endereço que a validação do domínio aplica.
        isAllowedUri: (url) => enderecoPermitido(url),
        shouldAutoLink: (url) => enderecoPermitido(url),
      };
    }

    /* A linha que prevê onde o bloco arrastado vai cair, no verde da marca,
       por token (`var(...)`), com o hexadecimal só como reserva. */
    if (configuracao.dropcursor !== false) {
      configuracao.dropcursor = {
        color: "var(--brand-action, #007a2a)",
        width: 2,
      };
    }

    return configuracao;
  }

  /**
   * As extensões do editor, na configuração derivada do vocabulário.
   *
   * O StarterKit já traz o atalho de teclado dos elementos que declaram
   * `atalho`; a verificação cobra a correspondência nos dois sentidos.
   */
  function extensoesDoEditor() {
    const extensoes = [StarterKit.configure(configuracaoDoKit())];

    if (comAlinhamento) {
      /* `types` explícito: só os nós do vocabulário em que o atributo existe.
         `alignments` vem da MESMA lista fechada que valida o atributo. */
      extensoes.push(
        TextAlign.configure({
          types: NOS_ALINHAVEIS.filter((nome) => Object.hasOwn(nos, nome)),
          alignments: [...alinhamentos],
          defaultAlignment: "left",
        }),
      );
    }

    if (comImagem) {
      /* `inline: false`: a imagem é um nó de BLOCO. `allowBase64: false`
         recusa `data:` colado, que a regra de `src` já não aceita. */
      extensoes.push(
        Image.configure({
          inline: false,
          allowBase64: false,
          HTMLAttributes: {},
        }),
      );
    }

    if (comDestaque) {
      /* O destaque de cor. `addAttributes` é reescrito por inteiro para
         trocar `color` por `cor` (o nome que o vocabulário declara) e para
         renderizar só `data-cor`: a aparência mora em CSS, nunca em `style`.
         `multicolor: true` liga o vocabulário de atributo da extensão-base. */
      extensoes.push(
        Highlight.configure({ multicolor: true, HTMLAttributes: {} }).extend({
          addAttributes() {
            return {
              cor: {
                default: null,
                parseHTML: (elemento) => elemento.getAttribute("data-cor"),
                renderHTML: (atributos) =>
                  coresDeDestaque.includes(atributos.cor)
                    ? { "data-cor": atributos.cor }
                    : {},
              },
            };
          },
        }),
      );
    }

    return extensoes;
  }

  /**
   * As opções do editor que não são extensão.
   *
   * `enablePasteRules: false` é o que faz "colar sem formatação" significar o
   * que diz: a formatação do que é colado vem só da ESTRUTURA do HTML de
   * origem, filtrada pelo vocabulário. As regras de DIGITAÇÃO continuam.
   */
  function opcoesDoEditor({ rotulo = mensagens.rotuloDoConteudo } = {}) {
    return {
      enablePasteRules: false,
      editorProps: {
        attributes: {
          class: CLASSE_DA_AREA_DE_ESCRITA,
          /* O nome acessível precisa chegar ao ELEMENTO que carrega
             `role="textbox"`, o `contenteditable` que o ProseMirror monta. */
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": rotulo,
        },
        /* O gancho do arrasto de imagem só existe onde há imagem: sem o nó
           no vocabulário, não há `<img>` para arrastar, e registrar o gancho
           seria código que ninguém exercita. */
        handleDOMEvents: comImagem ? { dragstart: aoComecarArrasto } : {},
      },
    };
  }

  /**
   * Os rótulos que não dizem o que o controle faz: a voz do Painel aplicada
   * aos elementos. Pura, e chamada pela VERIFICAÇÃO, não pelo render: rótulo
   * ruim é defeito de quem escreve o vocabulário.
   */
  function problemasDeVozDosControles(elementos = elementosDoVocabulario) {
    return elementos
      .map((elemento) => {
        const problema = diagnosticarRotuloDeAcao(elemento.rotulo);
        return problema === null ? null : { chave: elemento.chave, problema };
      })
      .filter((entrada) => entrada !== null);
  }

  /**
   * Um controle por elemento do vocabulário, na ordem declarada.
   *
   * `elementos` é parâmetro para a verificação poder passar a lista MAIS um
   * elemento sintético e observar o controle novo nascer.
   */
  function controlesDaBarra(elementos = elementosDoVocabulario, { ehMac = false } = {}) {
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
        alterna: elemento.acao === acaoQueAlterna,

        /** O cursor está dentro deste elemento agora? */
        estaAtivo(editor) {
          if (!editor || elemento.acao !== acaoQueAlterna) return false;
          /* `nome: null` é o alinhamento: o atributo não troca o TIPO do nó,
             então `isActive` procura qualquer nó com estes atributos. */
          return elemento.nome === null
            ? editor.isActive(atributos)
            : editor.isActive(elemento.nome, atributos);
        },

        /**
         * O comando roda no estado atual? Quem PEDE um dado é perguntado com
         * um valor de sonda. `can()` SEM `focus()`: uma pergunta não pode ter
         * efeito colateral, e esta é feita no caminho de render.
         */
        podeAplicar(editor) {
          if (!editor) return false;
          const teste = editor.can().chain();
          const comando = teste[elemento.comando];
          if (typeof comando !== "function") return false;
          const argumentos = elemento.pede
            ? [{ [elemento.pede.propriedade]: SONDA_DE_CONTEXTO }]
            : elemento.argumentos;
          return Boolean(comando.apply(teste, argumentos).run());
        },

        /**
         * Aplica o elemento. `valor` só é usado por quem declara `pede`.
         * Valor vazio num elemento que pede significa remover. Devolve `true`,
         * ou o MOTIVO da recusa: `"formato"` quando o dado não serve,
         * `"contexto"` quando o dado serve e o lugar não.
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

        /** A frase que explica a recusa, tirada do vocabulário, nunca do componente. */
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

  return Object.freeze({
    /* O que a barra precisa saber, derivado do vocabulário UMA vez. As cores
       só existem quando o destaque existe: lista de cores sem a marca seria
       uma paleta para um comando que o editor não tem. */
    comImagem,
    comDestaque,
    coresDeDestaque: Object.freeze(comDestaque ? [...coresDeDestaque] : []),
    CLASSE_DA_AREA_DE_ESCRITA,
    extensoesInstaladasPeloKit,
    configuracaoDoKit,
    extensoesDoEditor,
    opcoesDoEditor,
    aBarraFlutuanteAparece,
    problemasDeVozDosControles,
    atalhoCanonico,
    atalhoLegivel,
    controlesDaBarra,
  });
}
