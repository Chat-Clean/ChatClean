/**
 * A casca do editor de texto: o núcleo comum do Painel.
 *
 * Serve o Post e a Descrição reduzida, e não conhece domínio nenhum. Quem
 * liga um vocabulário a ela (`admin/blog/Editor.jsx`, por exemplo) entrega
 * tudo por propriedade:
 *
 *   `documento`, `aoMudar`, `aoAvisar`  o conteúdo e quem ouve;
 *   `prepararConteudo`                o saneamento da entrada, contra o
 *                                     vocabulário de quem chama. OBRIGATÓRIO:
 *                                     sem ele o documento externo não é
 *                                     aberto (ver `criarPrepararConteudo`,
 *                                     em `conteudo.js`);
 *   `extensoes`, `opcoes`             o que `criarConfiguracaoDoEditor`
 *                                     derivou do vocabulário (mais o que for
 *                                     só daquele módulo);
 *   `barra`                           o componente da barra, que recebe
 *                                     `editor`;
 *   `sobreposicoes(editor)`           o que se desenha junto do texto
 *                                     (prévia de arrasto, punho de imagem);
 *   `className`.
 *
 * Quem escreve vê o texto **já formatado no lugar**: a área de escrita veste a
 * classe `.artigo`, a mesma do site. Este componente NÃO grava: ele produz o
 * documento e entrega em `aoMudar`; quem recebe decide o que fazer com ele.
 *
 * **Sobre validar a cada tecla.** O editor é construído a partir do MESMO
 * vocabulário contra o qual o documento é validado. A validação roda onde a
 * entrada vem de fora: no conteúdo inicial, aqui (`prepararConteudo`), e na
 * escrita, no servidor.
 *
 * **Por que a validação da entrada não é zelo excessivo.** O Tiptap constrói o
 * documento com `Node.fromJSON`, que LANÇA diante de um nó que o schema não
 * conhece. Higienizar na entrada é o que transforma "não abre" em "abre sem o
 * trecho, e diz que o trecho saiu".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { AlertTriangle, X } from "lucide-react";

import { deslocamentoDoArrasto, ZONA_DE_ROLAMENTO } from "@/admin/comum/arrasto";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { exigir } from "@/admin/shell/voz";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * O ponteiro do arrasto está sobre esta caixa? Pelo alvo do evento (o caso
 * comum) ou pela geometria: na faixa horizontal da caixa, e na vertical
 * alargada por `ZONA_DE_ROLAMENTO`, porque rolar exige encostar na borda e
 * passar um pouco dela.
 */
function ponteiroSobreACaixa(caixa, evento) {
  const alvo = evento?.target;
  if (alvo && typeof alvo.nodeType === "number") {
    if (caixa.contains(alvo)) return true;
    // Sobre a caixa de OUTRO editor: é aquela que rola, não esta.
    const outra = alvo.nodeType === 1 ? alvo.closest("[data-papel='caixa-que-rola']") : null;
    if (outra !== null && outra !== caixa) return false;
  }
  const medida = caixa.getBoundingClientRect();
  const x = evento?.clientX;
  const y = evento?.clientY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return (
    x >= medida.left &&
    x <= medida.right &&
    y >= medida.top - ZONA_DE_ROLAMENTO &&
    y <= medida.bottom + ZONA_DE_ROLAMENTO
  );
}

export default function EditorDeTexto({
  documento,
  aoMudar,
  aoAvisar,
  prepararConteudo,
  extensoes,
  opcoes,
  barra: Barra,
  sobreposicoes,
  className,
}) {
  // O conteúdo inicial é lido UMA vez. Recarregar o documento debaixo de quem
  // está digitando perderia o cursor e, com ele, o parágrafo em andamento;
  // trocar de post é trocar de editor, e quem monta a tela faz isso pela
  // `key` do componente.
  const [inicial] = useState(() => {
    /* Sem o saneamento, o documento que chega de fora iria CRU ao Tiptap: um
       nó fora do vocabulário faria o editor abrir vazio sem aviso, ou pior,
       aceitaria o que o vocabulário recusa. Quem liga a casca sem ele erra, e
       o erro aparece (`exigir`: lança em desenvolvimento, registra em
       produção); o documento externo NÃO é repassado, e o editor abre vazio. */
    if (typeof prepararConteudo !== "function") {
      exigir(
        "EditorDeTexto recebeu `prepararConteudo` que não é função. " +
          "Ele é obrigatório: o documento de fora só entra saneado contra o vocabulário de quem chama.",
      );
      return { documento: "", aviso: null };
    }
    const preparado = prepararConteudo(documento);
    if (preparado.aviso) aoAvisar?.(preparado.aviso);
    return preparado;
  });
  const [aviso, setAviso] = useState(inicial.aviso);

  const editor = useEditor({
    /* As extensões e as opções chegam PRONTAS de quem liga o vocabulário: é lá
       que se decide o que o documento aceita, e o que é só daquele módulo (o
       widget de envio de imagem do Blog, por exemplo). */
    extensions: extensoes,
    ...opcoes,
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
     ninguém previu.

     Os ouvintes são do DOCUMENTO, mas só rolam ESTA caixa quando o ponteiro
     está sobre ela, na faixa horizontal da caixa e dentro da faixa vertical
     alargada pela zona de rolamento (é preciso poder encostar na borda, e um
     pouco além dela). Com dois editores na mesma tela, arrastar sobre um não
     rola o outro. */
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
      const caixa = caixaQueRola.current;
      if (caixa === null || !ponteiroSobreACaixa(caixa, evento)) {
        ondeEsta = null;
        return;
      }
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

      {Barra ? <Barra editor={editor} /> : null}

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
              {/* O que se desenha junto do texto, de quem liga o vocabulário
                  (a prévia de arrasto e o punho de imagem, no Blog). Elas se
                  desenham em `position: fixed`, então o lugar na árvore não
                  decide onde aparecem: o que importa é estarem montadas
                  enquanto o editor estiver. */}
              {sobreposicoes ? sobreposicoes(editor) : null}
            </>
          ) : (
            /* Esqueleto em todo carregamento, nunca tela em branco. A medida do
               esqueleto acompanha a do texto pela mesma classe. */
            <div
              className={cn(opcoes?.editorProps?.attributes?.class, "space-y-3")}
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
