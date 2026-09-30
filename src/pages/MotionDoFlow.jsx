import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cubicBezier, useAnimate, useInView, useReducedMotion } from "framer-motion";
import { Braces, Check, Link2, MessageSquareText, Plus, Webhook } from "lucide-react";
import {
  LARGURA_DO_PALCO,
  arranjoPara,
  centroDoBotao,
  conteudoSobOBotao,
  emCq,
  emUnidades,
  estiloNoPalco,
  ligacao,
  pegaDoConteudo,
  pegaSobOBotao,
  percursoAoLongo,
} from "./palcoDoFlow";

/** A curva de aceleração dos gestos: a mesma do traço das ligações. */
const SUAVE = [0.45, 0, 0.2, 1];
const curvaSuave = cubicBezier(...SUAVE);

/** Uma medida que cresce com a escala do arranjo (texto e respiros). */
const cq = (valor) => `calc(${valor}cqw * var(--e))`;

/** Alça de ligação: o ponto azul na borda do bloco, que o motion mede. */
function Alca({ nome, lado, ao }) {
  const fora = cq(-0.65);
  const posicao =
    lado === "direita"
      ? { right: fora, top: ao, transform: "translateY(-50%)" }
      : lado === "esquerda"
        ? { left: fora, top: ao, transform: "translateY(-50%)" }
        : lado === "baixo"
          ? { bottom: fora, left: ao, transform: "translateX(-50%)" }
          : { top: fora, left: ao, transform: "translateX(-50%)" };
  return (
    <span
      aria-hidden="true"
      data-alca={nome}
      className="absolute rounded-full border-white bg-sky-500 shadow"
      style={{ width: cq(1.1), height: cq(1.1), borderWidth: cq(0.2), ...posicao }}
    />
  );
}

/** Um bloco do editor: cabeçalho colorido, como na tela do Flow. */
function Bloco({ cor, Icone, titulo, children, style, alcas = [], ...resto }) {
  return (
    <div
      style={{ borderWidth: cq(0.2), borderRadius: cq(0.9), boxShadow: "0 1.2cqw 2.4cqw -1cqw rgb(15 23 42 / 0.25)", ...style }}
      className="absolute border-amber-300/90 bg-white"
      {...resto}
    >
      <div
        className={`flex items-center font-bold text-white ${cor}`}
        style={{
          gap: cq(0.8),
          padding: `${cq(0.8)} ${cq(1.2)}`,
          fontSize: cq(1.35),
          borderTopLeftRadius: cq(0.7),
          borderTopRightRadius: cq(0.7),
        }}
      >
        <Icone aria-hidden="true" style={{ width: cq(1.6), height: cq(1.6) }} />
        {titulo}
      </div>
      <div className="text-zinc-600" style={{ padding: `${cq(1)} ${cq(1.2)}`, fontSize: cq(1.25) }}>
        {children}
      </div>
      {alcas.map((a) => (
        <Alca key={a.nome} {...a} />
      ))}
    </div>
  );
}

/**
 * Mede o centro de cada alça em unidades do palco, pelo layout
 * (`offsetLeft`/`offsetTop`), que ignora os `transform` da animação: o bloco
 * Conteúdo pode estar no meio do voo e a medida continua sendo a do lugar
 * final dele.
 */
function medirAlcas(palco) {
  const pontos = {};
  const largura = palco.clientWidth;
  for (const alca of palco.querySelectorAll("[data-alca]")) {
    const bloco = alca.offsetParent;
    if (!bloco) continue;
    pontos[alca.dataset.alca] = {
      x: emUnidades(bloco.offsetLeft + alca.offsetLeft + alca.offsetWidth / 2, largura),
      y: emUnidades(bloco.offsetTop + alca.offsetTop + alca.offsetHeight / 2, largura),
    };
  }
  return pontos;
}

/**
 * O motion do Flow: um cursor monta uma integração no editor da ChatClean.
 * Liga o Receber Webhook à API, clica em "Adicionar bloco", arrasta o bloco
 * Conteúdo que surgiu até o lugar, liga a API a ele, e um pulso de luz
 * percorre o caminho até a mensagem sair. Depois tudo some e recomeça.
 *
 * Dois arranjos (`palcoDoFlow.js`): lado a lado no computador, em coluna no
 * celular, escolhido pela largura do próprio palco. Ao arrastar uma
 * ligação, o cursor percorre a MESMA curva do traço, ponto a ponto e no
 * mesmo ritmo, com a ponta sempre na frente da linha.
 *
 * Leve de propósito: roda só enquanto o palco está na tela (`useInView`) e
 * para quando sai; anima apenas `transform`, `opacity` e o traçado das
 * linhas (`stroke-dashoffset`). Com "reduzir movimento", mostra o fluxo
 * pronto.
 */
