/**
 * A barra de ferramentas do Editor — derivada do schema, nunca escrita à mão.
 *
 * Não existe neste arquivo nenhuma lista de botões da barra fixa. Existe UM
 * botão, escrito uma vez, e a lista por onde ele é repetido vem de
 * `controlesDaBarra`, que por sua vez vem de `src/domain/blog/schema.js`.
 * Acrescentar um elemento ao schema faz o controle aparecer aqui sem que
 * ninguém toque neste arquivo; e não há como o schema oferecer um elemento
 * que a barra não ofereça, porque não há uma segunda lista para divergir da
 * primeira.
 *
 * **Por que isso importa mais do que parece.** Uma barra escrita à mão que
 * hoje coincide com o schema é uma coincidência que a próxima mudança desfaz:
 * alguém acrescenta o elemento ao schema e esquece o botão, ou o contrário.
 * Derivar torna a divergência impossível em vez de improvável.
 *
 * ─── Sobre `role="toolbar"` ────────────────────────────────────────────────
 * O papel não é decoração: ele muda o contrato de teclado. Uma barra de
 * ferramentas é UMA parada de Tab, e a navegação entre os controles é por
 * setas — o `tabindex` rotativo abaixo. Declarar o papel sem cumprir o padrão
 * põe dez paradas de Tab entre o Autor e o texto que ele quer escrever.
 * Pela mesma razão, controle indisponível recebe `aria-disabled` e continua
 * alcançável: `disabled` o tiraria da navegação, e um buraco silencioso no
 * meio da barra é pior que um controle que se anuncia indisponível.
 *
 * ─── Sobre o Link ter saído da barra fixa ──────────────────────────────────
 * `link` continua um elemento do schema — a MARCA não mudou, e `controlesDaBarra`
 * continua produzindo o controle dele, com o MESMO `aplicar`/`podeAplicar`/
 * `valorAtual`/`recusa` de sempre. O que mudou é ONDE ele aparece: a
 * `BarraFlutuante`, mais abaixo, o oferece como um Popover sobre a seleção —
 * o lugar natural para "aponte ESTE trecho para um endereço", que é o que o
 * link sempre fez. Nenhum elemento restante na barra fixa declara `pede`, e é
 * por isso que o campo genérico de texto que existia aqui não existe mais:
 * sem um segundo elemento que peça dado, ele virava código morto.
 *
 * ─── Sobre Undo/Redo, Upload de Imagem, Destaque ───────────────────────────
 * Os três NÃO vêm de `ELEMENTOS`/`controlesDaBarra`, e a ausência é
 * deliberada: nenhum dos três é vocabulário do DOCUMENTO da forma que os
 * treze elementos são. Desfazer/refazer é histórico do editor, não marca nem
 * nó. Upload de imagem insere um widget EFÊMERO (`imageUpload`, em
 * `extensaoDeUploadDeImagem.jsx`) que vira o nó `image` real só depois do
 * envio terminar — `imageUpload` nunca aparece em `NOS_PERMITIDOS`. Destaque
 * de cor É vocabulário (`MARCAS.highlight`), mas a interface dele é uma
 * paleta de amostras, não um botão liga/desliga — o mesmo motivo pelo qual
 * ele não tem entrada em `ELEMENTOS`. Os três chamam o editor diretamente,
 * com o vocabulário fechado que já existe (`CORES_DE_DESTAQUE`, do schema).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Ban, Highlighter, ImagePlus, Redo2, Undo2 } from "lucide-react";

import { controlesDaBarra } from "@/admin/blog/configuracao";
import { ICONES } from "@/admin/blog/icones";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { CORES_DE_DESTAQUE } from "@/domain/blog/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A chave dos elementos que a `BarraFlutuante` reaproveita da barra fixa —
 * MESMOS controles de `controlesDaBarra()`, filtrados por chave, nunca uma
 * segunda implementação de `isActive`/`aplicar`. `link` sai desta lista e
 * ganha tratamento próprio (`PopoverDeLink`) porque ele PEDE um dado, e o
 * campo genérico da barra fixa não existe mais aqui.
 */
const CHAVES_DA_BUBBLE_SIMPLES = Object.freeze(["titulo2", "titulo3", "negrito", "italico"]);

/**
 * Os rótulos das cores de destaque, em palavras de gente — a única tradução
 * de `CORES_DE_DESTAQUE` (`domain/blog/schema.js`) que existe, e vive aqui
 * porque só a interface precisa de um rótulo para cada cor.
 */
