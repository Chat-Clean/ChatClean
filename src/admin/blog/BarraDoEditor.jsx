/**
 * A barra de ferramentas do Editor — derivada do schema, nunca escrita à mão.
 *
 * Não existe neste arquivo nenhuma lista de botões. Existe UM botão, escrito
 * uma vez, e a lista por onde ele é repetido vem de `controlesDaBarra`, que
 * por sua vez vem de `src/domain/blog/schema.js`. Acrescentar um elemento ao
 * schema faz o controle aparecer aqui sem que ninguém toque neste arquivo; e
 * não há como o schema oferecer um elemento que a barra não ofereça, porque
 * não há uma segunda lista para divergir da primeira.
 *
 * **Por que isso importa mais do que parece.** Uma barra escrita à mão que
 * hoje coincide com o schema é uma coincidência que a próxima mudança desfaz:
 * alguém acrescenta o elemento ao schema e esquece o botão, ou o contrário.
 * Derivar torna a divergência impossível em vez de improvável.
 *
 * O único elemento que precisa de um dado do Autor — o link — também não é
 * caso especial escrito à mão: ele DECLARA `pede` no schema, e a barra tem um
 * campo genérico para quem declara. Um segundo elemento que peça um dado
 * amanhã reaproveita o mesmo campo, e as frases de recusa continuam vindo do
 * schema, não daqui.
 *
 * ─── Sobre `role="toolbar"` ────────────────────────────────────────────────
 * O papel não é decoração: ele muda o contrato de teclado. Uma barra de
 * ferramentas é UMA parada de Tab, e a navegação entre os controles é por
 * setas — o `tabindex` rotativo abaixo. Declarar o papel sem cumprir o padrão
 * põe dez paradas de Tab entre o Autor e o texto que ele quer escrever.
 * Pela mesma razão, controle indisponível recebe `aria-disabled` e continua
 * alcançável: `disabled` o tiraria da navegação, e um buraco silencioso no
 * meio da barra é pior que um controle que se anuncia indisponível.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useEditorState } from "@tiptap/react";

import { controlesDaBarra } from "@/admin/blog/configuracao";
import { ICONES } from "@/admin/blog/icones";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** O Mac escreve os modificadores com símbolo; o resto do mundo, por extenso. */
function ehMacDaqui() {
  if (typeof navigator === "undefined") return false;
  const pista = `${navigator.userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad/i.test(pista);
}

export default function BarraDoEditor({ editor, className }) {
  const ehMac = useMemo(ehMacDaqui, []);
  // A ordem e a quantidade de controles vêm do schema. Esta é a única lista.
  const controles = useMemo(() => controlesDaBarra(undefined, { ehMac }), [ehMac]);

  // Identificadores próprios desta instância: dois editores na mesma página
  // (o post e uma pré-visualização, por exemplo) colidiriam com `id` fixo, e o
  // rótulo do segundo passaria a apontar para o campo do primeiro.
  const marca = useId();
  const idDoCampo = `${marca}-campo`;
  const idDoProblema = `${marca}-problema`;
  const idDoFormulario = `${marca}-formulario`;

  // Qual controle está com o campo aberto, e o que já foi digitado nele.
  const [pedido, setPedido] = useState(null);
  // O `tabindex` rotativo: um só controle é parada de Tab; as setas movem.
  const [focado, setFocado] = useState(0);
  const campo = useRef(null);
  const botoes = useRef([]);

  /**
   * O estado de cada controle, recalculado a cada transação do editor.
   * `useEditorState` existe justamente para isto: sem ele, o Editor inteiro
   * seria redesenhado a cada tecla digitada, que é o oposto do que o limite de
   * resposta de teclado desta story pede.
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

  // Só a ABERTURA move o foco para o campo. Depender do objeto inteiro do
  // pedido faria o efeito rodar a cada tecla — o campo era refocado por
  // caractere digitado, e o cursor voltava para o fim a cada letra.
  const chaveAberta = pedido?.chave ?? null;
  useEffect(() => {
    if (chaveAberta !== null) campo.current?.focus();
  }, [chaveAberta]);

  /* Fechar devolve o foco a quem abriu — senão a navegação por teclado cai no
     começo do documento e a pessoa perde o lugar.
     O `focus()` acontece FORA do atualizador de estado, e isso não é estilo:
     React executa o atualizador durante o render, e dar foco ali dispara o
     `onFocus` do botão, que chama `setFocado` — atualizar estado no meio de um
     render é o aviso que o React emite e o defeito que ele descreve. */
  const fechar = useCallback(() => {
    const indice = pedido
      ? controles.findIndex((controle) => controle.chave === pedido.chave)
      : -1;
    setPedido(null);
    if (indice >= 0) {
      setFocado(indice);
      botoes.current[indice]?.focus();
    }
  }, [controles, pedido]);

  const acionar = useCallback(
    (controle, indice, situacao) => {
      setFocado(indice);
      if (!situacao?.disponivel) return;

      if (!controle.pede) {
        controle.aplicar(editor);
        return;
      }
      // Elemento que pede dado abre o campo em vez de agir às cegas. Se já
      // estiver aplicado, o campo nasce preenchido — editar um link é a mesma
      // ação de criar um, com o endereço que já existe dentro.
      setPedido((aberto) =>
        aberto?.chave === controle.chave
          ? null
          : {
              chave: controle.chave,
              valor: controle.valorAtual(editor),
              aplicado: Boolean(situacao?.ativo),
              problema: "",
            },
      );
    },
    [editor],
  );

  const confirmar = useCallback(
    (controle) => {
      if (!pedido) return;
      const desfecho = controle.aplicar(editor, pedido.valor);
      if (desfecho === true) {
        fechar();
        return;
      }
      // A frase vem do schema — a barra não sabe o que é um endereço, e sabe
      // menos ainda qual das duas causas explicou a recusa.
      setPedido((aberto) =>
        aberto === null
          ? null
          : { ...aberto, problema: controle.recusa(desfecho, pedido.valor) },
      );
    },
    [editor, fechar, pedido],
  );

  /** Setas, Home e End movem o foco DENTRO da barra, como o papel exige. */
  const navegar = useCallback(
    (evento, indice) => {
      const salto =
        evento.key === "ArrowRight" || evento.key === "ArrowDown"
          ? 1
          : evento.key === "ArrowLeft" || evento.key === "ArrowUp"
            ? -1
            : 0;
      let destino = null;
      if (salto !== 0) {
        destino = (indice + salto + controles.length) % controles.length;
      } else if (evento.key === "Home") {
        destino = 0;
      } else if (evento.key === "End") {
        destino = controles.length - 1;
      }
      if (destino === null) return;
      evento.preventDefault();
      setFocado(destino);
      botoes.current[destino]?.focus();
    },
    [controles.length],
  );

  const controleAberto = pedido
    ? controles.find((controle) => controle.chave === pedido.chave)
    : null;

  return (
    <div className={cn("border-b border-border-soft", className)}>
      <div
        role="toolbar"
        aria-label="Formatação do texto"
        aria-orientation="horizontal"
        className="flex flex-wrap items-center gap-1 px-2 py-1.5"
      >
        {controles.map((controle, indice) => {
          const situacao = situacoes?.[indice] ?? { ativo: false, disponivel: false };
          const Icone = ICONES[controle.chave] ?? null;
          const aberto = pedido?.chave === controle.chave;
          const dica = [
            controle.rotulo,
            controle.atalhoLegivel ? ` (${controle.atalhoLegivel})` : "",
            " — ",
            controle.descricao,
          ].join("");

          return (
            <Button
              key={controle.chave}
              ref={(no) => {
                botoes.current[indice] = no;
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
              aria-expanded={controle.pede ? aberto : undefined}
              aria-controls={controle.pede && aberto ? idDoFormulario : undefined}
              tabIndex={indice === focado ? 0 : -1}
              title={dica}
              onKeyDown={(evento) => navegar(evento, indice)}
              onFocus={() => setFocado(indice)}
              onClick={() => acionar(controle, indice, situacao)}
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
      </div>

      {controleAberto ? (
        <form
          id={idDoFormulario}
          className="flex flex-wrap items-end gap-2 border-t border-border-soft px-2 py-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            confirmar(controleAberto);
          }}
        >
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <Label htmlFor={idDoCampo} className="text-xs text-ink-muted">
              {controleAberto.pede.rotulo}
            </Label>
            <Input
              id={idDoCampo}
              ref={campo}
              type="text"
              inputMode="url"
              value={pedido.valor}
              placeholder={controleAberto.pede.exemplo}
              aria-invalid={pedido.problema !== "" ? "true" : undefined}
              aria-describedby={pedido.problema ? idDoProblema : undefined}
              onChange={(evento) =>
                setPedido((aberto) =>
                  aberto === null
                    ? null
                    : { ...aberto, valor: evento.target.value, problema: "" },
                )
              }
              onKeyDown={(evento) => {
                if (evento.key === "Escape") {
                  evento.preventDefault();
                  fechar();
                }
              }}
              className={cn(ANEL_DE_FOCO)}
            />
          </div>

          <Button type="submit" size="sm" className={cn(ANEL_DE_FOCO)}>
            {`Aplicar ${controleAberto.rotulo.toLowerCase()}`}
          </Button>

          {pedido.aplicado ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(ANEL_DE_FOCO)}
              onClick={() => {
                controleAberto.aplicar(editor, "");
                fechar();
              }}
            >
              {`Remover ${controleAberto.rotulo.toLowerCase()}`}
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(ANEL_DE_FOCO)}
            onClick={() => fechar()}
          >
            Fechar o campo
          </Button>

          {pedido.problema ? (
            <p
              id={idDoProblema}
              role="alert"
              className="w-full text-xs text-destructive"
            >
              {pedido.problema}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
