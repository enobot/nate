/**
 * Join class names, skipping empty/false values.
 * cn("a", isActive && "b", "") -> "a b" (when isActive is true)
 * @param {...(string | false | null | undefined)} classes
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
