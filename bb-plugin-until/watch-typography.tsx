import type { HTMLAttributes } from "react";

interface WatchTextProps extends HTMLAttributes<HTMLElement> {
  as?: "p" | "span";
}

/** Plugin-owned text primitive supports inline button text without paragraph markup. */
export function Text({ as: Component = "p", ...props }: WatchTextProps) {
  return <Component {...props} />;
}

/** Plugin-owned section title preserves semantic headings. */
export function Title(props: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...props} />;
}
