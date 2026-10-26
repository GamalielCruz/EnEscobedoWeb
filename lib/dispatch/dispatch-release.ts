// Núcleo de liberación de un pedido de un repartidor (unassign) con manejo de
// conflictos de revisión de Sanity (409), en el MISMO patrón que
// assignOrderToDriver: releer → revisión fresca → reintentar → decidir por el
// estado real → idempotente.
//
// Vive en un módulo SIN imports de alias (ni "@/" ni backendClient): las
// dependencias de I/O se inyectan para que los tests de node
// (--experimental-strip-types) puedan ejercitar el ciclo
// 409 → releer → reintentar con mocks, igual que en assignOrderToDriver.
import {
  classifyReleaseState,
  extractRevisionInfo,
  isRevisionConflict,
  type FreshOrderForAssignment,
} from "./dispatch-validation.ts";
import type { OrderTypeValue, PaymentStatusValue } from "../order-state";

export const MAX_RELEASE_CONFLICT_RETRIES = 3;

/**
 * Pedido tal como lo necesita el núcleo de liberación. Los campos obligatorios
 * (_id, _rev, orderNumber) y los de buildLegacyStatus (orderType, paymentStatus)
 * son SIEMPRE requeridos por el esquema de Sanity; se tipan como obligatorios
 * para que el adaptador no necesite casts.
 */
export type ReleaseOrderLike = Omit<FreshOrderForAssignment, "_id" | "orderNumber"> & {
  _id: string;
  _rev: string;
  orderNumber: string;
  orderType: OrderTypeValue;
  paymentStatus: PaymentStatusValue;
  paymentMethod?: string;
};

export type ReleaseDriverLike = { _id: string; telefono?: string };

export type ReleaseOrderDeps = {
  /** Relee el pedido con su revisión actual (debe devolver _rev fresco). */
  fetchOrder: (orderId: string) => Promise<ReleaseOrderLike | null>;
  fetchDriver: (driverId: string) => Promise<ReleaseDriverLike | null>;
  /** Pedidos activos que le quedan al repartidor (excluyendo este pedido). */
  fetchRemainingCount: (driverId: string, excludeOrderId: string) => Promise<number>;
  /**
   * Transacción atómica con `ifRevisionId` sobre el pedido. Ante un 409 debe
   * lanzar el error de Sanity (statusCode 409); el núcleo lo captura, relee y
   * reintenta con la revisión fresca.
   */
  commitRelease: (input: { order: ReleaseOrderLike; remainingCount: number; now: string }) => Promise<void>;
  /** Efectos secundarios que ocurren EXACTAMENTE una vez tras un commit exitoso. */
  afterCommit: (input: {
    order: ReleaseOrderLike;
    driver: ReleaseDriverLike | null;
    remainingCount: number;
    now: string;
    driverId: string;
  }) => Promise<void>;
  log: (tag: string, payload: Record<string, unknown>) => void;
};

export type ReleaseResult =
  | { ok: true; idempotent?: boolean }
  | { ok: false; error: string; code?: "conflict" };

/**
 * Libera un pedido de un repartidor. Idempotente: si el pedido ya fue liberado
 * (no tiene repartidor), devuelve éxito idempotente sin efectos secundarios;
 * si quedó asignado a otro repartidor o está terminado, NO lo libera.
 *
 * Nota de concurrencia (limitación conocida, comportamiento preexistente): el
 * guard `ifRevisionId` solo protege el documento del PEDIDO, que es la fuente de
 * verdad de la liberación. El patch del repartidor (estadoDisponibilidad,
 * ultimaActividad) es last-write-wins y NO genera 409: si otro proceso muta el
 * repartidor entre el fetch y el commit (cron, otra liberación), se sobrescribe
 * silenciosamente. El bucle de reintento, por tanto, solo puede ver 409 del
 * pedido. La simetría total con assignOrderToDriver (guardar ambos documentos)
 * requeriría pasar driver._rev al núcleo; queda fuera del alcance mínimo.
 */
