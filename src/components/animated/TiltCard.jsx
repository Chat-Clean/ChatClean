import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * <TiltCard> — wrapper que aplica tilt 3D conforme o cursor se move.
 * Muito usado em sites SaaS premium (Linear, Vercel, Cal).
 *
 * Props:
 *   - intensity: força do tilt em graus (default 8)
 *   - className: classes do container externo
 *   - innerClassName: classes do elemento que recebe o transform
 */
export default function TiltCard({
  children,
  intensity = 8,
  className = "",
  innerClassName = "",
}) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });

  const handleMouseMove = (e) => {
    if (!ref.current || reduce) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateY = ((x - centerX) / centerX) * intensity;
    const rotateX = -((y - centerY) / centerY) * intensity;
    setTilt({ rotateX, rotateY });
  };

  const reset = () => setTilt({ rotateX: 0, rotateY: 0 });

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={reset}
      className={className}
      style={{ perspective: "1200px" }}
    >
      <motion.div
        animate={tilt}
        transition={{ type: "spring", stiffness: 200, damping: 20, mass: 0.4 }}
        style={{ transformStyle: "preserve-3d" }}
        className={innerClassName}
      >
        {children}
      </motion.div>
    </div>
  );
}
