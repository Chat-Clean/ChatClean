import { motion, useScroll, useSpring } from "framer-motion";

/**
 * <ScrollProgress /> — barra fininha no topo da pagina que enche
 * conforme o usuario rola. Comum em sites SaaS modernos.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[3px] z-[60] origin-left bg-gradient-to-r from-emerald-500 via-yellow-400 to-sky-200"
      style={{ scaleX }}
      aria-hidden="true"
    />
  );
}
