/**
 * Pines de destino del mapa (Fase 4).
 *
 * MISMA filosofía que los buckets de icono del marcador del conductor (H1,
 * Fase 3 LOCKED): todos los data-URIs y el HTML de cada variante se pre-generan
 * UNA vez a nivel módulo y el swap standard→arriving es SOLO un cambio de
 * referencia (evento de etapa). Cero construcción por render, cero
 * asignaciones en tiempo de navegación.
 *
 * Con Mapbox el "icono" es HTML (imagen + etiqueta):
 * - STANDARD: pin 28px clásico (mismo SVG que existía en la página).
 * - ARRIVING: mismo trazo escalado a 40px con aro de énfasis para el
 *   destino activo al llegar (viewBox fijo 28 → escala nítida).
 */

type PinKind = "store" | "dest";

const PIN_COLOR: Record<PinKind, string> = {
  store: "#F97316", // recolección (marca existente)
  dest: "#EF4444", // entrega (marca existente)
};

/** Trazo original de la página (28×28), sin tocar: shape probado visualmente. */
const PIN_BODY =
  'M14 2C9.03 2 5 6.03 5 11c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z';

function pinSvg(kind: PinKind, emphasize: boolean): string {
  const color = PIN_COLOR[kind];
  // Aro de énfasis alrededor de la cabeza del pin (coordenadas del viewBox 28).
  const ring = emphasize
    ? '<circle cx="14" cy="11" r="10" fill="none" stroke="' + color + '" stroke-opacity="0.35" stroke-width="2"/>'
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">` +
    ring +
    `<path fill="${color}" d="${PIN_BODY}"/>` +
    `<circle cx="14" cy="11" r="3" fill="white"/>` +
    `</svg>`
  );
}

export type DestinationPinVariant = {
  /** `<img>` del pin ya escalado (28px o 40px). */
  iconHtml: string;
  /** Clases Tailwind de la etiqueta (nombre del negocio / "Entrega"). */
  labelClass: string;
};

function imageHtml(kind: PinKind, emphasize: boolean): string {
  const size = emphasize ? 40 : 28;
  const svg = pinSvg(kind, emphasize);
  return `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" width="${size}" height="${size}" alt="" style="display:block" />`;
}

function buildVariants(kind: PinKind): {
  standard: DestinationPinVariant;
  arriving: DestinationPinVariant;
} {
  return {
    standard: {
      iconHtml: imageHtml(kind, false),
      labelClass: "text-[10px] font-bold bg-white rounded px-1 shadow-sm whitespace-nowrap",
    },
    arriving: {
      iconHtml: imageHtml(kind, true),
      labelClass:
        "text-[11px] font-black bg-white rounded-md px-1.5 py-px shadow-md whitespace-nowrap ring-1 ring-black/10",
    },
  };
}

// Construcción única a nivel módulo; posteriores llamadas reutilizan referencia.
const cache = {
  store: buildVariants("store"),
  dest: buildVariants("dest"),
};

export function getDestinationPinVariants(): {
  store: { standard: DestinationPinVariant; arriving: DestinationPinVariant };
  dest: { standard: DestinationPinVariant; arriving: DestinationPinVariant };
} {
  return cache;
}

/**
 * HTML final del marcador: etiqueta arriba + pin abajo, con el pie del pin
 * apoyado en la coordenada (anchor "bottom" en Mapbox).
 */
export function destinationPinHtml(
  variant: DestinationPinVariant,
  label: string
): string {
  const safeLabel = label.replace(/[<>&]/g, (char) =>
    char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&amp;"
  );
  return (
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1">` +
    `<span class="${variant.labelClass}" style="font-family:system-ui,sans-serif">${safeLabel}</span>` +
    variant.iconHtml +
    `</div>`
  );
}

/** Resetea el cache (map unmount / reset). No toca referencias ya asignadas. */
export function resetDestinationPins(): void {
  // El cache es constante (HTML inmutable): nada que liberar. Se mantiene la
  // exportación para no romper el ciclo de limpieza de la página del driver.
}
