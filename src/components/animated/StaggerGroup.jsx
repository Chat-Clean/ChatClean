import { motion, useReducedMotion } from "framer-motion";
import { staggerContainer, staggerItem, viewportOnce } from "@/lib/motion";

/**
 * <StaggerGroup> + <StaggerItem> — anima uma lista de itens em cascata.
 *
 * Uso:
 *   <StaggerGroup>
 *     {items.map((it) => (
 *       <StaggerItem key={it.id}>...card...</StaggerItem>
 *     ))}
 *   </StaggerGroup>
 */

export function StaggerGroup({
  children,
  className = "",
  stagger = 0.08,
  delayChildren = 0.1,
  ...rest
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={staggerContainer(stagger, delayChildren)}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "", as = "div", ...rest }) {
  const reduce = useReducedMotion();
  const Component = motion[as] || motion.div;

  if (reduce) {
    const Tag = as;
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <Component variants={staggerItem} className={className} {...rest}>
      {children}
    </Component>
  );
}
