import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { Check, Facebook, Instagram, MessageCircle, Send } from "lucide-react";
import { EASE } from "@/lib/motion";
import { TRANSICAO, atraso } from "./estiloDeCena";

/* Peças que as cenas compartilham. Tudo aqui é desenho de interface dentro
   do palco creme: tamanho de texto pequeno de propósito, contraste medido
   sobre o creme (zinc-500 dá 5,2:1; zinc-600, 6,7:1). */

const CANAIS = {
  WhatsApp: { Icone: MessageCircle, cor: "bg-emerald-500 text-emerald-950" },
  Instagram: { Icone: Instagram, cor: "bg-canal-instagram text-white" },
  Facebook: { Icone: Facebook, cor: "bg-canal-facebook text-white" },
  Telegram: { Icone: Send, cor: "bg-canal-telegram text-white" },
};

export function IconeDoCanal({ canal, tamanho = "h-8 w-8", icone = "h-4 w-4" }) {
  const { Icone, cor } = CANAIS[canal];
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ${tamanho} ${cor}`}>
      <Icone className={icone} strokeWidth={2} />
    </span>
  );
}

/**
 * Os dois tiques do WhatsApp: apagados quando entregue, acesos quando lido.
 * Sobre o palco, "lido" é o azul do WhatsApp; dentro do balão verde da
 * empresa (`sobreVerde`) o azul some, então lá é o verde-escuro cheio.
 * A troca é de opacidade entre duas camadas, não de cor.
 */
export function Tiques({ lido = false, sobreVerde = false, className = "" }) {
  const apagado = sobreVerde ? "text-emerald-950/45" : "text-zinc-500";
  const aceso = sobreVerde ? "text-emerald-950" : "text-canal-telegram";
  const par = (
    <>
      <Check className="h-3 w-3" strokeWidth={2.5} />
      <Check className="-ml-1.5 h-3 w-3" strokeWidth={2.5} />
    </>
  );
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span className={`inline-flex ${apagado}`}>{par}</span>
      <span className={`absolute inset-0 inline-flex ${aceso} transition-opacity duration-300 ${lido ? "opacity-100" : "opacity-0"}`}>
        {par}
      </span>
    </span>
  );
}

export function Digitando() {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-1">
      {[0, 150, 300].map((ms) => (
        <span key={ms} className="cena-digitando h-1.5 w-1.5 rounded-full bg-zinc-400" style={{ animationDelay: `${ms}ms` }} />
      ))}
    </span>
  );
}

/**
 * Balão de conversa. `de`: "cliente" (esquerda, branco) ou "empresa"
 * (direita, verde). Já ocupa o lugar final; `visivel` só o revela, crescendo
 * a partir do canto do rabicho.
 */
export function Balao({ de = "cliente", visivel = true, atrasoMs = 0, children, className = "" }) {
  const empresa = de === "empresa";
  return (
    <div
      style={atraso(atrasoMs)}
      className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug ${TRANSICAO} ${
        empresa
          ? "origin-bottom-right self-end rounded-br-md bg-emerald-500 text-emerald-950"
          : "origin-bottom-left self-start rounded-bl-md bg-white text-zinc-900 ring-1 ring-creme-borda"
      } ${visivel ? "scale-100 opacity-100" : "scale-90 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Número que corre do valor anterior até o novo quando `valor` muda. Escreve
 * direto no texto do nó, sem re-renderizar o React a cada quadro.
 * `saltar`: vai direto ao valor, sem contar — é o laço voltando a cena ao
 * começo, que não deve parecer um número caindo.
 */
export function Contador({ valor, formatar = (n) => Math.round(n).toLocaleString("pt-BR"), duracao = 0.9, saltar = false }) {
  const ref = useRef(null);
  const anterior = useRef(valor);
  const reduzir = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (reduzir || saltar) {
      el.textContent = formatar(valor);
      anterior.current = valor;
      return undefined;
    }
    const controle = animate(anterior.current, valor, {
      duration: duracao,
      ease: EASE.out,
      onUpdate: (n) => {
        el.textContent = formatar(n);
      },
    });
    anterior.current = valor;
    return () => controle.stop();
    // `formatar` é estável por uso; só o valor dispara a contagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, reduzir, duracao, saltar]);

  return (
    <span ref={ref} className="tabular-nums">
      {formatar(valor)}
    </span>
  );
}
