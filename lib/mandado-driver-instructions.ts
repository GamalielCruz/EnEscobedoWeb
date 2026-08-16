/**
 * Mensaje de texto libre para el repartidor al aceptar un mandado (ACEPTO).
 *
 * Lleva las direcciones reales de recolección y entrega y las "Indicaciones
 * para el repartidor" que capturó el cliente (mandadoOriginReference /
 * mandadoDestinationReference): la información que el cliente escribe debe
 * llegar al repartidor cuando es operacionalmente relevante.
 *
 * Es un mensaje del bot (texto libre) — no usa plantillas aprobadas de Meta.
 * Se mantiene puro (sin imports de servidor) para poder probarlo en unit tests.
 */
export function buildMandadoDriverInstructions(
  order: {
    orderNumber?: unknown;
    mandadoOriginReference?: unknown;
    mandadoDestinationReference?: unknown;
    mandadoDetails?: unknown;
    deliveryNotes?: unknown;
  },
  originLabel: string,
  destinationLabel: string
): string {
  const originReference = String(order.mandadoOriginReference ?? "").trim();
  const destinationReference = String(order.mandadoDestinationReference ?? "").trim();
  const details = String(order.mandadoDetails ?? order.deliveryNotes ?? "").trim();
  const lines: string[] = [`📦 MANDADO #${String(order.orderNumber ?? "")}`];
  lines.push("");
  lines.push("RECOLECCIÓN");
  lines.push(`📍 ${originLabel}`);
  if (originReference) lines.push(`💬 ${originReference}`);
  lines.push("");
  lines.push("ENTREGA");
  lines.push(`📍 ${destinationLabel}`);
  if (destinationReference) lines.push(`💬 ${destinationReference}`);
  if (details) {
    lines.push("");
    lines.push(`Artículo: ${details}`);
  }
  return lines.join("\n");
}
