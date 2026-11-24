/**
 * Sumidero de traza del control "desliza para confirmar" (SOLO staging).
 *
 * El componente del deslizador no conoce el `TraceRecorder` (vive en la
 * página): publica sus eventos aquí y la página conecta el sumidero al
 * grabador cuando `TRACE_REC_ENABLED`. Sin sumidero conectado, `recordSwipeTrace`
 * es un no-op: en producción no se graba nada.
 *
 * Objetivo de la auditoría: distinguir en la traza un gesto CANCELADO por el
 * navegador de un release real, y ver si el control se remonta a mitad del
 * gesto (`mount`/`unmount`).
 *
 * `pct` es el progreso del RECORRIDO (100 = umbral); `fillPct` es el ancho del
 * relleno rojo sobre el track (lo que el repartidor ve como "se llenó hasta…").
 */

export type SwipeTraceEntryType =
  | "mount"
  | "unmount"
  | "pointer-down"
  | "pointer-move"
  | "pointer-up"
  | "pointer-cancel"
  | "touch-cancel"
  | "lost-pointer-capture"
  | "drag-end"
  | "confirm"
  | "stage-action"
  | "stage-action-gap";

export type SwipeTraceEntry = {
  /** Reloj del dispositivo (epoch ms). */
  t: number;
  type: SwipeTraceEntryType;
  /** Etapa del pedido visible al registrar el evento (`navPhase`). */
  stage: string | null;
  /** Tipo de pedido: la recolección de restaurante no tiene acción. */
  serviceKind: "restaurant" | "mandado" | null;
  /** Posición del thumb en px. */
  x: number | null;
  /** Recorrido máximo (umbral) en px. */
  max: number | null;
  /** Progreso del recorrido 0–100 (100 = umbral). */
  pct: number | null;
  /** Relleno rojo sobre el ancho del track, 0–100. */
  fillPct: number | null;
  /** Clasificación o causa: "cancelled" | "release" | "threshold" | … */
  reason: string | null;
  /** Resultado de la acción: "ok" | "false" | "throw" | … */
  result: string | null;
  pointerType: string | null;
};

export type SwipeTraceInput = Partial<Omit<SwipeTraceEntry, "t" | "type">> & {
  type: SwipeTraceEntryType;
  /** Solo para pruebas/replays; por defecto `Date.now()`. */
  t?: number;
};

let sink: ((entry: SwipeTraceEntry) => void) | null = null;

/**
 * Conecta el sumidero (la página lo apunta al `TraceRecorder`). Devuelve la
 * función de desconexión para el cleanup del efecto.
 */
export function setSwipeTraceSink(
  next: ((entry: SwipeTraceEntry) => void) | null
): () => void {
  sink = next;
  return () => {
    if (sink === next) sink = null;
  };
}

/** Registra un evento del deslizador. No-op si no hay sumidero (producción). */
export function recordSwipeTrace(input: SwipeTraceInput): void {
  if (!sink) return;
  sink({
    t: input.t ?? Date.now(),
    type: input.type,
    stage: input.stage ?? null,
    serviceKind: input.serviceKind ?? null,
    x: input.x ?? null,
    max: input.max ?? null,
    pct: input.pct ?? null,
    fillPct: input.fillPct ?? null,
    reason: input.reason ?? null,
    result: input.result ?? null,
    pointerType: input.pointerType ?? null,
  });
}