export async function releaseOrderFromDriverCore(opts: {
  orderId: string;
  driverId: string;
}, deps: ReleaseOrderDeps): Promise<ReleaseResult> {
  const traceId = crypto.randomUUID().slice(0, 8);

  for (let attempt = 1; attempt <= MAX_RELEASE_CONFLICT_RETRIES; attempt++) {
    const order = await deps.fetchOrder(opts.orderId);
    const outcome = classifyReleaseState(order, opts.driverId);

    switch (outcome.kind) {
      case "order_missing":
        return { ok: false, error: "El pedido no existe." };
      case "assigned_to_other":
        return { ok: false, error: "El pedido no está asignado a ese repartidor." };
      case "terminal":
        return { ok: false, error: "El pedido ya está terminado." };
      case "already_released": {
        // La liberación ya ocurrió (doble clic / proceso concurrente): éxito
        // idempotente, NO se re-ejecutan eventos ni notificaciones.
        deps.log("RELEASE_IDEMPOTENT", {
          traceId,
          orderId: opts.orderId,
          orderNumber: order?.orderNumber,
          repartidorId: opts.driverId,
          attempt,
        });
        return { ok: true, idempotent: true };
      }
      case "assigned_to_me": {
        // TS no estrecha `order` a través del switch sobre outcome.kind; este
        // caso implica que el pedido existe (classifyReleaseState devuelve
        // order_missing cuando no hay pedido).
        if (!order) return { ok: false, error: "El pedido no existe." };
        const [remainingCount, driver] = await Promise.all([
          deps.fetchRemainingCount(opts.driverId, opts.orderId),
          deps.fetchDriver(opts.driverId),
        ]);
        const now = new Date().toISOString();
        deps.log("RELEASE_ATTEMPT", {
          traceId,
          orderId: opts.orderId,
          orderNumber: order.orderNumber,
          repartidorId: opts.driverId,
          attempt,
        });
        try {
          await deps.commitRelease({ order, remainingCount, now });
        } catch (patchError) {
          if (!isRevisionConflict(patchError)) {
            deps.log("RELEASE_ERROR", {
              traceId,
              orderId: opts.orderId,
              repartidorId: opts.driverId,
              patchError,
            });
            return { ok: false, error: "No se pudo liberar el pedido." };
          }
          const revision = extractRevisionInfo(patchError);
          deps.log("RELEASE_CONFLICT", {
            traceId,
            orderId: opts.orderId,
            repartidorId: opts.driverId,
            attempt,
            ...revision,
          });
          if (attempt >= MAX_RELEASE_CONFLICT_RETRIES) {
            // Último intento: se decide por el estado REAL actual de Sanity.
            const finalOrder = await deps.fetchOrder(opts.orderId);
            const finalOutcome = classifyReleaseState(finalOrder, opts.driverId);
            if (finalOutcome.kind === "already_released") {
              deps.log("RELEASE_RECOVERED_IDEMPOTENT", {
                traceId,
                orderId: opts.orderId,
                repartidorId: opts.driverId,
              });
              return { ok: true, idempotent: true };
            }
            if (finalOutcome.kind === "assigned_to_other") {
              return { ok: false, error: "El pedido ya no está asignado a ese repartidor." };
            }
            if (finalOutcome.kind === "terminal") {
              return { ok: false, error: "El pedido ya está terminado." };
            }
            return {
              ok: false,
              error: "Conflicto de concurrencia al liberar; el estado cambió repetidamente. Reintenta.",
              code: "conflict",
            };
          }
          continue;
        }
        // Éxito: efectos secundarios exactamente una vez.
        await deps.afterCommit({ order, driver, remainingCount, now, driverId: opts.driverId });
        deps.log("RELEASE_SUCCESS", {
          traceId,
          orderId: opts.orderId,
          orderNumber: order.orderNumber,
          repartidorId: opts.driverId,
          attempt,
        });
        return { ok: true };
      }
    }
  }
  return { ok: false, error: "Conflicto de concurrencia al liberar; reintenta.", code: "conflict" };
}
