import assert from "node:assert/strict";
import test from "node:test";
import { planMandadoArrival } from "./mandado-arrival.ts";

test("mandado SIN Entrega segura: aviso de llegada SI, NIP NO (sin canal)", () => {
  assert.deepEqual(
    planMandadoArrival({ serviceKind: "mandado", mandadoEntregaSegura: false }),
    { sendDestinoEnPuerta: true, sendOrdenPorCompletar: false, nipChannel: null }
  );
});

test("mandado SIN Entrega segura con NIP almacenado: NO se envían instrucciones de NIP (la existencia de NIP no implica requisito)", () => {
  assert.deepEqual(
    planMandadoArrival({
      serviceKind: "mandado",
      mandadoEntregaSegura: false,
      deliveryVerificationMethod: "pin",
      deliveryVerificationStatus: "pending",
    }),
    { sendDestinoEnPuerta: true, sendOrdenPorCompletar: false, nipChannel: null }
  );
});

test("mandado CON Entrega segura y canal remitente (o legado sin canal): NIP al remitente", () => {
  assert.deepEqual(
    planMandadoArrival({ serviceKind: "mandado", mandadoEntregaSegura: true }),
    { sendDestinoEnPuerta: true, sendOrdenPorCompletar: true, nipChannel: "sender" }
  );
  assert.deepEqual(
    planMandadoArrival({ serviceKind: "mandado", mandadoEntregaSegura: true, mandadoNipRecipient: "sender" }),
    { sendDestinoEnPuerta: true, sendOrdenPorCompletar: true, nipChannel: "sender" }
  );
  // La bandera real manda aunque el método almacenado diga not_required (regla única de NIP).
  assert.deepEqual(
    planMandadoArrival({
      serviceKind: "mandado",
      mandadoEntregaSegura: true,
      deliveryVerificationMethod: "not_required",
      deliveryVerificationStatus: "not_required",
    }),
    { sendDestinoEnPuerta: true, sendOrdenPorCompletar: true, nipChannel: "sender" }
  );
});

test("mandado CON Entrega segura y canal destinatario (PASO 4): NIP al destinatario", () => {
  assert.deepEqual(
    planMandadoArrival({ serviceKind: "mandado", mandadoEntregaSegura: true, mandadoNipRecipient: "recipient" }),
    { sendDestinoEnPuerta: true, sendOrdenPorCompletar: true, nipChannel: "recipient" }
  );
});

test("restaurante: la regla de llegada de mandados NO aplica (conserva su propio flujo)", () => {
  assert.deepEqual(
    planMandadoArrival({
      serviceKind: "restaurant",
      deliveryVerificationMethod: "pin",
      deliveryVerificationStatus: "pending",
    }),
    { sendDestinoEnPuerta: false, sendOrdenPorCompletar: false, nipChannel: null }
  );
});

test("pedido sin serviceKind: la regla de mandados NO aplica", () => {
  assert.deepEqual(planMandadoArrival({}), {
    sendDestinoEnPuerta: false,
    sendOrdenPorCompletar: false,
    nipChannel: null,
  });
});
