import { useMemo } from "react";

/**
 * <ParticleField /> — campo de partículas flutuantes (CSS animado).
 * Pensado para sobrepor a hero e dar sensação de "ar técnico".
 *
 * Props:
 *   - count: número de partículas (default 30)
 *   - color: cor base (default branco)
 */
export default function ParticleField({ count = 30, color = "rgba(255,255,255,0.7)" }) {
  const particles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const size = Math.random() * 4 + 1; // 1–5px
      const left = Math.random() * 100;
      const duration = Math.random() * 18 + 12; // 12–30s
      const delay = Math.random() * -20;
      return {
        id: i,
        size,
        left,
        duration,
        delay,
      };
    });
  }, [count]);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            left: `${p.left}%`,
            bottom: "-10px",
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
