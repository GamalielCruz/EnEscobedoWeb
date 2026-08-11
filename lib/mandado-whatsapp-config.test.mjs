import assert from "node:assert/strict";
import test from "node:test";
import {
  MANDADO_WHATSAPP_TEMPLATES,
  buildMandadoTemplateComponents,
} from "./mandado-whatsapp-config.ts";

test("mandado_cliente envia 3 variables de cuerpo en el orden aprobado: nombre, direccion (tras el 📍), folio", () => {
  const result = buildMandadoTemplateComponents({
    templateName: "mandado_cliente",
    bodyParameters: ["Juan", "5 de febrero #64", "#240952"],
  });
  assert.deepEqual(result.buttonComponents, []);
  assert.deepEqual(result.bodyParameters, ["Juan", "5 de febrero #64", "#240952"]);
  assert.deepEqual(MANDADO_WHATSAPP_TEMPLATES.clientPickedUp.bodyVariables, ["customerName", "deliveryAddress", "orderNumber"]);
  assert.equal(MANDADO_WHATSAPP_TEMPLATES.clientPickedUp.language, "es_MX");
});

test("mandado__destinatario es texto estatico en Meta: 0 variables de cuerpo y omite botones (NIP solo al remitente)", () => {
  const result = buildMandadoTemplateComponents({
    templateName: "mandado__destinatario",
    bodyParameters: [],
  });
  assert.deepEqual(result.buttonComponents, []);
  assert.deepEqual(result.bodyParameters, []);
  assert.equal(MANDADO_WHATSAPP_TEMPLATES.recipientOnTheWay.hasButtons, false);
  assert.deepEqual(MANDADO_WHATSAPP_TEMPLATES.recipientOnTheWay.bodyVariables, []);
});

test("orden_repartidor conserva el boton Ayuda con parametro dinamico", () => {
  const result = buildMandadoTemplateComponents({
    templateName: "orden_repartidor",
    bodyParameters: ["240952"],
    buttonParameters: ["MANDADO_AYUDA|order-1"],
  });
  assert.deepEqual(result.buttonComponents, [
    { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "MANDADO_AYUDA|order-1" }] },
  ]);
  assert.equal(MANDADO_WHATSAPP_TEMPLATES.orderAboutToComplete.buttons[0].text, "Ayuda");
});

test("orden_repartidor lleva el NIP como unica variable de cuerpo", () => {
  const result = buildMandadoTemplateComponents({
    templateName: "orden_repartidor",
    bodyParameters: ["240952"],
    buttonParameters: ["MANDADO_AYUDA|order-1"],
  });
  assert.deepEqual(result.bodyParameters, ["240952"]);
  assert.deepEqual(MANDADO_WHATSAPP_TEMPLATES.orderAboutToComplete.bodyVariables, ["deliveryPin"]);
});

test("contingencia sin repartidor exige tres quick replies en orden aprobado", () => {
  const result = buildMandadoTemplateComponents({
    templateName: "cliente_entrega_programada_sin_repartidor",
    bodyParameters: ["Juan", "#240952", "lo antes posible"],
    buttonParameters: ["SCHEDULE WAIT|order-1", "SCHEDULE PICKUP|order-1", "SCHEDULE HELP|order-1"],
  });
  assert.deepEqual(
    result.buttonComponents.map((component) => component.index),
    ["0", "1", "2"]
  );
});

test("mandado_cliente rechaza botones inventados", () => {
  assert.throws(
    () => buildMandadoTemplateComponents({
      templateName: "mandado_cliente",
      bodyParameters: ["Juan", "5 de febrero #64", "#240952"],
      buttonParameters: ["inventado"],
    }),
    /no admite botones/
  );
});

test("cada plantilla exige exactamente sus variables aprobadas", () => {
  // mandado__destinatario aprobó CERO variables: pasar una o dos debe fallar.
  assert.throws(
    () => buildMandadoTemplateComponents({
      templateName: "mandado__destinatario",
      bodyParameters: ["No se requiere código para recibir este mandado."],
    }),
    /requiere 0 variables/
  );
  assert.throws(
    () => buildMandadoTemplateComponents({
      templateName: "mandado__destinatario",
      bodyParameters: ["Ignacio", "#240952"],
    }),
    /requiere 0 variables/
  );
});

test("orden_repartidor rechaza parametros de boton incompletos", () => {
  assert.throws(
    () => buildMandadoTemplateComponents({
      templateName: "orden_repartidor",
      bodyParameters: ["240952"],
    }),
    /requiere 1 parametros/
  );
});

test("mapeo central conserva nombres e idioma exactos", () => {
  // El filtro de pendingApproval se conserva por si en el futuro se registra
  // otra plantilla pendiente de aprobación (hoy ninguna la tiene).
  const approved = Object.values(MANDADO_WHATSAPP_TEMPLATES).filter((t) => !t.pendingApproval);
  assert.deepEqual(
    approved.map(({ name, language }) => [name, language]),
    [
      ["mandado_cliente", "es_MX"],
      ["mandado__destinatario", "es_MX"],
      ["orden_repartidor", "es_MX"],
      ["mandado_destino_en_puerta", "es_MX"],
      ["cliente_entrega_programada_sin_repartidor", "es_MX"],
    ]
  );
});

test("mandado_destino_en_puerta esta APROBADA con dos variables (direccion + accion) y sin botones", () => {
  assert.equal(MANDADO_WHATSAPP_TEMPLATES.destinoEnPuerta.name, "mandado_destino_en_puerta");
  assert.equal(MANDADO_WHATSAPP_TEMPLATES.destinoEnPuerta.pendingApproval, undefined);
  assert.deepEqual(MANDADO_WHATSAPP_TEMPLATES.destinoEnPuerta.bodyVariables, ["deliveryAddress", "deliveryAction"]);
  const result = buildMandadoTemplateComponents({
    templateName: "mandado_destino_en_puerta",
    bodyParameters: ["5 de febrero #64", "la entrega de tu mandado"],
  });
  assert.deepEqual(result.buttonComponents, []);
  assert.deepEqual(result.bodyParameters, ["5 de febrero #64", "la entrega de tu mandado"]);
});
