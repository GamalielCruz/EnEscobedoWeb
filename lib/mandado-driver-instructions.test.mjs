import assert from "node:assert/strict";
import test from "node:test";
import { buildMandadoDriverInstructions } from "./mandado-driver-instructions.ts";

test("el mensaje al repartidor lleva direcciones e indicaciones (ACEPTO)", () => {
  const message = buildMandadoDriverInstructions(
    {
      orderNumber: "240952",
      mandadoOriginReference: "Local rojo junto a la farmacia, entrada por la esquina.",
      mandadoDestinationReference: "Casa con portón negro, frente al parque.",
      mandadoDetails: "Medicamentos",
    },
    "5 de Febrero 72, Magisterial, Pedro Escobedo",
    "Av. Lira 45, Centro, Pedro Escobedo"
  );

  assert.match(message, /📦 MANDADO #240952/);
  assert.match(message, /RECOLECCIÓN/);
  assert.match(message, /📍 5 de Febrero 72, Magisterial, Pedro Escobedo/);
  assert.match(message, /💬 Local rojo junto a la farmacia, entrada por la esquina\./);
  assert.match(message, /ENTREGA/);
  assert.match(message, /📍 Av\. Lira 45, Centro, Pedro Escobedo/);
  assert.match(message, /💬 Casa con portón negro, frente al parque\./);
  assert.match(message, /Artículo: Medicamentos/);
});

test("el mensaje omite las indicaciones cuando el cliente no las escribió", () => {
  const message = buildMandadoDriverInstructions(
    { orderNumber: "1", mandadoDetails: "" },
    "Origen",
    "Destino"
  );
  assert.doesNotMatch(message, /💬/);
  assert.doesNotMatch(message, /Artículo:/);
});

test("el mensaje no usa plantillas aprobadas: es texto libre del bot", () => {
  const message = buildMandadoDriverInstructions(
    { orderNumber: "2" },
    "A",
    "B"
  );
  // Sin plantilla: el texto no referencia una plantilla Meta.
  assert.doesNotMatch(message, /{{1}}|{{2}}|oferta_reparto|confirmacion_repartidor/);
});
