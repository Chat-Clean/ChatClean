import { useCallback, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Routes, useLocation, useNavigationType } from "react-router-dom";
import { chaveDaTransicao, pageTransition } from "@/lib/motion";

/**
 * Envolve <Routes> com transições entre páginas — e é quem manda na rolagem.
 *
 * ─── POR QUE A ROLAGEM MORA AQUI, E NÃO NUM <ScrollToTop> ────────────────
 *
 * Havia um componente que fazia `scrollTo(0)` num efeito do `pathname`. O
 * efeito dispara assim que a rota muda, mas `mode="wait"` mantém a página
 * ANTIGA montada durante toda a animação de saída. O resultado é o defeito que
 * se via: a página velha subia até o topo na frente da pessoa, e só depois a
 * nova entrava.
 *
 * Quem sabe a hora certa é a `AnimatePresence`: `onExitComplete` roda quando a
 * antiga já saiu de cena e antes de a nova aparecer. Rolar ali é invisível.
 *
 * ─── VOLTAR PRECISA VOLTAR PARA ONDE A PESSOA ESTAVA ─────────────────────
 *
 * `posicoes` guarda o `scrollY` de cada entrada do histórico, por `location.key`.
 * Ir para uma página nova (PUSH) começa no topo, porque é conteúdo que ninguém
 * leu ainda. Voltar (POP) devolve a pessoa ao ponto exato de onde ela clicou —
 * caso contrário, quem desce meia home até os Planos, entra em /assinar e volta,
 * é jogado no topo e tem que procurar o lugar de novo.
 *
 * O Map vive fora do componente: uma remontagem não pode apagar a memória do
 * histórico, que é justamente o que precisa sobreviver à navegação.
 */

const posicoes = new Map();

/** Âncora (#planos, #faq) tem prioridade: quem pediu a seção quer a seção. */
function alvoDaAncora(hash) {
  if (typeof hash !== "string" || hash.length < 2) return null;
  try {
    const elemento = document.querySelector(hash);
    if (!elemento) return null;
    return elemento.getBoundingClientRect().top + window.scrollY;
  } catch {
    return null;
  }
}

export default function AnimatedRoutes({ children }) {
  const location = useLocation();
  const tipoDeNavegacao = useNavigationType();
  const reduce = useReducedMotion();

  // A restauração automática do navegador brigaria com a nossa: em SPA ela
  // chuta a posição antes de o conteúdo novo existir.
  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return undefined;
    const anterior = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = anterior;
    };
  }, []);

  // Enquanto esta entrada está na tela, a posição dela fica anotada. O cleanup
  // roda quando a rota muda — e nesse instante a rolagem ainda é a da página
  // que sai, porque nada rolou ainda. É de lá que sai o valor do "voltar".
  useEffect(() => {
    const chave = location.key;
    const anotar = () => posicoes.set(chave, window.scrollY);
    window.addEventListener("scroll", anotar, { passive: true });
    return () => {
      anotar();
      window.removeEventListener("scroll", anotar);
    };
  }, [location.key]);

  const posicionar = useCallback(() => {
    const restaurar =
      tipoDeNavegacao === "POP" ? (posicoes.get(location.key) ?? 0) : 0;

    // Dois quadros: o primeiro deixa a página nova entrar no layout, o segundo
    // rola já sabendo a altura real. Sem isso, uma página curta ignora o alvo.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ancora = alvoDaAncora(location.hash);
        window.scrollTo({
          top: ancora ?? restaurar,
          behavior: "instant",
        });
      });
    });
  }, [location.key, location.hash, tipoDeNavegacao]);

  // Sem animação (prefers-reduced-motion), não há saída para esperar: a troca é
  // imediata e a rolagem acontece junto.
  useEffect(() => {
    if (reduce) posicionar();
  }, [reduce, posicionar]);

  if (reduce) {
    return <Routes location={location}>{children}</Routes>;
  }

  return (
    <AnimatePresence mode="wait" initial={false} onExitComplete={posicionar}>
      <motion.div
        key={chaveDaTransicao(location.pathname)}
        initial={pageTransition.initial}
        animate={pageTransition.animate}
        exit={pageTransition.exit}
      >
        <Routes location={location}>{children}</Routes>
      </motion.div>
    </AnimatePresence>
  );
}
