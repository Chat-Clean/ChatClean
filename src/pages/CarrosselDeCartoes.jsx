/**
 * Um cartão por vez, numa faixa que rola de lado.
 *
 * Nasceu em `Blog.jsx`, como o carrossel dos Posts em destaque, e saiu de lá
 * quando as Notícias em vídeo passaram a precisar do MESMO comportamento: duas
 * cópias de 170 linhas de arrasto e encaixe divergiriam na primeira correção.
 * O que muda entre os dois é dado: o título da faixa, as frases, e o cartão,
 * que quem chama desenha por `renderizar`.
 *
 * A rolagem é a do NAVEGADOR (`scroll-snap`), e não uma animação nossa: o dedo
 * arrasta no celular, o trackpad e o teclado funcionam sem código, e as setas e
 * os pontos só pedem ao trilho que role até um cartão. Não há troca automática:
 * um cartão que some sozinho tira o texto de quem estava lendo.
 *
 * O cartão seguinte aparece na beirada, no celular e no computador: é o que diz
 * que há mais. No computador o trilho também se arrasta com o mouse.
 */

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* Em pixels. Abaixo do primeiro, o gesto ainda é um clique; acima do segundo,
   o arrasto troca de cartão ao soltar. */
const LIMIAR_DO_ARRASTO = 6;
const LIMIAR_DE_TROCA = 40;

const BOTAO_DO_CARROSSEL =
  "grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-emerald-950/15 bg-white text-emerald-950 transition-colors hover:bg-emerald-950 hover:text-creme disabled:pointer-events-none disabled:opacity-35";

/**
 * @param {Array}    itens        o que a faixa mostra; cada um precisa de `id`
 * @param {string}   titulo       a linha acima da faixa, e o nome do grupo
 * @param {Function} renderizar   recebe o item e devolve o cartão dele
 * @param {object}   rotulos      `{ anterior, proximo, irPara(posicao, total) }`
 * @param {object}   acoes        `{ anterior, proximo }`: os `data-acao` das setas
 * @param {string}   papelDoTrilho  o `data-papel` do trilho
 * @param {ReactNode} complemento  o que vai ao lado das setas (um link, por exemplo)
 */