export default function MotionDoFlow() {
  const [palco, animar] = useAnimate();
  const naTela = useInView(palco, { amount: 0.3 });
  const parado = useReducedMotion();
  const [arranjo, setArranjo] = useState(() => arranjoPara(0));
  const [alcas, setAlcas] = useState(null);

  // Escolhe o arranjo pela largura do palco e mede as alças de novo sempre
  // que ela muda.
  useLayoutEffect(() => {
    const elemento = palco.current;
    if (!elemento) return undefined;
    const medir = () => {
      setArranjo(arranjoPara(elemento.clientWidth));
      setAlcas(medirAlcas(elemento));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [palco]);

  // Remede as alças depois que o arranjo troca (os blocos mudaram de lugar).
  useLayoutEffect(() => {
    if (palco.current) setAlcas(medirAlcas(palco.current));
  }, [arranjo, palco]);

  const { blocos, botao, orientacao, repouso, escala, altura } = arranjo;
  const ligacoes =
    alcas?.saidaDoWebhook && alcas?.saidaDaApi && alcas?.entradaDaApi && alcas?.entradaDoConteudo
      ? [
          ["1", ligacao(alcas.saidaDoWebhook, alcas.entradaDaApi, orientacao)],
          ["2", ligacao(alcas.saidaDaApi, alcas.entradaDoConteudo, orientacao)],
        ]
      : [];

  // O comprimento real de cada ligação, para o traço se revelar do começo ao
  // fim. Só quando o desenho das ligações muda: refazer a cada renderização
  // apagava o traço que a animação tinha acabado de desenhar. Como ATRIBUTO,
  // e não como estilo: é o atributo que o framer-motion anima num SVG.
  const comprimentos = useRef({});
  const chaveDasLigacoes = ligacoes.map(([, d]) => d).join("|");
  useLayoutEffect(() => {
    const elemento = palco.current;
    if (!elemento) return;
    for (const caminho of elemento.querySelectorAll("[data-traco], [data-pulso]")) {
      const n = caminho.dataset.traco ?? caminho.dataset.pulso;
      const total = caminho.getTotalLength();
      comprimentos.current[n] = total;
      if (caminho.dataset.traco) {
        caminho.setAttribute("stroke-dasharray", `${total} ${total}`);
        caminho.setAttribute("stroke-dashoffset", parado ? "0" : `${total}`);
      } else {
        caminho.setAttribute("stroke-dasharray", `${total * 0.12} ${total * 2}`);
        caminho.setAttribute("stroke-dashoffset", `${total * 0.12}`);
      }
    }
  }, [chaveDasLigacoes, parado, palco]);

  useEffect(() => {
    if (parado || !naTela || !alcas?.saidaDoWebhook) return undefined;
    let ativo = true;
    const cursor = (p, o = {}) =>
      animar("[data-cursor]", { x: emCq(p.x), y: emCq(p.y) }, { duration: 0.8, ease: SUAVE, ...o });
    const apertar = () => animar("[data-seta]", { scale: 0.82 }, { duration: 0.12 });
    const soltar = () => animar("[data-seta]", { scale: 1 }, { duration: 0.12 });
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const total = (n) => comprimentos.current[n] ?? 400;

    // Arrasta a ligação: o traço se revela e o cursor anda pela MESMA curva,
    // nos mesmos instantes, então a ponta do cursor puxa a linha.
    const arrastarLigacao = async (n, duracao) => {
      const caminho = palco.current?.querySelector(`[data-traco='${n}']`);
      if (!caminho) return;
      const { total: comprimento, pontos } = percursoAoLongo(caminho, curvaSuave);
      const tempos = pontos.map((_, i) => i / (pontos.length - 1));
      const ritmo = { duration: duracao, times: tempos, ease: "linear" };
      await Promise.all([
        animar("[data-cursor]", { x: pontos.map((p) => emCq(p.x)), y: pontos.map((p) => emCq(p.y)) }, ritmo),
        animar(`[data-traco='${n}']`, { strokeDashoffset: pontos.map((p) => comprimento * (1 - p.fracao)) }, ritmo),
      ]);
    };

    const sob = conteudoSobOBotao(arranjo);
    const roteiro = async () => {
      await Promise.all([
        animar("[data-traco='1']", { strokeDashoffset: total("1") }, { duration: 0 }),
        animar("[data-traco='2']", { strokeDashoffset: total("2") }, { duration: 0 }),
        animar("[data-pulso]", { opacity: 0 }, { duration: 0 }),
        animar("[data-conteudo]", { x: emCq(sob.x), y: emCq(sob.y), scale: 0.9, opacity: 0 }, { duration: 0 }),
        animar("[data-enviada]", { opacity: 0 }, { duration: 0 }),
        cursor(repouso, { duration: 0 }),
      ]);
      await animar("[data-palco-fluxo]", { opacity: 1 }, { duration: 0.4 });
      if (!ativo) return;

      // Arrasta a ligação do Receber Webhook até a API.
      await cursor(alcas.saidaDoWebhook);
      await apertar();
      await arrastarLigacao("1", 0.9);
      await soltar();
      if (!ativo) return;

      // Clica em "Adicionar bloco": o bloco novo surge logo abaixo do botão.
      await cursor(centroDoBotao(arranjo));
      await apertar();
      await Promise.all([animar("[data-botao]", { scale: [1, 0.94, 1] }, { duration: 0.25 }), soltar()]);
      await animar("[data-conteudo]", { opacity: 1, scale: 1 }, { duration: 0.35, ease: SUAVE });
      // Vai até o bloco, pega pelo cabeçalho e arrasta até o lugar dele.
      await cursor(pegaSobOBotao(arranjo), { duration: 0.5 });
      await apertar();
      await Promise.all([
        cursor(pegaDoConteudo(arranjo), { duration: 1 }),
        animar("[data-conteudo]", { x: "0cqw", y: "0cqw" }, { duration: 1, ease: SUAVE }),
      ]);
      await soltar();
      if (!ativo) return;

      // Liga a API ao Conteúdo.
      await cursor(alcas.saidaDaApi, { duration: 0.6 });
      await apertar();
      await arrastarLigacao("2", 0.8);
      await soltar();
      await cursor(repouso, { duration: 0.7 });
      if (!ativo) return;

      // O evento chega: um pulso de luz percorre o caminho e a mensagem sai.
      for (const n of ["1", "2"]) {
        await animar(
          `[data-pulso='${n}']`,
          { opacity: [0, 1, 1, 0], strokeDashoffset: [total(n) * 0.12, -total(n)] },
          { duration: 0.75, ease: "linear" },
        );
      }
      await animar("[data-enviada]", { opacity: 1 }, { duration: 0.35 });
      await espera(1800);
      await animar("[data-palco-fluxo]", { opacity: 0 }, { duration: 0.4 });
    };

    (async () => {
      while (ativo) {
        try {
          await roteiro();
        } catch {
          break;
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [naTela, parado, animar, alcas, arranjo, repouso, palco]);

  const alcasDoArranjo = arranjo.alcas;

  return (
    <div
      ref={palco}
      role="img"
      aria-label="Animação do editor de fluxos da ChatClean: um cursor liga o bloco Receber Webhook ao bloco API, adiciona um bloco Conteúdo e liga a API a ele; o evento percorre o caminho e a mensagem é enviada no WhatsApp."
      className="relative w-full overflow-hidden border border-creme-borda bg-white shadow-[0_30px_60px_-30px_rgb(20_35_27/0.35)] [container-type:inline-size]"
      style={{
        aspectRatio: `${LARGURA_DO_PALCO} / ${altura}`,
        borderRadius: cq(1.6),
        "--e": escala,
      }}
    >
      {/* O pontilhado do editor */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle, rgb(148 163 184 / 0.45) ${cq(0.12)}, transparent ${cq(0.14)})`,
          backgroundSize: `${cq(2)} ${cq(2)}`,
        }}
      />

      {/* A barra do editor, com o botão "Adicionar bloco" */}
      <div
        data-botao
        aria-hidden="true"
        className="absolute flex items-center justify-center bg-zinc-100 font-semibold text-zinc-800"
        style={{
          ...estiloNoPalco(botao.x, botao.y, botao.largura),
          height: emCq(botao.altura),
          gap: cq(0.8),
          borderRadius: cq(0.8),
          fontSize: cq(1.4),
        }}
      >
        <Plus style={{ width: cq(1.8), height: cq(1.8) }} />
        Adicionar bloco
      </div>

      <div data-palco-fluxo className="absolute inset-0" style={{ opacity: parado ? 1 : 0 }}>
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${LARGURA_DO_PALCO} ${altura}`}
          className="absolute inset-0 h-full w-full"
          fill="none"
        >
          <defs>
            {ligacoes.map(([n, d]) => (
              <mask
                key={n}
                id={`mascara-ligacao-${n}`}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={LARGURA_DO_PALCO}
                height={altura}
              >
                <path data-traco={n} d={d} stroke="white" strokeWidth={12 * escala} strokeLinecap="round" />
              </mask>
            ))}
          </defs>
          {ligacoes.map(([n, d]) => (
            <g key={n}>
              {/* A ligação tracejada, revelada pela máscara que se desenha */}
              <path
                d={d}
                stroke="rgb(37 99 235)"
                strokeWidth={2.5 * escala}
                strokeDasharray={`${7 * escala} ${6 * escala}`}
                strokeLinecap="round"
                mask={`url(#mascara-ligacao-${n})`}
              />
              {/* O pulso de luz do evento percorrendo a ligação */}
              <path
                data-pulso={n}
                d={d}
                stroke="rgb(0 189 66)"
                strokeWidth={6 * escala}
                strokeLinecap="round"
                style={{ opacity: 0 }}
              />
            </g>
          ))}
        </svg>

        <Bloco
          cor="bg-red-600"
          Icone={Webhook}
          titulo="Receber Webhook"
          style={estiloNoPalco(blocos.webhook.x, blocos.webhook.y, blocos.webhook.largura)}
          alcas={[{ nome: "saidaDoWebhook", ...alcasDoArranjo.saidaDoWebhook }]}
        >
          <p className="flex items-center font-mono text-zinc-800" style={{ gap: cq(0.6) }}>
            <Link2 aria-hidden="true" style={{ width: cq(1.4), height: cq(1.4) }} />
            …/webhook/a1f9
          </p>
          <p className="font-mono" style={{ marginTop: cq(0.6), fontSize: cq(1.1) }}>
            POST · body → {"{{payload}}"}
          </p>
        </Bloco>

        <Bloco
          cor="bg-sky-500"
          Icone={Braces}
          titulo="API"
          style={estiloNoPalco(blocos.api.x, blocos.api.y, blocos.api.largura)}
          alcas={[
            { nome: "entradaDaApi", ...alcasDoArranjo.entradaDaApi },
            { nome: "saidaDaApi", ...alcasDoArranjo.saidaDaApi },
          ]}
        >
          <p
            className="flex items-center border border-zinc-200"
            style={{ gap: cq(0.6), borderRadius: cq(0.5), padding: `${cq(0.4)} ${cq(0.6)}` }}
          >
            <span className="bg-emerald-500 font-bold text-white" style={{ borderRadius: cq(0.4), padding: `0 ${cq(0.6)}` }}>
              POST
            </span>
            <span className="truncate text-zinc-800">api.suaferramenta.com</span>
          </p>
          <p className="flex items-center" style={{ gap: cq(0.6), marginTop: cq(0.8) }}>
            <span className="rounded-full bg-emerald-500" style={{ width: cq(0.9), height: cq(0.9) }} />
            Sucesso (2xx)
          </p>
          <p className="flex items-center" style={{ gap: cq(0.6), marginTop: cq(0.4) }}>
            <span className="rounded-full bg-red-500" style={{ width: cq(0.9), height: cq(0.9) }} />
            Erro
          </p>
        </Bloco>

        <Bloco
          data-conteudo
          cor="bg-blue-600"
          Icone={MessageSquareText}
          titulo="Conteúdo"
          style={{
            ...estiloNoPalco(blocos.conteudo.x, blocos.conteudo.y, blocos.conteudo.largura),
            opacity: parado ? 1 : 0,
          }}
          alcas={[{ nome: "entradaDoConteudo", ...alcasDoArranjo.entradaDoConteudo }]}
        >
          <p className="border border-zinc-200 text-zinc-800" style={{ borderRadius: cq(0.6), padding: cq(0.8) }}>
            Olá, {"{{nome}}"}! Seu pedido foi aprovado.
          </p>
          <p
            data-enviada
            className="flex items-center font-semibold text-emerald-600"
            style={{ gap: cq(0.5), marginTop: cq(0.8), opacity: parado ? 1 : 0 }}
          >
            <Check aria-hidden="true" style={{ width: cq(1.4), height: cq(1.4) }} />
            Enviada no WhatsApp
          </p>
        </Bloco>
      </div>

      {/* O cursor: some com "reduzir movimento", porque ali nada se mexe */}
      {!parado && (
        <div
          data-cursor
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-10"
          style={{ transform: `translate(${emCq(repouso.x)}, ${emCq(repouso.y)})` }}
        >
          <svg
            data-seta
            viewBox="0 0 24 24"
            className="origin-top-left drop-shadow-md"
            style={{ width: cq(2.6), height: cq(2.6) }}
          >
            <path
              d="M4 2 L4 19 L9 14.5 L12.5 22 L15.5 20.6 L12 13.3 L19 13.3 Z"
              fill="#0f172a"
              stroke="white"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
