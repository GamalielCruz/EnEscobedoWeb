/**
 * ÚNICA FUENTE DE VERDAD para los nombres de las plantillas de WhatsApp.
 *
 * Los nombres deben coincidir EXACTAMENTE con las plantillas aprobadas en Meta.
 * Si Meta cambia un nombre, edita ÚNICAMENTE este archivo: todo el proyecto
 * importa los nombres desde aquí (nunca se escriben como strings sueltos).
 *
 * NOTA DE IMPORTS: `mandado-whatsapp-config.ts` y `scheduled-order-whatsapp-config.ts`
 * importan este módulo con extensión explícita (`./whatsapp/templates.ts`) porque los
 * tests de node (`--experimental-strip-types`) requieren la extensión en imports
 * relativos. No quitarles la extensión: rompería los tests. El resto del proyecto
 * puede importar con alias sin extensión (`@/lib/whatsapp/templates`).
 *
 * ── Flujo de Mandados (plantillas oficiales aprobadas) ──
 *  - `mandado_cliente`                        → remitente: paquete recogido y en camino.
 *  - `mandado__destinatario`                  → destinatario: le enviaron un mandado.
 *                                               NO solicita NIP (el NIP solo lo recibe el remitente).
 *  - `orden_repartidor`                       → nombre heredado de Meta (engañoso): se envía
 *                                               SIEMPRE al CLIENTE (remitente), avisa que la orden
 *                                               está por completarse y ofrece el botón Ayuda.
 *  - `cliente_entrega_programada_sin_repartidor` → cliente: sin repartidor; 3 botones de contingencia.
 *  - `cliente_repartidor_en_puerta`           → cliente/remitente: repartidor en la puerta y NIP
 *                                               para validar la entrega. Nunca se envía al destinatario.
 */
export const WHATSAPP_TEMPLATES = {
  // ── Mandados ──
  mandadoCliente: "mandado_cliente",
  mandadoDestinatario: "mandado__destinatario",
  ordenRepartidor: "orden_repartidor",
  clienteEntregaProgramadaSinRepartidor: "cliente_entrega_programada_sin_repartidor",
  clienteRepartidorEnPuerta: "cliente_repartidor_en_puerta",

  // ── Pedidos de restaurantes ──
  confirmacionPedido: "confirmacion_pedido",
  clientePickupRecibido: "cliente_pickup_recibido",
  restaurantePickupPedido: "restaurante_pickup_pedido",
  clientePickupOrdenLista: "cliente_pickup_orden_lista",
  nuevoPedidoRestaurante: "nuevo_pedido_restaurante",
  repartidorEnCaminoRestaurante: "repartidor_en_camino_restaurante",
  pedidoEnCamino: "pedido_en_camino",
  pedidoEntregado: "pedido_entregado",
  pedidoCancelado: "pedido_cancelado",
  ofertaReparto: "oferta_reparto",
  confirmacionRepartidor: "confirmacion_repartidor",

  // ── Pedidos programados ──
  clientePedidoProgramado: "cliente_pedido_programado",
  clientePedidoProgramadoEnPreparacion: "cliente_pedido_programado_en_preparacion",

  // ── Repartidores (driver) ──
  repartidorEnCamino: "repartidor_en_camino",
  repartidorEnPuerta: "repartidor_en_puerta",

  // Confirmación inicial de Mandados: pendiente de plantilla exclusiva en Meta.
  // No reutilizar `confirmacionPedido` (creada para restaurantes). Cuando exista,
  // agregar aquí su nombre y conectarla en los flujos de creación de mandados.
} as const;

export type WhatsAppTemplateName =
  (typeof WHATSAPP_TEMPLATES)[keyof typeof WHATSAPP_TEMPLATES];
