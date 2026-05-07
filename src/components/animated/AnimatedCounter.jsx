import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

/**
 * <AnimatedCounter to={100} suffix="+" /> — anima um numero subindo
 * de 0 ate `to` quando entra na viewport.
 *
 * Props:
 *   - to: numero final (obrigatorio)
 *   - duration: duracao em ms (default 1500)
 *   - suffix / prefix: strings opcionais
 *   - decimals: casas decimais
 */
export default function AnimatedCounter({
  to,
  duration = 1500,
  suffix = "",
  prefix = "",
  decimals = 0,
  className = "",
}) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [value, setValue] = useState(reduce ? to : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    let start;
    let frame;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(Number((eased * to).toFixed(decimals)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [inView, to, duration, decimals, reduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
