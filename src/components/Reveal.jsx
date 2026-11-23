import { m } from "motion/react";

/**
 * Fades content in the first time it scrolls into view.
 * With "reduce motion" turned on, MotionConfig skips the movement.
 */
export default function Reveal({ children, className, delay = 0 }) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </m.div>
  );
}
