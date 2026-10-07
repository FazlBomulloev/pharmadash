import type { CSSProperties } from "react";

/** Индекс появления для каскадной анимации (.anim-rise / .anim-tab). */
export function stagger(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}
