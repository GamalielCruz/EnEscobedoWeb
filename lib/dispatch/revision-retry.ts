/**
 * Reintento ante CONFLICTO DE REVISIÓN de Sanity (HTTP 409).
 *
 * Sanity rechaza un patch cuando el documento cambió entre la lectura y el
 * commit: `Document "..." ... expectedRevisionID ... currentRevisionID ...`.
 * Eso NO es un error del negocio, es una carrera normal (dos acciones del
 * repartidor, la geocerca de llegada en segundo plano, el cron, un reemplazo
 * de WhatsApp, el simulador) y no debe convertirse en un 500 opaco. La
 * resolución correcta es releer la revisión vigente y repetir el MISMO patch
 * (idempotente).
 *
 * Sin imports a propósito: el runner de tests (`node --experimental-strip-types
 * --test`) exige extensión explícita en los imports, mientras que el bundler de
 * Next no. Mantener este módulo autocontenido permite probarlo tal cual; el
 * predicado se puede sustituir vía `args.isConflict`.
 */

export type RevisionCommitResult =
  | { ok: true; attempts: number }
  | { ok: false; lastConflict: unknown };

export type RevisionCommitArgs = {
  /** Documento tal como se leyó al inicio (1er intento). */
  initial: Record<string, unknown>;
  /**
   * Relee el documento VIGENTE. Debe lanza si el documento ya no pertenece a la
   * operación (p. ej. el pedido pasó a otro repartidor): eso no es un conflicto
   * de revisión y no se reintenta.
   */
  refresh: () => Promise<Record<string, unknown>>;
  /** Aplica el patch usando la revisión de `doc` (`.ifRevisionId(doc._rev)`). */
  commit: (doc: Record<string, unknown>) => Promise<void>;
  /** Intentos TOTALES (1 = sin reintento). */
  attempts?: number;
  /** Traza de cada conflicto, para el log del servidor. */
  onConflict?: (error: unknown, attempt: number) => void;
  /** Predicado de conflicto (por defecto, `statusCode === 409`). */
  isConflict?: (error: unknown) => boolean;
};

export const REVISION_RETRY_ATTEMPTS = 3;

/** ¿El error es un conflicto de revisión de Sanity? (HTTP 409). Módulo
 * autocontenido: misma regla que `isRevisionConflict` de
 * `lib/dispatch/dispatch-validation.ts`. */
export function isRevisionConflictError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode?: number }).statusCode === 409
  );
}

/**
 * Ejecuta `commit` reintentando con la revisión vigente mientras Sanity
 * responda 409. Cualquier OTRO error se propaga sin reintentar (no tiene
 * sentido repetir un fallo de negocio o de red).
 */
export async function commitWithRevisionRetry(
  args: RevisionCommitArgs
): Promise<RevisionCommitResult> {
  const maxAttempts = Math.max(1, Math.floor(args.attempts ?? REVISION_RETRY_ATTEMPTS));
  const isConflict = args.isConflict ?? isRevisionConflictError;
  let doc = args.initial;
  let lastConflict: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) doc = await args.refresh();
    try {
      await args.commit(doc);
      return { ok: true, attempts: attempt };
    } catch (error) {
      if (!isConflict(error)) throw error;
      lastConflict = error;
      args.onConflict?.(error, attempt);
    }
  }

  return { ok: false, lastConflict };
}