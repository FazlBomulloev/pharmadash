import type { CSSProperties } from "react";

export function stagger(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}
