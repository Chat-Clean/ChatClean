/**
 * O gráfico de leituras por dia.
 *
 * ─── A FORMA ────────────────────────────────────────────────────────────────
 *
 * Uma série só, ao longo do tempo: linha, com a área embaixo dela em tom leve.
 * Sem legenda, porque não há segunda série de que distinguir a primeira, e o
 * título do cartão já diz o que está desenhado. A grade e os eixos são
 * recessivos; o que chama a atenção é o dado.
 *
 * ─── DESENHADO À MÃO, EM SVG ────────────────────────────────────────────────
 *
 * Uma biblioteca de gráficos entraria no pacote que o site público também
 * baixa, para desenhar uma linha. O que há aqui é uma escala, um caminho e uma
 * camada de ponteiro.
 *
 * ─── A LEITURA NÃO DEPENDE DO PONTEIRO ──────────────────────────────────────
 *
 * Passar o ponteiro acha o dia mais próximo e mostra o valor dele. Quem navega
 * por teclado foca o gráfico e anda pelos dias com as setas, e ouve o mesmo
 * texto. E a tela que monta este componente oferece os mesmos números numa
 * tabela: o que o gráfico mostra nunca fica preso nele.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  diaCompleto,
  diaCurto,
  escalaDeValores,
  marcasDoTempo,
  textoDeLeituras,
} from "@/admin/blog/leituras";
import { formatarNumero } from "@/domain/blog/formato";

/** As margens do desenho: onde moram os rótulos dos dois eixos. */
const MARGEM = Object.freeze({ topo: 12, direita: 16, base: 28, esquerda: 44 });

/** A largura usada enquanto o contêiner ainda não foi medido. */
const LARGURA_INICIAL = 640;

