import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge vendored UI classes using the host-shimmed Tailwind utility. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
