/**
 * A barra de ferramentas do Editor — derivada do vocabulário, nunca escrita à
 * mão. O núcleo comum: serve o Post e a Descrição reduzida.
 *
 * **O vocabulário chega por parâmetro.** `configuracao` é o que
 * `criarConfiguracaoDoEditor(vocabulario)` devolveu, e é a ÚNICA fonte do que
 * a barra oferece: os controles, se há imagem (`comImagem`), se há destaque
 * (`comDestaque`) e com que cores (`coresDeDestaque`). `icones` é o mapa de
 * aparência dos controles, e `aparenciaDoDestaque` dá o rótulo e a amostra de
 * cada cor, indexados pela cor (só aparência: QUAIS cores existem vem da
 * configuração). Este arquivo não importa `domain/` nem `admin/blog`: a
 * ligação de cada módulo (`admin/blog/BarraDoEditor.jsx`) entrega as três
 * coisas.
 *
 * Não existe neste arquivo nenhuma lista de botões da barra fixa. Existe UM
 * botão, escrito uma vez, e a lista por onde ele é repetido vem de
 * `controlesDaBarra`, que por sua vez vem do vocabulário do editor.
 * Acrescentar um elemento ao vocabulário faz o controle aparecer aqui sem que
 * ninguém toque neste arquivo; e não há como o vocabulário oferecer um
 * elemento que a barra não ofereça, porque não há uma segunda lista para
 * divergir da primeira.
 *
 * **Por que isso importa mais do que parece.** Uma barra escrita à mão que
 * hoje coincide com o vocabulário é uma coincidência que a próxima mudança
 * desfaz: alguém acrescenta o elemento ao vocabulário e esquece o botão, ou o
 * contrário. Derivar torna a divergência impossível em vez de improvável.
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
 * `link` continua um elemento do vocabulário — a MARCA não mudou, e
 * `controlesDaBarra` continua produzindo o controle dele, com o MESMO `aplicar`/`podeAplicar`/
 * `valorAtual`/`recusa` de sempre. O que mudou é ONDE ele aparece: a
 * `BarraFlutuante`, mais abaixo, o oferece como um Popover sobre a seleção —
 * o lugar natural para "aponte ESTE trecho para um endereço", que é o que o
 * link sempre fez. Nenhum elemento restante na barra fixa declara `pede`, e é
 * por isso que o campo genérico de texto que existia aqui não existe mais:
 * sem um segundo elemento que peça dado, ele virava código morto.
 *
 * ─── Sobre Undo/Redo, Upload de Imagem, Destaque ───────────────────────────
 * Os três NÃO vêm de `controlesDaBarra`, e a ausência é deliberada: nenhum
 * dos três é um elemento da barra do vocabulário. Desfazer/refazer é
 * histórico do editor, não marca nem nó. O envio de imagem insere um widget
 * EFÊMERO (a extensão de envio, que a ligação do módulo com imagem instala)
 * que vira o nó `image` real só depois do envio terminar; o widget nunca é nó
 * do vocabulário. O destaque de cor É uma marca do vocabulário, mas a
 * interface dele é uma paleta de amostras, não um botão liga/desliga, e por
 * isso ele não é elemento da barra. Os três chamam o editor diretamente, e
 * só aparecem quando a configuração diz que existem (`comImagem`,
 * `comDestaque`, `coresDeDestaque`).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Ban, Highlighter, ImagePlus, Redo2, Undo2 } from "lucide-react";

import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { exigir } from "@/admin/shell/voz";
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

/* Os padrões são objetos FIXOS, e não `{}` escrito na assinatura: um objeto
   novo a cada render invalidaria a memória da paleta a cada render. */
const SEM_ICONES = Object.freeze({});
const SEM_APARENCIA = Object.freeze({});

