import assert from "node:assert/strict";
import test from "node:test";
import {
  SCHEDULED_ORDER_WHATSAPP_TEMPLATES,
  buildScheduledOrderTemplateComponents,
} from "./scheduled-order-whatsapp-config.ts";
import { isProductionDeployment } from "./deployment-environment.ts";

test("confirmacion programada omite completamente botones", () => {
  const result = buildScheduledOrderTemplateComponents({
    templateName: "cliente_pedido_programado",
    bodyParameters: ["Ana", "#1", "Tienda", "28/07/2026", "15:00 - 15:30", "Entrega", "150.00"],
  });
  assert.deepEqual(result.buttonComponents, []);
  assert.equal(SCHEDULED_ORDER_WHATSAPP_TEMPLATES.orderConfirmed.language, "es_MX");
});

test("preparacion conserva el boton URL estatico sin parametro inventado", () => {
  const result = buildScheduledOrderTemplateComponents({
    templateName: "cliente_pedido_programado_en_preparacion",
    bodyParameters: ["Ana", "#1", "Tienda", "15:00"],
  });
  assert.deepEqual(result.buttonComponents, []);
  assert.equal(
    SCHEDULED_ORDER_WHATSAPP_TEMPLATES.preparationStarted.buttons[0].text,
    "Ver mi pedido"
  );
});

test("contingencia exige tres quick replies en el orden aprobado", () => {
  const result = buildScheduledOrderTemplateComponents({
    templateName: "cliente_entrega_programada_sin_repartidor",
    bodyParameters: ["Ana", "#1", "15:00"],
    buttonParameters: ["SCHEDULE WAIT|order-1", "SCHEDULE PICKUP|order-1", "SCHEDULE HELP|order-1"],
  });
  assert.deepEqual(
    result.buttonComponents.map((component) => component.index),
    ["0", "1", "2"]
  );
});

test("confirmacion rechaza cualquier boton inventado", () => {
  assert.throws(
    () => buildScheduledOrderTemplateComponents({
      templateName: "cliente_pedido_programado",
      bodyParameters: ["Ana", "#1", "Tienda", "28/07/2026", "15:00 - 15:30", "Entrega", "150.00"],
      buttonParameters: ["inventado"],
    }),
    /no admite botones/
  );
});

test("cada plantilla exige exactamente sus variables aprobadas", () => {
  assert.throws(
    () => buildScheduledOrderTemplateComponents({
      templateName: "cliente_pedido_programado_en_preparacion",
      bodyParameters: ["Ana", "#1"],
    }),
    /requiere 4 variables/
  );
});

test("contingencia rechaza quick replies incompletos", () => {
  assert.throws(
    () => buildScheduledOrderTemplateComponents({
      templateName: "cliente_entrega_programada_sin_repartidor",
      bodyParameters: ["Ana", "#1", "15:00"],
      buttonParameters: ["SCHEDULE WAIT|order-1"],
    }),
    /requiere 3 parametros/
  );
});

test("mapeo central conserva nombres e idioma exactos", () => {
  assert.deepEqual(
    Object.values(SCHEDULED_ORDER_WHATSAPP_TEMPLATES).map(({ name, language }) => [name, language]),
    [
      ["cliente_pedido_programado", "es_MX"],
      ["cliente_pedido_programado_en_preparacion", "es_MX"],
      ["cliente_entrega_programada_sin_repartidor", "es_MX"],
    ]
  );
});

test("preview y localhost nunca habilitan envíos reales", () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousPublicEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    assert.equal(isProductionDeployment(), false);
    delete process.env.VERCEL_ENV;
    assert.equal(isProductionDeployment(), false);
  } finally {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    if (previousPublicEnv === undefined) delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    else process.env.NEXT_PUBLIC_VERCEL_ENV = previousPublicEnv;
  }
});
