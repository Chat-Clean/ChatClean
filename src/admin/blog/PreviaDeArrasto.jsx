/**
 * A prévia que segue o cursor enquanto uma imagem do corpo é arrastada.
 *
 * ─── POR QUE ELA EXISTE ─────────────────────────────────────────────────────
 *
 * O arrasto de imagem do ProseMirror é o de HTML5, e nele quem desenha a
 * miniatura que acompanha o cursor é o SISTEMA OPERACIONAL — em tamanho real e
 * translúcida. Aquela transparência não é CSS: `opacity: 1` na cópia não a
 * alcança, e não há propriedade que a desligue. A única saída é o navegador não
 * desenhar nada, e a prévia ser nossa.
 *
 * `configuracao.js` faz a primeira metade (troca o retrato nativo por um pixel
 * invisível e avisa por `CustomEvent`); este componente faz a segunda.
 *
 * ─── E POR QUE NÃO É O `Reorder` DO MOTION ──────────────────────────────────
 *
 * `Reorder` é para LISTA PLANA: recebe `values`, devolve `onReorder`, arrasta
 * por ponteiro e quer mandar no DOM dos filhos. Um Post não é lista plana — é
 * documento com parágrafos, títulos e imagens entremeados —, e quem manda no
 * DOM ali dentro é o ProseMirror. Adotá-lo significaria trocar o sistema de
 * arrasto inteiro e, com ele, perder a LINHA VERDE que prevê onde a imagem cai
 * (é o arrasto de HTML5 que a produz) e toda a lógica de onde se pode soltar.
 *
 * Então o Motion entra pela porta certa: ele anima a prévia — mola no
 * acompanhamento, entrada em escala —, e o arrasto continua sendo o do
 * ProseMirror. O ganho que o `Reorder` traria já está aqui; o que ele custaria
 * não se paga.
 *
 * ─── A ORIGEM SOME COM ANIMAÇÃO ─────────────────────────────────────────────
 *
 * Não some seco: `body[data-arrastando-imagem]` é a marca que `index.css` usa
 * para encolher e desvanecer a imagem no lugar de origem — e para trazê-la de
 * volta, pelo mesmo caminho, quando o arrasto termina em qualquer desfecho.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** Largura da prévia. Pequena o bastante para não cobrir o que se está mirando. */
const LARGURA = 132;

/**
 * O quanto a prévia fica ABAIXO e à direita do cursor.
 *
 * Não é centralizada nele de propósito: centralizada, a prévia cobre
 * exatamente o ponto onde a linha verde aparece — que é justamente o que a
 * pessoa está tentando enxergar para decidir onde soltar.
 */
const AFASTAMENTO = 14;

export default function PreviaDeArrasto() {
  const [arrasto, setArrasto] = useState(null);
  const [ponto, setPonto] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const aoComecar = (evento) => {
      const endereco = evento?.detail?.endereco ?? "";
      if (endereco === "") return;
      setArrasto({
        endereco,
        proporcao: Number(evento?.detail?.proporcao) || 1,
      });
    };
    const aoTerminar = () => setArrasto(null);

    /* `dragover` no documento é o que dá coordenada DURANTE o arrasto de
       HTML5: o evento `drag` da origem chega com coordenada zerada no fim em
       alguns navegadores, e `mousemove` não dispara enquanto se arrasta. */
    const aoMover = (evento) => {
      setPonto({ x: evento.clientX, y: evento.clientY });
    };

    document.addEventListener("painel:arrasto-de-imagem", aoComecar);
    document.addEventListener("painel:arrasto-de-imagem-fim", aoTerminar);
    document.addEventListener("dragover", aoMover);
    /* Rede de segurança: se o `dragend` não chegar por algum motivo, um
       `drop` em qualquer lugar do documento também encerra a prévia — ela
       nunca pode ficar presa na tela depois que o arrasto acabou. */
    document.addEventListener("drop", aoTerminar);

    return () => {
      document.removeEventListener("painel:arrasto-de-imagem", aoComecar);
      document.removeEventListener("painel:arrasto-de-imagem-fim", aoTerminar);
      document.removeEventListener("dragover", aoMover);
      document.removeEventListener("drop", aoTerminar);
    };
  }, []);

  return (
    <AnimatePresence>
      {arrasto ? (
        <motion.img
          key="previa-de-arrasto"
          src={arrasto.endereco}
          alt=""
          aria-hidden="true"
          data-papel="previa-de-arrasto"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ type: "spring", stiffness: 520, damping: 30 }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: LARGURA,
            height: LARGURA / arrasto.proporcao,
            /* `translate` em vez de `top`/`left`: transformação não passa pelo
               layout, e é o que mantém o acompanhamento fluido. */
            x: ponto.x + AFASTAMENTO,
            y: ponto.y + AFASTAMENTO,
            objectFit: "cover",
            borderRadius: 8,
            /* A prévia não pode receber ponteiro: se recebesse, ela ficaria
               entre o cursor e o editor, e o `dragover` que decide onde a
               linha verde aparece pararia de chegar ao ProseMirror. */
            pointerEvents: "none",
            zIndex: 60,
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.28)",
          }}
        />
      ) : null}
    </AnimatePresence>
  );
}
