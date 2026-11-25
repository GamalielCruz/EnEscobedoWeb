import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeCommandText,
  matchDriverCommand,
} from "./driver-commands.ts";

test("canonicalizeCommandText colapsa espacios y quita puntuacion final", () => {
  assert.equal(canonicalizeCommandText("  En   puerta.  "), "EN PUERTA");
  assert.equal(canonicalizeCommandText("Entregado!"), "ENTREGADO");
  assert.equal(canonicalizeCommandText("pedido en direccion al domicilio."), "PEDIDO EN DIRECCION AL DOMICILIO");
  // No toca el interior: los folios con guiones quedan intactos (solo cambia
  // la caja, igual que normalizeText() en el webhook)
  assert.equal(canonicalizeCommandText("EN PUERTA #abc-123"), "EN PUERTA #ABC-123");
});

test("matchDriverCommand: comando canonico exacto y con folio", () => {
  assert.equal(matchDriverCommand("PEDIDO EN DIRECCION AL DOMICILIO", "PEDIDO EN DIRECCION AL DOMICILIO"), "");
  assert.equal(
    matchDriverCommand("PEDIDO EN DIRECCION AL DOMICILIO 3da3c95c-d5eb-4de0-b588-fdae7a3441ae", "PEDIDO EN DIRECCION AL DOMICILIO"),
    "3DA3C95C-D5EB-4DE0-B588-FDAE7A3441AE"
  );
  // El folio se devuelve en mayúsculas (el webhook normaliza el mensaje
  // completo a mayúsculas antes de matchear; la comparación con la orden es
  // case-insensitive en resolveExactAssignedOrder).
  assert.equal(matchDriverCommand("EN PUERTA #abc-123", "EN PUERTA"), "ABC-123");
  assert.equal(matchDriverCommand("ENTREGADO", "ENTREGADO"), "");
});

test("matchDriverCommand: variante real de produccion 'a domicilio'", () => {
  // Incidencia real: el repartidor escribio "Pedido en direccion a domicilio"
  // y el matcheo estricto anterior lo mando a la conversacion de soporte.
  assert.equal(matchDriverCommand("PEDIDO EN DIRECCION A DOMICILIO", "PEDIDO EN DIRECCION AL DOMICILIO"), "");
  assert.equal(
    matchDriverCommand("PEDIDO EN DIRECCION A DOMICILIO 3da3c95c-d5eb-4de0-b588-fdae7a3441ae", "PEDIDO EN DIRECCION AL DOMICILIO"),
    "3DA3C95C-D5EB-4DE0-B588-FDAE7A3441AE"
  );
});

test("matchDriverCommand: tolera espacios dobles y puntuacion final", () => {
  assert.equal(matchDriverCommand("Pedido  en  direccion  al  domicilio.", "PEDIDO EN DIRECCION AL DOMICILIO"), "");
  assert.equal(matchDriverCommand("EN PUERTA.", "EN PUERTA"), "");
  assert.equal(matchDriverCommand("entregado!", "ENTREGADO"), "");
});

test("matchDriverCommand: no matchea comandos distintos ni texto libre", () => {
  assert.equal(matchDriverCommand("PEDIDO EN DIRECCION AL DOMICILIOX", "PEDIDO EN DIRECCION AL DOMICILIO"), null);
  assert.equal(matchDriverCommand("ACEPTO", "PEDIDO EN DIRECCION AL DOMICILIO"), null);
  assert.equal(matchDriverCommand("Hola buenas tardes", "EN PUERTA"), null);
  assert.equal(matchDriverCommand("", "EN PUERTA"), null);
  assert.equal(matchDriverCommand("", "PEDIDO EN DIRECCION AL DOMICILIO"), null);
});
