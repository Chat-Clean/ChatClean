/**
 * O punho que redimensiona a imagem selecionada — a bolinha no canto superior
 * direito, presa à borda.
 *
 * ─── POR QUE SOBREPOSIÇÃO, E NÃO UM NODEVIEW ────────────────────────────────
 *
 * Um `NodeView` em React para a imagem seria o caminho óbvio, e é o errado
 * aqui: a extensão `Image` é montada em `admin/blog/configuracao.js`, que
 * precisa continuar Node-executável (sem React, sem JSX) para a verificação
 * derivar a barra sem montar navegador. Trocá-la por uma versão com NodeView
 * exigiria ou mover a extensão para fora dali — e a verificação deixaria de
 * ver a lista completa de extensões —, ou montar duas vezes o mesmo nó, que o
 * Tiptap recusa por nome duplicado.
 *
 * A sobreposição não tem esse custo: ela lê a posição da imagem selecionada e
 * se desenha por cima, em `position: fixed`. O documento continua sendo
 * exatamente o que o schema declara, e `configuracao.js` continua puro.
 *
 * ─── O QUE ELE GRAVA ────────────────────────────────────────────────────────
 *
 * `width`, em pixels, no próprio nó — atributo do vocabulário fechado
 * (`NOS.image`, em `domain/blog/schema.js`), emitido como `width="640"` pelo
 * renderizador e aceito pela restrição do banco. É isso que faz o tamanho
 * sobreviver ao salvamento: sem o atributo no schema, redimensionar seria
 * efeito de tela, desfeito na próxima abertura do Post.
 *
 * A ALTURA NÃO É GRAVADA. A proporção vem do CSS (`height: auto`), e gravar as
 * duas medidas abriria a porta para um par inconsistente — uma imagem esticada
 * que nenhum arrasto proporcional consegue produzir.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* Só a função: os limites são aplicados DENTRO dela, e importá-los aqui
   convidaria alguém a prendê-los uma segunda vez, num lugar que poderia
   divergir do primeiro. */
import { larguraRedimensionada } from "@/admin/blog/arrasto";

/** O diâmetro da bolinha, em pixels. */
const DIAMETRO = 14;

export default function PunhoDeRedimensionar({ editor }) {
  const [medida, setMedida] = useState(null);
  const arrastando = useRef(null);

  /**
   * Onde está a imagem selecionada, se houver uma.
   *
   * `null` some com o punho — e some por vários motivos legítimos: nada
   * selecionado, seleção de texto, outro tipo de nó. Só imagem tem punho.
   */
  const medirSelecionada = useCallback(() => {
    if (!editor || editor.isDestroyed) return null;
    const selecao = editor.state.selection;
    const no = selecao?.node;
    if (!no || no.type?.name !== "image") return null;

    const dom = editor.view.nodeDOM(selecao.from);
    const elemento = dom?.nodeType === 1 ? dom : null;
    if (elemento === null || elemento.tagName !== "IMG") return null;

    const caixa = elemento.getBoundingClientRect();
    if (caixa.width < 1) return null;

    /* A MEDIDA É RELATIVA À CAIXA QUE ROLA, e não à janela. Em coordenada de
       janela (`position: fixed`) o punho passava por cima da barra de
       formatação e continuava desenhado até fora do editor — nada o
       recortava, porque `fixed` ignora o `overflow` de qualquer ancestral.
       Em coordenada da caixa, ele é `absolute` dentro dela: o
       `overflow-y-auto` o recorta, e ele acompanha a rolagem sozinho, sem
       precisar de ouvinte de rolagem para se reposicionar. */
    const pai = elemento.closest("[data-papel='caixa-que-rola']");
    if (pai === null) return null;
    const caixaDoPai = pai.getBoundingClientRect();

    return {
      topo: caixa.top - caixaDoPai.top + pai.scrollTop,
      direita: caixa.right - caixaDoPai.left + pai.scrollLeft,
      largura: caixa.width,
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return undefined;

    /* A medida é refeita a cada transação (a seleção mudou, o documento
       mudou) e também a cada rolagem ou redimensionamento da janela — o punho
       é `fixed`, então ele precisa acompanhar a imagem quando ela se move na
       tela sem que o documento mude. */
    const remedir = () => setMedida(medirSelecionada());

    editor.on("selectionUpdate", remedir);
    editor.on("transaction", remedir);
    window.addEventListener("scroll", remedir, true);
    window.addEventListener("resize", remedir);
    remedir();

    return () => {
      editor.off("selectionUpdate", remedir);
      editor.off("transaction", remedir);
      window.removeEventListener("scroll", remedir, true);
      window.removeEventListener("resize", remedir);
    };
  }, [editor, medirSelecionada]);

  /* O arrasto do punho é por PONTEIRO, e não pelo arrasto de HTML5: aqui não
     há nada a soltar em lugar nenhum — é um gesto de medida, e o de HTML5
     traria junto a miniatura, o cursor de soltura e a linha de previsão, que
     não têm o que dizer sobre largura. */
  useEffect(() => {
    const aoMover = (evento) => {
      const inicio = arrastando.current;
      if (inicio === null) return;
      evento.preventDefault();

      const largura = larguraRedimensionada({
        larguraInicial: inicio.largura,
        deslocamento: evento.clientX - inicio.x,
      });
      setMedida((atual) => (atual === null ? atual : { ...atual, largura }));

      if (editor && !editor.isDestroyed) {
        editor.commands.updateAttributes("image", { width: largura });
      }
    };

    const aoSoltar = () => {
      arrastando.current = null;
      document.body.removeAttribute("data-redimensionando-imagem");
      setMedida(medirSelecionada());
    };

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoSoltar);
    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoSoltar);
    };
  }, [editor, medirSelecionada]);

  if (medida === null) return null;

  return (
    <button
      type="button"
      data-papel="punho-de-redimensionar"
      aria-label="Redimensionar a imagem"
      title="Arraste para redimensionar. A proporção é mantida."
      onPointerDown={(evento) => {
        evento.preventDefault();
        arrastando.current = { x: evento.clientX, largura: medida.largura };
        document.body.setAttribute("data-redimensionando-imagem", "true");
      }}
      style={{
        /* `absolute`, e não `fixed`: é o que faz o `overflow` da caixa que
           rola recortar o punho — e o que o mantém colado à imagem enquanto
           o texto rola, sem ouvinte nenhum. */
        position: "absolute",
        /* Centrada NA QUINA: metade do diâmetro para fora nos dois eixos, de
           modo que a bolinha fique montada sobre a borda, e não ao lado dela. */
        top: medida.topo - DIAMETRO / 2,
        left: medida.direita - DIAMETRO / 2,
        width: DIAMETRO,
        height: DIAMETRO,
        borderRadius: "9999px",
        background: "var(--brand-action, #007a2a)",
        border: "2px solid var(--surface, #ffffff)",
        boxShadow: "0 1px 4px rgba(15, 23, 42, 0.35)",
        cursor: "ew-resize",
        padding: 0,
        /* Baixo de propósito: o punho fica acima da imagem, e abaixo de
           qualquer coisa que o editor sobreponha. Era 55 quando ele era
           `fixed` e disputava com a barra de formatação; dentro da caixa que
           rola, não há mais com quem disputar. */
        zIndex: 2,
        touchAction: "none",
      }}
    />
  );
}
