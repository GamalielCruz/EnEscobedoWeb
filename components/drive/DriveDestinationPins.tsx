

/**
 * Pines de destino del mapa (Fase 4).
 *
 * MISMA filosofía que los buckets de icono del marcador del conductor (H1,
 * Fase 3 LOCKED): todos los data-URIs y objetos Size/Point se pre-generan
 * UNA vez a nivel módulo y el swap standard→arriving es SOLO un cambio de
 * referencia (evento de etapa). Cero construcción por render, cero
 * asignaciones en tiempo de navegación.
 *
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

// `google` llega como global (ver types/google-maps.d.ts), igual que en
// app/(drive)/drive/page.tsx.
type PinVariant = { icon: google.maps.Icon; labelClass: string };

function buildVariants(kind: PinKind): { standard: PinVariant; arriving: PinVariant } {
  return {
    standard: {
      icon: {
        url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(kind, false))}`,
        scaledSize: new google.maps.Size(28, 28),
        anchor: new google.maps.Point(14, 28),
      },
      labelClass: "text-[10px] font-bold bg-white rounded px-1 shadow-sm whitespace-nowrap",
    },
    arriving: {
      icon: {
        url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(kind, true))}`,
        scaledSize: new google.maps.Size(40, 40),
        anchor: new google.maps.Point(20, 40),
      },
      labelClass:
        "text-[11px] font-black bg-white rounded-md px-1.5 py-px shadow-md whitespace-nowrap ring-1 ring-black/10",
    },
  };
}

// Construcción única: requiere google.maps cargado (se llama tras mapsLoaded).
// Guardado a nivel módulo; posteriores llamadas reutilizan la referencia.
let cache: {
  store: { standard: PinVariant; arriving: PinVariant };
  dest: { standard: PinVariant; arriving: PinVariant };
} | null = null;

export function getDestinationPinVariants():
  | {
      store: { standard: PinVariant; arriving: PinVariant };
      dest: { standard: PinVariant; arriving: PinVariant };
    }
  | null {
  if (cache) return cache;
  // google.maps global (cargado por el loader de Maps antes de renderizar).
  if (typeof google === "undefined" || !google.maps) return null;
  cache = { store: buildVariants("store"), dest: buildVariants("dest") };
  return cache;
}

/** Resetea el cache (map unmount / reset). No toca referencias ya asignadas. */
export function resetDestinationPins(): void {
  cache = null;
}
