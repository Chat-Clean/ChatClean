/**
 * O botão de Upload de Imagem do Editor — nó EFÊMERO, nunca gravado.
 *
 * `imageUpload` não existe em `domain/blog/schema.js`, e essa ausência é
 * deliberada: ele é um WIDGET de envio, não conteúdo. O Autor clica, escolhe
 * o arquivo, e o widget se transforma no nó real (`image`, do vocabulário
 * fechado) assim que o envio termina — a mesma troca que o código-fonte
 * oficial do Tiptap UI Components faz (`image-upload-node`,
 * `npx @tiptap/cli@latest add image-upload-node`), aqui retemado para os
 * tokens do Painel em vez do CSS que o pacote propõe. Se o Autor salvar o
 * post com um envio pendente ou abandonado, o widget cai como qualquer nó
 * fora do vocabulário — `validarDocumento` já garante isso, sem que este
 * arquivo precise de nenhum cuidado extra.
 *
 * `.jsx` de propósito, e por isso NUNCA importado por `admin/blog/configuracao.js`:
 * aquele arquivo precisa continuar Node-executável (sem JSX, sem DOM) para a
 * verificação derivar a barra sem montar navegador. A extensão daqui entra na
 * lista de extensões só dentro de `Editor.jsx`, que já é `.jsx` e já monta o
 * editor de verdade.
 */

