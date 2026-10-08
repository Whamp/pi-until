import type { HTMLAttributes } from "react";

/** Plugin-owned text primitive uses the current BB theme. */
export function Text(props: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} />;
}

/** Plugin-owned section title preserves semantic headings. */
export function Title(props: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...props} />;
}