/** O Mac escreve os modificadores com símbolo; o resto do mundo, por extenso. */
function ehMacDaqui() {
  if (typeof navigator === "undefined") return false;
  const pista = `${navigator.userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad/i.test(pista);
}

/**
 * O Popover de destaque de cor. Nasce fechado; a paleta é `cores` (recebida)
 * inteira, sempre — não faz sentido "esconder" uma cor do conjunto fechado.
 * `setHighlight` (e não `toggleHighlight`) porque cada amostra decide a cor
 * de FORMA absoluta: clicar em Azul enquanto Amarelo está ativo troca a cor,
 * em vez de alternar a marca inteira para fora — é a diferença entre "mude
 * para esta cor" e "ligue/desligue".
 */
function PopoverDeDestaque({ editor, cores }) {
  const [aberto, setAberto] = useState(false);

  const estado = useEditorState({
    editor,
    selector: ({ editor: atual }) => ({
      ativo: Boolean(atual?.isActive("highlight")),
      // Nenhum `focus()` dentro da pergunta: uma sonda não pode ter efeito
      // colateral — a mesma disciplina de `podeAplicar`, em
      // `configuracaoDoEditor.js`. `?.` porque o seletor roda no render: um
      // editor sem a extensão de destaque não tem o comando, e a chamada
      // lançaria dentro de `useEditorState`, derrubando a barra inteira.
      disponivel: Boolean(atual?.can().setHighlight?.({ cor: cores[0]?.cor })),
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
          {cores.map(({ cor, rotulo, amostra }) => {
            const ativa = editor.isActive("highlight", { cor });
            return (
              <button
                key={cor}
                type="button"
                aria-pressed={ativa}
                aria-label={`Destacar em ${rotulo}`}
                title={rotulo}
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
                  className={cn("size-5 rounded-pilula", amostra)}
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
function PopoverDeLink({ editor, controle, icones }) {
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
          {icones[controle.chave] ? (
            (() => {
              const Icone = icones[controle.chave];
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
 * Popover de destaque e o Popover de link.
 *
 * ─── ELA É PARA TEXTO, E SÓ ─────────────────────────────────────────────────
 *
 * O `shouldShow` padrão da extensão só exige que a seleção não esteja VAZIA —
 * e seleção de NÓ (a imagem, a linha divisória, o widget de envio) não está
 * vazia. A barra aparecia sobre elas oferecendo negrito, título e link para
 * coisas que não têm texto: comandos que ou não fazem nada, ou fazem algo que
 * ninguém pediu.
 *
 * `aBarraFlutuanteAparece` (em `configuracaoDoEditor.js`, e chegando aqui
 * como `aparece`) fecha isso pelos dois lados: recusa seleção de nó, e exige
 * que exista TEXTO de verdade no trecho — não só um intervalo não-vazio.
 */
function BarraFlutuante({
  editor,
  controles,
  situacoes,
  aparece,
  icones,
  paletaDoDestaque,
}) {
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
      /* A REGRA MORA EM MÓDULO PRÓPRIO, e é executável fora do navegador:
         `aBarraFlutuanteAparece` decide sobre o estado, não sobre o DOM, e a
         verificação a exercita com seleções montadas à mão. */
      shouldShow={({ state }) => aparece(state)}
      className="flex items-center gap-1 rounded-cartao border border-border-soft bg-surface p-1 shadow-md"
    >
      {simples.map(({ controle, indice }) => {
        const situacao = situacoes?.[indice] ?? { ativo: false, disponivel: false };
        const Icone = icones[controle.chave] ?? null;
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
      {/* O separador só existe quando há algo DEPOIS dele: um traço sozinho
          no fim da barra separa nada de coisa nenhuma. */}
      {simples.length > 0 && (paletaDoDestaque.length > 0 || controleDeLink) ? (
        <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-border-soft" />
      ) : null}
      {/* O destaque só existe quando a configuração tem cores: um vocabulário
          sem a marca não tem, e o gatilho não aparece. */}
      {paletaDoDestaque.length > 0 ? (
        <PopoverDeDestaque editor={editor} cores={paletaDoDestaque} />
      ) : null}
      {controleDeLink ? (
        <PopoverDeLink editor={editor} controle={controleDeLink} icones={icones} />
      ) : null}
    </BubbleMenu>
  );
}

export default function BarraDoEditor({
  editor,
  className,
  configuracao,
  icones = SEM_ICONES,
  aparenciaDoDestaque = SEM_APARENCIA,
}) {
  const ehMac = useMemo(ehMacDaqui, []);
  /* Os ganchos rodam SEMPRE, na mesma ordem, mesmo sem configuração: a guarda
     que recusa a configuração ausente fica depois deles, lá embaixo. */
  const controlesDaBarra = configuracao?.controlesDaBarra;
  // A ordem e a quantidade de controles vêm do vocabulário. Esta é a única
  // lista — a barra fixa e a `BarraFlutuante` derivam as duas dela.
  const controles = useMemo(
    () =>
      typeof controlesDaBarra === "function" ? controlesDaBarra(undefined, { ehMac }) : [],
    [controlesDaBarra, ehMac],
  );

  const comImagem = configuracao?.comImagem === true;
  const coresDaConfiguracao = configuracao?.comDestaque === true ? configuracao.coresDeDestaque : null;
  /* A paleta: QUAIS cores vêm da configuração (do vocabulário), e só a
     aparência de cada uma (rótulo e amostra) vem de `aparenciaDoDestaque`.
     Uma cor sem aparência declarada ainda aparece, com o próprio nome. */
  const paletaDoDestaque = useMemo(
    () =>
      (Array.isArray(coresDaConfiguracao) ? coresDaConfiguracao : []).map((cor) => ({
        cor,
        rotulo: aparenciaDoDestaque[cor]?.rotulo ?? cor,
        amostra: aparenciaDoDestaque[cor]?.amostra ?? "",
      })),
    [coresDaConfiguracao, aparenciaDoDestaque],
  );

  // A barra FIXA não inclui `link` — ver o comentário do topo do arquivo.
  const controlesFixos = useMemo(
    () =>
      controles
        .map((controle, indiceOriginal) => ({ controle, indiceOriginal }))
        .filter(({ controle }) => controle.chave !== "link"),
    [controles],
  );

  // O `tabindex` rotativo da barra FIXA: um só controle é parada de Tab; as
  // setas movem. Opera sobre `controlesFixos` (todos menos o link), não sobre
  // `controles` — a barra flutuante tem a própria ordem de Tab, mais simples,
  // porque só existe enquanto uma seleção está aberta.
  const [focado, setFocado] = useState(0);
  // Se a lista encolher, o índice guardado pode apontar para além do fim, e a
  // barra ficaria sem NENHUMA parada de Tab. O índice usado é limitado ao
  // último controle que existe.
  const focadoValido = Math.min(focado, Math.max(0, controlesFixos.length - 1));
  const botoes = useRef([]);

  /**
   * O estado de cada controle, recalculado a cada transação do editor.
   * `useEditorState` existe justamente para isto: sem ele, o Editor inteiro
   * seria redesenhado a cada tecla digitada, que é o oposto do que o limite de
   * resposta de teclado desta story pede. Indexado pela lista COMPLETA
   * (`controles`), porque a `BarraFlutuante` também lê daqui, pelo
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
   * Desfazer/refazer e o upload de imagem: NÃO vêm de `controlesDaBarra` —
   * ver o comentário do topo do arquivo. `can()` SEM `focus()` na pergunta,
   * pela mesma razão que `podeAplicar` já documenta.
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

  /* Sem configuração não há barra: não há de onde derivar os controles, e
     inventar uma lista aqui seria a segunda lista que este arquivo existe
     para não ter. É defeito de quem liga o módulo, e aparece (`exigir`: lança
     em desenvolvimento, registra em produção). */
  if (typeof controlesDaBarra !== "function") {
    exigir(
      "BarraDoEditor recebeu `configuracao` sem `controlesDaBarra`. " +
        "Passe o que `criarConfiguracaoDoEditor(vocabulario)` devolveu.",
    );
    return null;
  }

  return (
    /* `shrink-0`: a barra é CHROME, e chrome não encolhe. Sem isto ela é um
       item de flex com encolhimento padrão, e conteúdo alto o bastante na
       caixa de texto ao lado a espremia até sumir — os botões de formatação
       desapareciam da tela em vez de o texto rolar. */
    <div className={cn("shrink-0 border-b border-border-soft", className)}>
      <div
        role="toolbar"
        aria-label="Formatação do texto"
        aria-orientation="horizontal"
        className="flex flex-wrap items-center gap-1 px-2 py-1.5"
      >
        {controlesFixos.map(({ controle, indiceOriginal }, indiceFixo) => {
          const situacao = situacoes?.[indiceOriginal] ?? { ativo: false, disponivel: false };
          const Icone = icones[controle.chave] ?? null;
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
              tabIndex={indiceFixo === focadoValido ? 0 : -1}
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

        {comImagem ? (
          <>
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
          </>
        ) : null}

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
        <BarraFlutuante
          editor={editor}
          controles={controles}
          situacoes={situacoes}
          aparece={configuracao.aBarraFlutuanteAparece}
          icones={icones}
          paletaDoDestaque={paletaDoDestaque}
        />
      ) : null}
    </div>
  );
}
