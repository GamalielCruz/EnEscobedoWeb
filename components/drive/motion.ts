/**
 * Tokens de movimiento del drive screen (Fase 4).
 *
 * Principios (inspiración Base — smooth / direct / efficient, SIN copiar su
 * marca): duraciones cortas, entrada desacelerada y salida acelerada, sin
 * rebote ni overscroll decorativo. Solo transform/opacity en steady state;
 * las transiciones de etapa son eventos raros, nunca parte del hot path de
 * rAF/GPS (Fase 3 LOCKED).
 */

/** Duraciones en segundos (convención de framer-motion). */
export const DRIVE_MOTION_DURATION = {
  /** Chips, píldoras, chevrons, indicadores pequeños. */
  fast: 0.12,
  /** Expansión/colapso del sheet, swaps de contenido. */
  standard: 0.2,
  /** Transiciones de etapa (navegación → llegada → acción). */
  emphasis: 0.28,
} as const;

/** Curvas de easing: desacelerar al entrar, acelerar al salir, sin rebote. */
export const DRIVE_MOTION_EASE = {
  enter: [0.2, 0, 0, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
} as const;

/**
 * Escala de elevación compartida (restrained: nada de glow ni sombras de
 * color). Somentas suaves de negro, coherentes entre overlay superior
 * (nav bar) e inferior (trip sheet).
 */
export const DRIVE_ELEVATION = {
  /** Overlays flotantes compactos (nav bar, píldoras). */
  bar: "shadow-[0_8px_28px_rgba(0,0,0,0.35)]",
  /** Superficie ancla del sheet inferior. */
  sheet: "shadow-[0_-8px_32px_rgba(0,0,0,0.18)]",
} as const;

/** Radio de esquina compartido para superficies del drive screen. */
export const DRIVE_RADIUS = {
  /** Tarjetas/paneles internos. */
  inner: "rounded-xl",
  /** Paneles flotantes (nav bar). */
  panel: "rounded-2xl",
  /** Sheet inferior (solo esquinas superiores). */
  sheet: "rounded-t-3xl",
} as const;
