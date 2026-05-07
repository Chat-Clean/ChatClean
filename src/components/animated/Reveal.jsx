import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, fadeRight, scaleIn, viewportOnce } from "@/lib/motion";

/**
 * <Reveal> — wrapper para animar qualquer conteudo on-scroll.
 *
 * Respeita prefers-reduced-motion automaticamente: quando ativo,
 * renderiza sem animacao para nao prejudicar acessibilidade.
 *
 * Props:
 *   - variant: "up" (default) | "right" | "scale"
 *   - delay: atraso em segundos
 *   - className, children: passthrough
 *   - as: tag a renderizar (default "div")
 */
export default function Reveal({
  children,
  variant = "up",
  delay = 0,
  className = "",
  as = "div",
  ...rest
}) {
  const reduce = useReducedMotion();
  const Component = motion[as] || motion.div;

  const variants =
    variant === "right" ? fadeRight : variant === "scale" ? scaleIn : fadeUp;

  if (reduce) {
    const Tag = as;
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <Component
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={variants}
      transition={{ delay }}
      className={className}
      {...rest}
    >
      {children}
    </Component>
  );
}