export default function CarrosselDeCartoes({
  itens,
  titulo,
  renderizar,
  rotulos,
  acoes,
  papelDoTrilho,
  complemento = null,
}) {
  const trilho = useRef(null);
  const [ativo, setAtivo] = useState(0);
  const atual = Math.min(ativo, itens.length - 1);

  /* A distância entre o começo de um cartão e o do seguinte. */
  const passoDoTrilho = () => {
    const filhos = trilho.current?.children;
    return filhos && filhos.length > 1 ? filhos[1].offsetLeft - filhos[0].offsetLeft : 0;
  };

  const aoRolar = () => {
    const passo = passoDoTrilho();
    if (passo <= 0) return;
    const indice = Math.round(trilho.current.scrollLeft / passo);
    setAtivo(Math.min(itens.length - 1, Math.max(0, indice)));
  };

  const irPara = (indice) => {
    trilho.current?.scrollTo({ left: indice * passoDoTrilho() });
  };

  /* ── ARRASTAR COM O MOUSE ──────────────────────────────────────────────
     O dedo já arrasta sozinho (é rolagem nativa); o mouse não, e por isso só
     ele é tratado aqui. Enquanto arrasta, o trilho segue o cursor sem encaixe
     e sem suavização; ao soltar, vai para o cartão vizinho na direção do
     arrasto — ou volta ao mesmo, se o movimento foi curto.

     O clique que fecha um arrasto é descartado: sem isso, soltar o mouse em
     cima do cartão abriria o que a pessoa só queria empurrar de lado. */
  const arrasto = useRef({ ativo: false, moveu: false, x: 0, rolagem: 0, indice: 0 });

  const aoApertar = (evento) => {
    if (evento.pointerType !== "mouse" || evento.button !== 0) return;
    arrasto.current = {
      ativo: true,
      moveu: false,
      x: evento.clientX,
      rolagem: trilho.current.scrollLeft,
      indice: atual,
    };
  };

  const aoMover = (evento) => {
    const a = arrasto.current;
    if (!a.ativo) return;
    const dx = evento.clientX - a.x;
    const el = trilho.current;
    if (!a.moveu) {
      if (Math.abs(dx) < LIMIAR_DO_ARRASTO) return;
      a.moveu = true;
      el.setPointerCapture?.(evento.pointerId);
      el.style.scrollSnapType = "none";
      el.style.scrollBehavior = "auto";
      el.style.userSelect = "none";
      el.style.cursor = "grabbing";
    }
    el.scrollLeft = a.rolagem - dx;
  };

  const aoSoltar = (evento) => {
    const a = arrasto.current;
    if (!a.ativo) return;
    a.ativo = false;
    if (!a.moveu) return;
    const el = trilho.current;
    const dx = evento.clientX - a.x;
    const vizinho = Math.abs(dx) > LIMIAR_DE_TROCA ? a.indice + (dx < 0 ? 1 : -1) : a.indice;
    const destino = Math.min(itens.length - 1, Math.max(0, vizinho));
    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.style.userSelect = "";
    el.style.cursor = "";
    el.scrollTo({ left: destino * passoDoTrilho(), behavior: semMovimento ? "auto" : "smooth" });
    /* O encaixe só volta depois de a rolagem assentar: religado antes, o
       navegador saltaria para o cartão mais próximo no meio do caminho. */
    setTimeout(() => {
      el.style.scrollSnapType = "";
      el.style.scrollBehavior = "";
    }, 500);
  };

  const aoClicarNoTrilho = (evento) => {
    if (!arrasto.current.moveu) return;
    arrasto.current.moveu = false;
    evento.preventDefault();
    evento.stopPropagation();
  };

  const varios = itens.length > 1;

  return (
    <div role="group" aria-roledescription="carrossel" aria-label={titulo}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">{titulo}</p>
        <div className="flex items-center gap-3">
          {complemento}
          {varios && (
            <div className="hidden items-center gap-2 md:flex">
              <button
                type="button"
                data-acao={acoes.anterior}
                aria-label={rotulos.anterior}
                disabled={atual === 0}
                onClick={() => irPara(atual - 1)}
                className={BOTAO_DO_CARROSSEL}
              >
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                type="button"
                data-acao={acoes.proximo}
                aria-label={rotulos.proximo}
                disabled={atual === itens.length - 1}
                onClick={() => irPara(atual + 1)}
                className={BOTAO_DO_CARROSSEL}
              >
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={trilho}
        onScroll={aoRolar}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onClickCapture={aoClicarNoTrilho}
        onDragStart={(evento) => evento.preventDefault()}
        data-papel={papelDoTrilho}
        className={`sem-barra-de-rolagem -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 motion-reduce:scroll-auto md:mx-0 md:scroll-px-0 md:gap-6 md:px-0 ${
          varios ? "md:cursor-grab" : ""
        }`}
      >
        {itens.map((item, i) => (
          <div
            key={item.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${itens.length}`}
            /* Sozinho, o cartão ocupa a faixa inteira: a beirada do próximo só
               existe quando há um próximo. */
            className={varios ? "w-[88%] shrink-0 snap-start md:w-[92%]" : "w-full shrink-0"}
          >
            {renderizar(item)}
          </div>
        ))}
      </div>

      {varios && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {itens.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={rotulos.irPara(i + 1, itens.length)}
              aria-current={i === atual ? "true" : undefined}
              onClick={() => irPara(i)}
              className="grid h-6 place-items-center cursor-pointer"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-300 ${
                  i === atual ? "w-6 bg-emerald-950" : "w-2 bg-emerald-950/25"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