export default function GraficoDeLeituras({ serie, altura = 260 }) {
  const pontos = useMemo(() => (Array.isArray(serie) ? serie : []), [serie]);
  const moldura = useRef(null);
  const [largura, setLargura] = useState(LARGURA_INICIAL);
  /* O dia em foco: índice do ponto sob o ponteiro ou escolhido pelo teclado. */
  const [ativo, setAtivo] = useState(null);

  /* O gráfico é desenhado em pixels de tela, e não esticado: texto dentro de um
     desenho esticado estica junto. A largura vem do contêiner, e muda com ele. */
  useEffect(() => {
    const alvo = moldura.current;
    if (!alvo) return undefined;
    const medir = () => {
      const medida = alvo.getBoundingClientRect().width;
      if (medida > 0) setLargura(medida);
    };
    medir();
    if (typeof ResizeObserver !== "function") return undefined;
    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  /* Trocar de período troca a série; o dia em foco era da série anterior. */
  useEffect(() => {
    setAtivo(null);
  }, [pontos]);

  const maximo = pontos.reduce((maior, p) => Math.max(maior, Number(p.total) || 0), 0);
  const { topo, marcas } = escalaDeValores(maximo);

  const larguraUtil = Math.max(1, largura - MARGEM.esquerda - MARGEM.direita);
  const alturaUtil = Math.max(1, altura - MARGEM.topo - MARGEM.base);
  const xDe = (i) =>
    MARGEM.esquerda + (pontos.length <= 1 ? larguraUtil / 2 : (i * larguraUtil) / (pontos.length - 1));
  const yDe = (valor) => MARGEM.topo + alturaUtil - (valor / topo) * alturaUtil;
  const chao = yDe(0);

  const linha = pontos
    .map((p, i) => `${i === 0 ? "M" : "L"}${xDe(i).toFixed(2)},${yDe(Number(p.total) || 0).toFixed(2)}`)
    .join(" ");
  const area =
    pontos.length === 0
      ? ""
      : `${linha} L${xDe(pontos.length - 1).toFixed(2)},${chao} L${xDe(0).toFixed(2)},${chao} Z`;

  const ultimo = pontos.length - 1;
  const emFoco = ativo !== null && pontos[ativo] ? pontos[ativo] : null;

  /* O ponteiro só precisa estar PERTO de um dia: mira-se numa data, e não numa
     linha de dois pixels. */
  const aoMoverPonteiro = (evento) => {
    if (pontos.length === 0) return;
    const caixa = evento.currentTarget.getBoundingClientRect();
    const x = evento.clientX - caixa.left - MARGEM.esquerda;
    const passo = pontos.length <= 1 ? 1 : larguraUtil / (pontos.length - 1);
    setAtivo(Math.min(ultimo, Math.max(0, Math.round(x / passo))));
  };

  const aoTeclar = (evento) => {
    if (pontos.length === 0) return;
    const destino = {
      ArrowLeft: (ativo ?? ultimo + 1) - 1,
      ArrowRight: (ativo ?? -1) + 1,
      Home: 0,
      End: ultimo,
    }[evento.key];
    if (destino === undefined) {
      if (evento.key === "Escape") setAtivo(null);
      return;
    }
    evento.preventDefault();
    setAtivo(Math.min(ultimo, Math.max(0, destino)));
  };

  /* A etiqueta do dia em foco acompanha o ponto, e vira de lado antes de sair
     pela borda direita. */
  const xDoFoco = emFoco === null ? 0 : xDe(ativo);
  const etiquetaADireita = xDoFoco < largura / 2;

  return (
    <div ref={moldura} className="relative" data-papel="grafico-de-leituras">
      <svg
        width={largura}
        height={altura}
        viewBox={`0 0 ${largura} ${altura}`}
        role="img"
        tabIndex={0}
        aria-label={`Leituras por dia, de ${diaCompleto(pontos[0]?.dia)} a ${diaCompleto(pontos[ultimo]?.dia)}. Use as setas para percorrer os dias.`}
        onPointerMove={aoMoverPonteiro}
        onPointerLeave={() => setAtivo(null)}
        onKeyDown={aoTeclar}
        onBlur={() => setAtivo(null)}
        className="block max-w-full touch-pan-y rounded-controle outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* A grade: fios sólidos, um tom acima da superfície. */}
        {marcas.map((marca) => (
          <g key={marca}>
            <line
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={yDe(marca)}
              y2={yDe(marca)}
              stroke="var(--border-soft)"
              strokeWidth={1}
            />
            <text
              x={MARGEM.esquerda - 8}
              y={yDe(marca)}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill="var(--ink-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatarNumero(marca)}
            </text>
          </g>
        ))}

        {/* O eixo do tempo: poucos rótulos, sempre com o primeiro e o último dia. */}
        {marcasDoTempo(pontos.length).map((i) => (
          <text
            key={pontos[i].dia}
            x={xDe(i)}
            y={altura - 8}
            textAnchor={i === 0 ? "start" : i === ultimo ? "end" : "middle"}
            fontSize={11}
            fill="var(--ink-muted)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {diaCurto(pontos[i].dia)}
          </text>
        ))}

        {pontos.length > 0 ? (
          <>
            <path d={area} fill="var(--brand-action)" fillOpacity={0.1} />
            <path
              d={linha}
              fill="none"
              stroke="var(--brand-action)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* O último dia leva um ponto: é hoje, e é para onde o olho vai. O
                anel na cor da superfície o separa da linha que chega nele. */}
            <circle
              cx={xDe(ultimo)}
              cy={yDe(Number(pontos[ultimo].total) || 0)}
              r={4}
              fill="var(--brand-action)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </>
        ) : null}

        {emFoco !== null ? (
          <g data-papel="dia-em-foco">
            <line
              x1={xDoFoco}
              x2={xDoFoco}
              y1={MARGEM.topo}
              y2={chao}
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
            <circle
              cx={xDoFoco}
              cy={yDe(Number(emFoco.total) || 0)}
              r={5}
              fill="var(--brand-action)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
        ) : null}
      </svg>

      {/* O VALOR DO DIA EM FOCO. O número vai na frente e em tinta forte, a data
          atrás: quem chegou aqui já sabe qual dia apontou, e quer o número. */}
      {emFoco !== null ? (
        <div
          data-papel="etiqueta-do-dia"
          className="pointer-events-none absolute top-2 rounded-controle border border-border-soft bg-surface px-3 py-2 shadow-md"
          style={
            etiquetaADireita
              ? { left: Math.min(xDoFoco + 12, largura - 8) }
              : { right: Math.max(largura - xDoFoco + 12, 8) }
          }
        >
          <p className="text-sm font-bold text-ink">{textoDeLeituras(emFoco.total)}</p>
          <p className="dado text-xs text-ink-muted">{diaCompleto(emFoco.dia)}</p>
        </div>
      ) : null}

      {/* O mesmo texto, para quem ouve a tela e anda pelos dias com as setas. */}
      <p role="status" aria-live="polite" className="sr-only" data-papel="dia-anunciado">
        {emFoco === null ? "" : `${diaCompleto(emFoco.dia)}: ${textoDeLeituras(emFoco.total)}`}
      </p>
    </div>
  );
}
