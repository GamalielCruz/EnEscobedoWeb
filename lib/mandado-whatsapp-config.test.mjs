import assert from "node:assert/strict";
import test from "node:test";
import {
  MANDADO_WHATSAPP_TEMPLATES,
  buildMandadoTemplateComponents,
} from "./mandado-whatsapp-config.ts";

test("mandado_cliente envia 3 variables de cuerpo sin botones", () => {
  const result = buildMandadoTemplateComponents({
    templateName: "mandado_cliente",
    bodyParameters: ["Juan", "#240952", "5 de febrero #64"],
  });
  assert.deepEqual(result.buttonComponents, []);
  assert.equal(MANDADO_WHATSAPP_TEMPLATES.clientPickedUp.language, "es_MX");
});

test("mandado__destinatario omite botones (receptor no requiere codigo)", () => {
  const result = buildMandadoTemplateComponents({
    templateName: "mandado__destinatario",
    bodyParameters: ["Ignacio", "#240952"],
  });
  assert.deepEqual(result.buttonComponents, []);
  assert.equal(MANDADO_WHATSAPP_TEMPLATES.recipientOnTheWay.hasButtons, false);
});

test("orden_repartidor conserva el boton Ayuda con parametro dinamico", () => {
  const result = buildMandadoTemplateComponents({
    templateName: "orden_repartidor",
    bodyParameters: ["#240952", "por completarse"],
    buttonParameters: ["MANDADO_AYUDA|order-1"],
  });
  assert.deepEqual(result.buttonComponents, [
    { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "MANDADO_AYUDA|order-1" }] },
  ]);
  assert.equal(MANDADO_WHATSAPP_TEMPLATES.orderAboutToComplete.buttons[0].text, "Ayuda");
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
      bodyParameters: ["Juan", "#240952", "5 de febrero #64"],
      buttonParameters: ["inventado"],
    }),
    /no admite botones/
  );
});

test("cada plantilla exige exactamente sus variables aprobadas", () => {
  assert.throws(
    () => buildMandadoTemplateComponents({
      templateName: "mandado__destinatario",
      bodyParameters: ["Ignacio"],
    }),
    /requiere 2 variables/
  );
});

test("orden_repartidor rechaza parametros de boton incompletos", () => {
  assert.throws(
    () => buildMandadoTemplateComponents({
      templateName: "orden_repartidor",
      bodyParameters: ["#240952", "por completarse"],
    }),
    /requiere 1 parametros/
  );
});

test("mapeo central conserva nombres e idioma exactos", () => {
  assert.deepEqual(
    Object.values(MANDADO_WHATSAPP_TEMPLATES).map(({ name, language }) => [name, language]),
    [
      ["mandado_cliente", "es_MX"],
      ["mandado__destinatario", "es_MX"],
      ["orden_repartidor", "es_MX"],
      ["cliente_entrega_programada_sin_repartidor", "es_MX"],
    ]
  );
});
