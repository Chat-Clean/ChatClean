import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Routes, useLocation } from "react-router-dom";
import { pageTransition } from "@/lib/motion";

/**
 * Envolve <Routes> com transicoes suaves entre paginas.
 * Usa o pathname como key da AnimatePresence para detectar mudanca.
 *
 * Uso:
 *   <AnimatedRoutes>
 *     <Route path="/" element={<App />} />
 *     ...
 *   </AnimatedRoutes>
 */
export default function AnimatedRoutes({ children }) {
  const location = useLocation();
  const reduce = useReducedMotion();

  // Sem animacao quando reduced-motion ativo
  if (reduce) {
    return <Routes location={location}>{children}</Routes>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={pageTransition.initial}
        animate={pageTransition.animate}
        exit={pageTransition.exit}
      >
        <Routes location={location}>{children}</Routes>
      </motion.div>
    </AnimatePresence>
  );
}
