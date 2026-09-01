/**
 * O Editor visual do Post.
 *
 * O Autor escreve e vê o texto **já formatado no lugar**: sem marcação
 * visível, sem painel de pré-visualização ao lado. A área de escrita veste a
 * classe `.artigo` da Story 2.3 — a mesma classe global que o Blog Público e o
 * HTML servido vão vestir —, então a aparência em que se escreve é literalmente
 * a aparência em que se publica, e não uma imitação dela.
 *
 * **O que este componente NÃO faz.** Ele não grava. Toda operação de escrita
 * passa pelo caminho único do servidor (Story 2.5), e a troca do formulário do
 * Painel é da Story 2.6. Aqui o editor produz o documento e entrega em
 * `aoMudar`; quem recebe decide o que fazer com ele.
 *
 * **Sobre validar a cada tecla.** O editor é construído a partir do MESMO
 * schema contra o qual o documento é validado: o que ele consegue produzir já
 * é, por construção, o que a validação aceitaria. Revalidar a cada tecla seria
 * pagar duas vezes pela mesma garantia, justamente no caminho onde a story
 * exige resposta abaixo de 100 ms. A validação roda onde a entrada vem de
 * fora — no conteúdo inicial, aqui, e na escrita, na Story 2.5.
 *
 * **Por que a validação da entrada não é zelo excessivo.** O Tiptap constrói o
 * documento com `Node.fromJSON`, que LANÇA `Unknown node type` diante de um nó
 * que o schema não conhece. Um post gravado antes desta story, ou por outra
 * via, com uma tabela dentro, não abriria: o Autor veria a tela quebrar em vez
 * do texto. Higienizar na entrada é o que transforma "não abre" em "abre sem a
 * tabela, e diz que a tabela saiu".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { AlertTriangle, X } from "lucide-react";

import BarraDoEditor from "@/admin/blog/BarraDoEditor";
import { deslocamentoDoArrasto } from "@/admin/blog/arrasto";
import { extensoesDoEditor, opcoesDoEditor } from "@/admin/blog/configuracao";
import { ExtensaoDeUploadDeImagem } from "@/admin/blog/extensaoDeUploadDeImagem";
import PreviaDeArrasto from "@/admin/blog/PreviaDeArrasto";
import PunhoDeRedimensionar from "@/admin/blog/PunhoDeRedimensionar";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { prepararConteudo } from "@/admin/blog/conteudo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Editor({
  documento,
  aoMudar,
  aoAvisar,
  rotulo = "Conteúdo do post",
  className,
}) {
  // O conteúdo inicial é lido UMA vez. Recarregar o documento debaixo de quem
  // está digitando perderia o cursor e, com ele, o parágrafo em andamento;
  // trocar de post é trocar de editor, e quem monta a tela faz isso pela
  // `key` do componente.
  const [inicial] = useState(() => {
    const preparado = prepararConteudo(documento);
    if (preparado.aviso) aoAvisar?.(preparado.aviso);
    return preparado;
  });
  const [aviso, setAviso] = useState(inicial.aviso);

  const editor = useEditor({
    /* `ExtensaoDeUploadDeImagem` entra AQUI, e não dentro de
       `extensoesDoEditor()`: o widget de upload tem um NodeView em React
       (`extensaoDeUploadDeImagem.jsx`), e `configuracao.js` precisa continuar
       Node-executável, sem JSX, para a verificação derivar a barra sem
       montar navegador (ver o cabeçalho daquele arquivo). O widget é
       EFÊMERO — nunca aparece em `NOS_PERMITIDOS` — então ele não precisa
       estar na lista que a verificação cruza contra o schema. */
    extensions: [...extensoesDoEditor(), ExtensaoDeUploadDeImagem],
    ...opcoesDoEditor({ rotulo }),
    content: inicial.documento,
    onUpdate: ({ editor: atual }) => {
      // O documento estruturado, e nunca HTML: é o que a Story 2.5 grava como
      // fonte canônica, e o que a 2.6 compara para saber se há alteração
      // pendente. Entregar HTML aqui devolveria o projeto ao parser artesanal
      // que o Épico 2 existe para remover.
      aoMudar?.(atual.getJSON());
    },
  });

  const dispensar = useCallback(() => setAviso(null), []);

  /* ─── ROLAR ENQUANTO ARRASTA ─────────────────────────────────────────────
     Arrastando uma imagem para um ponto fora da parte visível não havia como
     chegar lá: o arrasto de HTML5 não rola nada sozinho, e soltar para rolar
     perde o arrasto. Encostar o cursor perto da borda de cima ou de baixo da
     caixa que rola o texto agora rola na direção certa.

     O laço é de QUADRO, e não de evento: `dragover` só dispara quando o
     ponteiro se MEXE, e a rolagem precisa continuar com ele parado na borda —
     que é justamente como se segura para esperar o documento chegar.

     E o laço só se reagenda quando há deslocamento. Com o cursor no meio da
     caixa, nenhum quadro é pedido: um laço que gira o arrasto inteiro à toa
     é o tipo de coisa que fica presa quando o arrasto termina de um jeito que
     ninguém previu. */
  const caixaQueRola = useRef(null);
  useEffect(() => {
    let ondeEsta = null;
    let quadro = null;

    const passo = () => {
      quadro = null;
      const caixa = caixaQueRola.current;
      if (caixa === null || ondeEsta === null) return;

      const medida = caixa.getBoundingClientRect();
      const deslocamento = deslocamentoDoArrasto({
        y: ondeEsta,
        topo: medida.top,
        base: medida.bottom,
      });
      if (deslocamento === 0) return;

      caixa.scrollTop += deslocamento;
      quadro = requestAnimationFrame(passo);
    };

    const aoArrastar = (evento) => {
      ondeEsta = evento.clientY;
      if (quadro === null) quadro = requestAnimationFrame(passo);
    };
    const parar = () => {
      ondeEsta = null;
      if (quadro !== null) cancelAnimationFrame(quadro);
      quadro = null;
    };

    document.addEventListener("dragover", aoArrastar);
    document.addEventListener("drop", parar);
    document.addEventListener("dragend", parar);
    return () => {
      parar();
      document.removeEventListener("dragover", aoArrastar);
      document.removeEventListener("drop", parar);
      document.removeEventListener("dragend", parar);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-cartao border border-border-soft bg-surface",
        className,
      )}
    >
      {aviso ? (
        <div
          role="alert"
          data-gravidade={aviso.gravidade}
          className={cn(
            "flex items-start gap-2 border-b border-border-soft px-4 py-3 text-sm",
            aviso.gravidade === "recusado"
              ? "bg-destructive/10 text-ink"
              : "bg-brand-wash text-ink",
          )}
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{aviso.mensagem}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Dispensar o aviso sobre o conteúdo"
            onClick={dispensar}
            className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO, "shrink-0")}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <BarraDoEditor editor={editor} />

      {/* `relative` NÃO é enfeite: é o que prende a linha de previsão dentro
          do editor. O `prosemirror-dropcursor` anexa a linha ao `offsetParent`
          do editor e a posiciona em relação a ele — e sem posicionamento aqui,
          o `offsetParent` virava o `<body>` (que é `position: relative` por
          causa do `index.css`). A linha nascia filha do body, em coordenada de
          página e sem nada que a recortasse: aparecia fora dos limites do
          editor. Com `relative`, ela nasce aqui dentro e o `overflow-y-auto`
          desta mesma caixa a recorta. */}
      <div
        ref={caixaQueRola}
        data-papel="caixa-que-rola"
        className="relative min-h-0 flex-1 overflow-y-auto bg-background px-4 py-8 sm:px-6 sm:py-10"
      >
        {/* A PÁGINA. `.artigo`, dentro, continua travada em 68ch — a MESMA
            medida do blog publicado; nada aqui muda isso. O que este cartão
            resolve é outra coisa: numa tela larga, a coluna de texto sozinha
            sobre o fundo do Painel deixa metros de vazio dos dois lados, e
            digitar ali parece começar do nada. Um contorno visível — fundo
            branco, borda, sombra — dá à área de escrita um limite que o olho
            reconhece, do jeito que uma folha de papel tem borda antes mesmo
            de ter texto. A largura do CARTÃO é maior que a do TEXTO de
            propósito: é a margem da folha, não a medida de leitura — mexer
            nela nunca é mexer em quantos caracteres cabem numa linha. */}
        <div
          data-papel="pagina-do-editor"
          className="mx-auto max-w-4xl rounded-cartao border border-border-soft bg-surface px-5 py-8 shadow-sm sm:px-12 sm:py-12"
        >
          {editor ? (
            <>
              <EditorContent editor={editor} />
              {/* A prévia do arrasto de imagem. Fica AQUI, e não dentro de
                  `configuracao.js`, pela mesma razão do widget de upload:
                  aquele arquivo precisa continuar Node-executável, sem React.
                  Ela se desenha em `position: fixed`, então o lugar na árvore
                  não afeta onde ela aparece — o que importa é estar montada
                  enquanto o editor estiver. */}
              <PreviaDeArrasto />
              {/* O punho de redimensionar. Mesma razão de estar aqui: ele se
                  desenha em `position: fixed` sobre a imagem selecionada, então
                  o lugar na árvore não decide onde ele aparece. */}
              <PunhoDeRedimensionar editor={editor} />
            </>
          ) : (
            /* Esqueleto em todo carregamento, nunca tela em branco. A medida do
               esqueleto acompanha a do texto pela mesma classe. */
            <div
              className={cn(opcoesDoEditor().editorProps.attributes.class, "space-y-3")}
              aria-hidden="true"
            >
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
