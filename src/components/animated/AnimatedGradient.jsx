/**
 * <AnimatedGradient /> — background com 3 blobs de cor que se movem
 * lentamente. Pensado para hero sections premium (Linear/Vercel-like).
 *
 * Usa CSS animations (mais leve que JS), respeita prefers-reduced-motion.
 */
export default function AnimatedGradient({
  className = "",
  colors = ["#00BD42", "#0091CC", "#7C3AED"],
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div
        className="blob blob-1"
        style={{ background: `radial-gradient(circle, ${colors[0]}66 0%, transparent 70%)` }}
      />
      <div
        className="blob blob-2"
        style={{ background: `radial-gradient(circle, ${colors[1]}55 0%, transparent 70%)` }}
      />
      <div
        className="blob blob-3"
        style={{ background: `radial-gradient(circle, ${colors[2]}55 0%, transparent 70%)` }}
      />
    </div>
  );
}