const ROTULO_DA_COR_DE_DESTAQUE = Object.freeze({
  amarelo: "Amarelo",
  verde: "Verde",
  azul: "Azul",
  rosa: "Rosa",
});

/**
 * A pintura de cada amostra de cor — os MESMOS tokens que `.artigo
 * mark[data-cor="…"]` usa (`src/App.css`), nunca um valor livre escrito
 * aqui: a cor que o Autor escolhe no Popover é a cor que o artigo publicado
 * mostra.
 */
const AMOSTRA_DA_COR_DE_DESTAQUE = Object.freeze({
  amarelo: "bg-destaque-amarelo",
  verde: "bg-destaque-verde",
  azul: "bg-destaque-azul",
  rosa: "bg-destaque-rosa",
});

/** O Mac escreve os modificadores com símbolo; o resto do mundo, por extenso. */
function ehMacDaqui() {
  if (typeof navigator === "undefined") return false;
  const pista = `${navigator.userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad/i.test(pista);
}

/**
 * O Popover de destaque de cor. Nasce fechado; a paleta é `CORES_DE_DESTAQUE`
 * inteira, sempre — não faz sentido "esconder" uma cor do conjunto fechado.
 * `setHighlight` (e não `toggleHighlight`) porque cada amostra decide a cor
 * de FORMA absoluta: clicar em Azul enquanto Amarelo está ativo troca a cor,
 * em vez de alternar a marca inteira para fora — é a diferença entre "mude
 * para esta cor" e "ligue/desligue".
 */
function PopoverDeDestaque({ editor }) {
  const [aberto, setAberto] = useState(false);

  const estado = useEditorState({
    editor,
    selector: ({ editor: atual }) => ({
      ativo: Boolean(atual?.isActive("highlight")),
      // Nenhum `focus()` dentro da pergunta: uma sonda não pode ter efeito
      // colateral — a mesma disciplina de `podeAplicar`, em `configuracao.js`.
      disponivel: Boolean(atual?.can().setHighlight({ cor: CORES_DE_DESTAQUE[0] })),
    }),
    equalityFn: (a, b) => a?.ativo === b?.ativo && a?.disponivel === b?.disponivel,
  });

  if (!editor) return null;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={estado?.ativo}
          aria-label="Destaque de cor"
          aria-disabled={estado?.disponivel ? undefined : "true"}
          title="Destaque de cor: pinta o trecho selecionado com uma cor do conjunto fechado."
          className={cn(
            ALVO_DE_TOQUE,
            ANEL_DE_FOCO,
            "text-ink-muted hover:text-ink",
            estado?.ativo && "bg-brand-wash text-brand-chrome",
            !estado?.disponivel && "opacity-50",
          )}
        >
          <Highlighter aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {/* `painel` reabre o escopo: o Popover nasce em portal, preso a `body`,
          fora da árvore onde `.painel` remapeia os tokens do shadcn — sem a
          classe aqui, `bg-popover`/`text-popover-foreground` resolveriam para
          o neutro do site público. */}
      <PopoverContent className="painel w-auto p-2">
        <div role="group" aria-label="Cores de destaque" className="flex items-center gap-1">
          {CORES_DE_DESTAQUE.map((cor) => {
            const ativa = editor.isActive("highlight", { cor });
            return (
              <button
                key={cor}
                type="button"
                aria-pressed={ativa}
                aria-label={`Destacar em ${ROTULO_DA_COR_DE_DESTAQUE[cor]}`}
                title={ROTULO_DA_COR_DE_DESTAQUE[cor]}
                onClick={() => {
                  editor.chain().focus().setHighlight({ cor }).run();
                  setAberto(false);
                }}
                className={cn(
                  ALVO_DE_TOQUE,
                  ANEL_DE_FOCO,
                  "flex items-center justify-center rounded-controle border",
                  ativa ? "border-brand-action" : "border-border-soft",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-5 rounded-full", AMOSTRA_DA_COR_DE_DESTAQUE[cor])}
                />
              </button>
            );
          })}
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-border-soft" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remover destaque"
            title="Remove o destaque de cor do trecho selecionado."
            onClick={() => {
              editor.chain().focus().unsetHighlight().run();
              setAberto(false);
            }}
            className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO, "text-ink-muted hover:text-ink")}
          >
            <Ban aria-hidden="true" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * O Popover de link. MESMO controle de `controlesDaBarra` (`aplicar`,
 * `podeAplicar`, `valorAtual`, `recusa`) — o que muda é a casca: um Popover
 * sobre a seleção, em vez do campo inline que a barra fixa oferecia antes de
 * o link sair dela.
 */
function PopoverDeLink({ editor, controle }) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [problema, setProblema] = useState("");
  const idDoCampo = useId();
  const idDoProblema = useId();
  const campo = useRef(null);

  const estado = useEditorState({
    editor,
    selector: ({ editor: atual }) => ({
      ativo: controle.estaAtivo(atual),
      disponivel: controle.podeAplicar(atual),
    }),
    equalityFn: (a, b) => a?.ativo === b?.ativo && a?.disponivel === b?.disponivel,
  });

  // A ABERTURA nasce com o endereço já aplicado, como a barra fixa fazia:
  // editar um link é a mesma ação de criar um.
  useEffect(() => {
    if (!aberto) return;
    setValor(controle.valorAtual(editor));
    setProblema("");
  }, [aberto, controle, editor]);

  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  if (!editor) return null;

  const confirmar = () => {
    const desfecho = controle.aplicar(editor, valor);
    if (desfecho === true) {
      setAberto(false);
      return;
    }
    setProblema(controle.recusa(desfecho, valor));
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={estado?.ativo}
          aria-label={controle.rotulo}
          aria-disabled={estado?.disponivel ? undefined : "true"}
          title={`${controle.rotulo}: ${controle.descricao}`}
          className={cn(
            ALVO_DE_TOQUE,
            ANEL_DE_FOCO,
            "text-ink-muted hover:text-ink",
            estado?.ativo && "bg-brand-wash text-brand-chrome",
            !estado?.disponivel && "opacity-50",
          )}
        >
          {ICONES[controle.chave] ? (
            (() => {
              const Icone = ICONES[controle.chave];
              return <Icone aria-hidden="true" />;
            })()
          ) : (
            controle.rotulo
          )}
        </Button>
      </PopoverTrigger>
      {/* `painel` reabre o escopo — ver o comentário de `PopoverDeDestaque`. */}
      <PopoverContent className="painel w-72">
        <form
          className="flex flex-col gap-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            confirmar();
          }}
        >
          <Label htmlFor={idDoCampo} className="text-xs text-ink-muted">
            {controle.pede.rotulo}
          </Label>
          <Input
            id={idDoCampo}
            ref={campo}
            type="text"
            inputMode="url"
            value={valor}
            placeholder={controle.pede.exemplo}
            aria-invalid={problema !== "" ? "true" : undefined}
            aria-describedby={problema ? idDoProblema : undefined}
            onChange={(evento) => {
              setValor(evento.target.value);
              setProblema("");
            }}
            onKeyDown={(evento) => {
              if (evento.key === "Escape") {
                evento.preventDefault();
                setAberto(false);
              }
            }}
            className={cn(ANEL_DE_FOCO)}
          />
          <div className="flex justify-end gap-2">
            {estado?.ativo ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn(ANEL_DE_FOCO)}
                onClick={() => {
                  controle.aplicar(editor, "");
                  setAberto(false);
                }}
              >
                Remover link
              </Button>
            ) : null}
            <Button type="submit" size="sm" className={cn(ANEL_DE_FOCO)}>
              Aplicar link
            </Button>
          </div>
          {problema ? (
            <p id={idDoProblema} role="alert" className="text-xs text-destructive">
              {problema}
            </p>
          ) : null}
        </form>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A barra flutuante que aparece sobre uma seleção de texto — H2/H3/negrito/
 * itálico (os MESMOS controles da barra fixa, filtrados por chave) mais o
 * Popover de destaque e o Popover de link. `<BubbleMenu>` já não aparece
 * sobre seleção vazia — é o comportamento padrão de `shouldShow` da
 * extensão (`@tiptap/extension-bubble-menu`), e é exatamente o que a story
 * pede: nada de reimplementar aqui o que a biblioteca já garante.
 */
function BarraFlutuante({ editor, controles, situacoes }) {
  const simples = useMemo(
    () =>
      controles
        .map((controle, indice) => ({ controle, indice }))
        .filter(({ controle }) => CHAVES_DA_BUBBLE_SIMPLES.includes(controle.chave)),
    [controles],
  );
  const controleDeLink = useMemo(
    () => controles.find((controle) => controle.chave === "link") ?? null,
    [controles],
  );

  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-1 rounded-cartao border border-border-soft bg-surface p-1 shadow-md"
    >
      {simples.map(({ controle, indice }) => {
        const situacao = situacoes?.[indice] ?? { ativo: false, disponivel: false };
        const Icone = ICONES[controle.chave] ?? null;
        return (
          <Button
            key={controle.chave}
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={situacao.ativo}
            aria-label={controle.rotulo}
            aria-disabled={situacao.disponivel ? undefined : "true"}
            title={controle.rotulo}
            onClick={() => situacao.disponivel && controle.aplicar(editor)}
            className={cn(
              ALVO_DE_TOQUE,
              ANEL_DE_FOCO,
              "text-ink-muted hover:text-ink",
              situacao.ativo && "bg-brand-wash text-brand-chrome",
              !situacao.disponivel && "opacity-50",
            )}
          >
            {Icone ? <Icone aria-hidden="true" /> : controle.rotulo}
          </Button>
        );
      })}
      <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-border-soft" />
      <PopoverDeDestaque editor={editor} />
      {controleDeLink ? <PopoverDeLink editor={editor} controle={controleDeLink} /> : null}
    </BubbleMenu>
  );
}

export default function BarraDoEditor({ editor, className }) {
  const ehMac = useMemo(ehMacDaqui, []);
  // A ordem e a quantidade de controles vêm do schema. Esta é a única lista —
  // a barra fixa e a `BarraFlutuante` derivam as duas dela.
  const controles = useMemo(() => controlesDaBarra(undefined, { ehMac }), [ehMac]);

  // A barra FIXA não inclui `link` — ver o comentário do topo do arquivo.
  const controlesFixos = useMemo(
    () =>
      controles
        .map((controle, indiceOriginal) => ({ controle, indiceOriginal }))
        .filter(({ controle }) => controle.chave !== "link"),
    [controles],
  );

  // O `tabindex` rotativo da barra FIXA: um só controle é parada de Tab; as
  // setas movem. Opera sobre `controlesFixos` (doze), não sobre `controles`
  // (treze) — a barra flutuante tem a própria ordem de Tab, mais simples,
  // porque só existe enquanto uma seleção está aberta.
  const [focado, setFocado] = useState(0);
  const botoes = useRef([]);

  /**
   * O estado de cada controle, recalculado a cada transação do editor.
   * `useEditorState` existe justamente para isto: sem ele, o Editor inteiro
   * seria redesenhado a cada tecla digitada, que é o oposto do que o limite de
   * resposta de teclado desta story pede. Indexado pela lista COMPLETA
   * (`controles`, treze), porque a `BarraFlutuante` também lê daqui, pelo
   * índice original de cada controle que ela reaproveita.
   */
  const situacoes = useEditorState({
    editor,
    selector: ({ editor: atual }) =>
      controles.map((controle) => ({
        ativo: controle.estaAtivo(atual),
        disponivel: controle.podeAplicar(atual),
      })),
    // A comparação recebe `null` no primeiro cálculo e sempre que o editor
    // ainda não existe. Comparar sem verificar quebraria a barra exatamente no
    // primeiro quadro, que é quando ninguém está olhando o console.
    equalityFn: (a, b) =>
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every(
        (item, i) => item.ativo === b[i].ativo && item.disponivel === b[i].disponivel,
      ),
  });

  /**
   * Desfazer/refazer e o upload de imagem: NÃO vêm de `ELEMENTOS` — ver o
   * comentário do topo do arquivo. `can()` SEM `focus()` na pergunta, pela
   * mesma razão que `podeAplicar` já documenta.
   */
  const historico = useEditorState({
    editor,
    selector: ({ editor: atual }) => ({
      podeDesfazer: Boolean(atual?.can().undo()),
      podeRefazer: Boolean(atual?.can().redo()),
      podeInserirImagem: Boolean(atual?.can().setImageUploadNode?.()),
    }),
    equalityFn: (a, b) =>
      a?.podeDesfazer === b?.podeDesfazer &&
      a?.podeRefazer === b?.podeRefazer &&
      a?.podeInserirImagem === b?.podeInserirImagem,
  });

  /** Setas, Home e End movem o foco DENTRO da barra fixa. */
  const navegar = useCallback(
    (evento, indiceFixo) => {
      const salto =
        evento.key === "ArrowRight" || evento.key === "ArrowDown"
          ? 1
          : evento.key === "ArrowLeft" || evento.key === "ArrowUp"
            ? -1
            : 0;
      let destino = null;
      if (salto !== 0) {
        destino = (indiceFixo + salto + controlesFixos.length) % controlesFixos.length;
      } else if (evento.key === "Home") {
        destino = 0;
      } else if (evento.key === "End") {
        destino = controlesFixos.length - 1;
      }
      if (destino === null) return;
      evento.preventDefault();
      setFocado(destino);
      botoes.current[destino]?.focus();
    },
    [controlesFixos.length],
  );

  return (
    <div className={cn("border-b border-border-soft", className)}>
      <div
        role="toolbar"
        aria-label="Formatação do texto"
        aria-orientation="horizontal"
        className="flex flex-wrap items-center gap-1 px-2 py-1.5"
      >
        {controlesFixos.map(({ controle, indiceOriginal }, indiceFixo) => {
          const situacao = situacoes?.[indiceOriginal] ?? { ativo: false, disponivel: false };
          const Icone = ICONES[controle.chave] ?? null;
          const dica = [
            controle.rotulo,
            controle.atalhoLegivel ? ` (${controle.atalhoLegivel})` : "",
            ": ",
            controle.descricao,
          ].join("");

          return (
            <Button
              key={controle.chave}
              ref={(no) => {
                botoes.current[indiceFixo] = no;
              }}
              type="button"
              variant="ghost"
              size="icon"
              // `aria-pressed` é o que faz o estado ativo existir para quem não
              // enxerga o fundo destacado: cor sozinha nunca carrega estado.
              // Só quem alterna recebe o atributo — anunciar "não pressionado"
              // num controle que apenas insere descreveria um estado que não
              // existe.
              aria-pressed={controle.alterna ? situacao.ativo : undefined}
              aria-label={controle.rotulo}
              aria-keyshortcuts={controle.atalhoCanonico ?? undefined}
              aria-disabled={situacao.disponivel ? undefined : "true"}
              tabIndex={indiceFixo === focado ? 0 : -1}
              title={dica}
              onKeyDown={(evento) => navegar(evento, indiceFixo)}
              onFocus={() => setFocado(indiceFixo)}
              onClick={() => {
                setFocado(indiceFixo);
                if (situacao.disponivel) controle.aplicar(editor);
              }}
              className={cn(
                ALVO_DE_TOQUE,
                ANEL_DE_FOCO,
                "text-ink-muted hover:text-ink",
                Icone ? "" : "w-auto px-2 text-xs font-semibold",
                situacao.ativo && "bg-brand-wash text-brand-chrome",
                !situacao.disponivel && "opacity-50",
              )}
            >
              {Icone ? <Icone aria-hidden="true" /> : controle.rotulo}
            </Button>
          );
        })}

        <span aria-hidden="true" className="mx-1 h-6 w-px bg-border-soft" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Inserir imagem"
          aria-disabled={historico?.podeInserirImagem ? undefined : "true"}
          title="Inserir imagem: sobe um arquivo e insere na posição do cursor."
          onClick={() => {
            if (historico?.podeInserirImagem) {
              editor?.chain().focus().setImageUploadNode().run();
            }
          }}
          className={cn(
            ALVO_DE_TOQUE,
            ANEL_DE_FOCO,
            "text-ink-muted hover:text-ink",
            !historico?.podeInserirImagem && "opacity-50",
          )}
        >
          <ImagePlus aria-hidden="true" />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Desfazer"
            aria-disabled={historico?.podeDesfazer ? undefined : "true"}
            title="Desfazer (Ctrl+Z)"
            onClick={() => historico?.podeDesfazer && editor?.chain().focus().undo().run()}
            className={cn(
              ALVO_DE_TOQUE,
              ANEL_DE_FOCO,
              "text-ink-muted hover:text-ink",
              !historico?.podeDesfazer && "opacity-50",
            )}
          >
            <Undo2 aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refazer"
            aria-disabled={historico?.podeRefazer ? undefined : "true"}
            title="Refazer (Ctrl+Shift+Z)"
            onClick={() => historico?.podeRefazer && editor?.chain().focus().redo().run()}
            className={cn(
              ALVO_DE_TOQUE,
              ANEL_DE_FOCO,
              "text-ink-muted hover:text-ink",
              !historico?.podeRefazer && "opacity-50",
            )}
          >
            <Redo2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      {editor ? (
        <BarraFlutuante editor={editor} controles={controles} situacoes={situacoes} />
      ) : null}
    </div>
  );
}