import { useId, useRef, useState } from "react";
import { Node, ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { Check, ImageIcon, Loader2, UploadCloud, X } from "lucide-react";

import {
  ACEITO_NO_SELETOR,
  TAMANHO_MAXIMO_DA_IMAGEM,
} from "@/domain/blog/arquivos";
import { enviarImagemDoCorpo } from "@/data/blog/arquivos";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A UI do widget: zona de soltar/clicar quando ocioso, barra de progresso
 * enquanto envia, mensagem de recusa com um jeito de tentar de novo.
 *
 * O upload em si é `enviarImagemDoCorpo` (`data/blog/arquivos.js`) — a MESMA
 * infraestrutura de bucket, limite e validação por assinatura de bytes que
 * `enviarImagemDeCapa` já usa, só que numa pasta própria (`corpo/`, não
 * `capas/`). Este componente não valida nada por conta própria: a recusa que
 * ele mostra é a MESMA frase que o domínio produz.
 */
function ImageUploadNodeView({ editor, getPos, node, deleteNode, selected }) {
  const [estado, setEstado] = useState("ocioso");
  const [mensagem, setMensagem] = useState("");
  // O endereço já subido, enquanto o widget está em "revisando" — a imagem
  // já está no bucket; falta só o Autor confirmar a descrição antes dela
  // virar conteúdo de verdade.
  const [enderecoEnviado, setEnderecoEnviado] = useState("");
  const [descricao, setDescricao] = useState("");
  const entrada = useRef(null);
  const idDaDescricao = useId();

  /**
   * A descrição É PERGUNTADA, e não deixada vazia por padrão. A capa do Post
   * já cobra `alt` como par obrigatório (`posts_imagem_exige_alt`) — o corpo
   * não tem essa restrição no banco (uma imagem SEM descrição continua um
   * documento válido, `atributosObrigatorios` de `NOS.image` só exige `src`),
   * mas nascer sempre com `alt=""` tornaria toda imagem inserida por este
   * caminho decorativa para sempre, sem que o Autor tivesse a chance de
   * escrever a frase. Este passo de revisão é essa chance — opcional de
   * pular (`Inserir sem descrição`), nunca pulado por omissão.
   */
  const inserirImagem = (url, alt) => {
    /* O editor pode ter sido desmontado ENQUANTO o envio estava no ar — o
       Autor saiu da tela, ou trocou de Post, antes de `enviarImagemDoCorpo`
       resolver. Chamar `.chain()` num editor destruído lança, e a imagem já
       subiu para o Storage de qualquer forma: o arquivo vira órfão comum
       (mesmo custo aceito para a capa), não um erro a mais na tela que já
       não existe. */
    if (editor.isDestroyed) return;
    const posicao = getPos();
    if (typeof posicao !== "number") return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: posicao, to: posicao + node.nodeSize })
      .insertContentAt(posicao, { type: "image", attrs: { src: url, alt: alt.trim() } })
      .run();
  };

  /* Sem barra de progresso de verdade: `enviarImagemDoCorpo` (como
     `enviarImagemDeCapa`, que a espelha) não expõe evento de progresso do
     Storage — só `{ ok, dados }` ou `{ ok: false, erro }` ao final. Um número
     que nunca muda de 0% até saltar para 100% mentiria mais do que um
     indicador sem número. */
  const enviar = async (arquivo) => {
    if (!arquivo) return;
    setEstado("enviando");
    setMensagem("");
    const resultado = await enviarImagemDoCorpo(arquivo);
    // Mesma guarda de `inserirImagem`: nada de `setState` sobre um nó que o
    // editor já desmontou enquanto a rede ainda respondia.
    if (editor.isDestroyed) return;
    if (!resultado.ok) {
      setEstado("recusado");
      setMensagem(resultado.erro.mensagem);
      return;
    }
    setEnderecoEnviado(resultado.dados.url);
    setEstado("revisando");
  };

  const aoEscolherArquivo = (evento) => {
    const arquivo = evento.target.files?.[0] ?? null;
    evento.target.value = "";
    if (arquivo) enviar(arquivo);
  };

  const [arrastando, setArrastando] = useState(false);
  const aoSoltar = (evento) => {
    evento.preventDefault();
    setArrastando(false);
    // MESMA guarda do clique: um arquivo solto enquanto o envio anterior
    // ainda está no ar não deve disparar um SEGUNDO envio concorrente — os
    // dois terminariam competindo pela mesma posição do widget.
    if (estado !== "ocioso") return;
    const arquivo = evento.dataTransfer?.files?.[0] ?? null;
    if (arquivo) enviar(arquivo);
  };

  return (
    <NodeViewWrapper
      data-papel="envio-de-imagem"
      /* O NÓ NASCE SELECIONADO — é o comportamento padrão do ProseMirror ao
         inserir um nó atômico — e a SELEÇÃO DE NÓ é implementada com a mesma
         API de seleção de TEXTO do navegador. `::selection` de `index.css`
         (fundo verde, texto branco — pensado para o site público) passava a
         valer aqui por tabela: o texto do widget nascia branco, e só ficava
         preto de novo quando o Autor clicava fora. `selection:text-inherit
         selection:bg-transparent` neutraliza isso NESTE elemento e nos
         filhos — o texto não muda de cor nunca, seja qual for o estado de
         seleção nativa.

         O indicador de seleção de verdade é outro: um anel visível quando
         `selected` (a prop que `ReactNodeViewRenderer` passa quando este é o
         nó atualmente selecionado), no mesmo tom do anel de foco do resto do
         Painel — cor, não texto invertido. */
      className={cn(
        "my-3 rounded-cartao selection:bg-transparent selection:text-inherit",
        selected && "ring-2 ring-brand-action ring-offset-2 ring-offset-surface",
      )}
      tabIndex={0}
      onKeyDown={(evento) => {
        if (
          (evento.key === "Enter" || evento.key === " ") &&
          estado === "ocioso"
        ) {
          evento.preventDefault();
          entrada.current?.click();
        }
      }}
    >
      {estado === "revisando" ? (
        <div className="flex flex-col gap-3 rounded-cartao border border-border-soft bg-surface p-3">
          <img
            src={enderecoEnviado}
            alt=""
            className="max-h-40 w-auto self-center rounded-controle object-contain"
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={idDaDescricao} className="text-sm font-semibold text-ink">
              Descrição da imagem
            </label>
            <input
              id={idDaDescricao}
              type="text"
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
              placeholder="O que a imagem mostra, em uma frase"
              className={cn(
                ANEL_DE_FOCO,
                "w-full rounded-controle border border-border-soft bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted",
              )}
            />
            <p className="text-xs text-ink-muted">
              É o que quem não enxerga a imagem recebe no lugar dela.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO)}
              onClick={() => deleteNode()}
            >
              <X aria-hidden="true" className="size-4" />
              Descartar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO)}
              onClick={() => inserirImagem(enderecoEnviado, "")}
            >
              Inserir sem descrição
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO, "gap-1.5")}
              onClick={() => inserirImagem(enderecoEnviado, descricao)}
            >
              <Check aria-hidden="true" className="size-4" />
              Inserir imagem
            </Button>
          </div>
        </div>
      ) : estado !== "recusado" ? (
        <button
          type="button"
          onClick={() => estado === "ocioso" && entrada.current?.click()}
          onDragOver={(evento) => {
            evento.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={aoSoltar}
          disabled={estado === "enviando"}
          className={cn(
            ANEL_DE_FOCO,
            "flex w-full flex-col items-center justify-center gap-2 rounded-cartao border-2 border-dashed px-4 py-8 text-center text-sm transition-colors",
            arrastando
              ? "border-brand-action bg-brand-wash"
              : "border-border-strong bg-surface-sunk",
            estado === "enviando" ? "cursor-wait" : "cursor-pointer",
          )}
        >
          {estado === "enviando" ? (
            <>
              <Loader2 aria-hidden="true" className="size-6 animate-spin text-brand-chrome" />
              <span className="text-ink-muted">Enviando imagem…</span>
            </>
          ) : (
            <>
              <UploadCloud aria-hidden="true" className="size-6 text-ink-muted" />
              <span className="text-ink">
                Clique para enviar uma imagem, ou arraste-a até aqui
              </span>
              <span className="text-xs text-ink-muted">
                JPEG, PNG ou WebP, até 1 MB
              </span>
            </>
          )}
        </button>
      ) : (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-cartao border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-ink"
        >
          <div className="flex items-start gap-2">
            <ImageIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{mensagem}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO)}
              onClick={() => {
                setEstado("ocioso");
                setMensagem("");
              }}
            >
              Tentar de novo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO)}
              onClick={() => deleteNode()}
            >
              <X aria-hidden="true" className="size-4" />
              Cancelar
            </Button>
          </div>
        </div>
      )}
      <input
        ref={entrada}
        type="file"
        accept={ACEITO_NO_SELETOR}
        className="sr-only"
        aria-label="Escolher arquivo de imagem para inserir no texto"
        onChange={aoEscolherArquivo}
      />
    </NodeViewWrapper>
  );
}

/**
 * A extensão. Nó atômico de BLOCO, fora do vocabulário fechado do documento
 * de propósito (ver o cabeçalho deste arquivo) — `setImageUploadNode()` é o
 * comando que a insere no lugar do cursor; `BarraDoEditor.jsx` é quem chama.
 */
export const ExtensaoDeUploadDeImagem = Node.create({
  name: "imageUpload",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      accept: ACEITO_NO_SELETOR,
      maxSize: TAMANHO_MAXIMO_DA_IMAGEM,
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="image-upload"]' }];
  },

  renderHTML() {
    return ["div", { "data-type": "image-upload" }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageUploadNodeView);
  },

  addCommands() {
    return {
      setImageUploadNode:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});

export default ExtensaoDeUploadDeImagem;
