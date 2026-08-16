type DeliveryAddress = {
  line1?: string;
  street?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
};

export function buildAddressMapsUrl(address?: DeliveryAddress | null, fallback = "Ver pedido") {
  const hasCoordinates = Number.isFinite(address?.latitude) && Number.isFinite(address?.longitude);
  const target = hasCoordinates ? `${address!.latitude},${address!.longitude}` : String(address?.line1 || fallback).trim();
  return `https://www.google.com/maps?q=${encodeURIComponent(target)}`;
}

// ────────────────────────────────────────────────────────────────────────
// Datos de la plantilla `confirmacion_repartidor` (confirmación de
// asignación del repartidor): el texto visible (restaurante/recolección y
// dirección de entrega) y las dos URLs de Google Maps de los botones
// "Ver en Maps". Es una función pura y testeable; el webhook y el dispatch
// construyen la plantilla con ella.
//
// Para MANDADOS no existe tienda de origen: los puntos reales viven en
// `mandadoOrigin`/`mandadoDestination` (label + lat/lng) y, cuando la query
// los proyecta, en los campos planos `storeLat/storeLng`/`destLat/destLng`/
// `mandadoOriginLabel`/`mandadoDestinationLabel` (coalesce en GROQ, igual
// que en lib/dispatch/dispatch-core.ts). Se aceptan ambos para que la
// función siga funcionando aunque falten los campos planos.
// ────────────────────────────────────────────────────────────────────────

export type DriverConfirmationData = {
  restaurantName: string;
  deliveryAddress: string;
  restaurantMapsUrl: string;
  clientMapsUrl: string;
};

export type DriverConfirmationOrder = {
  serviceKind?: unknown;
  storeName?: unknown;
  storeAddress?: unknown;
  storeLat?: unknown;
  storeLng?: unknown;
  destLat?: unknown;
  destLng?: unknown;
  destLabel?: unknown;
  mandadoOriginLabel?: unknown;
  mandadoDestinationLabel?: unknown;
  storeCoordinates?: { latitude?: unknown; longitude?: unknown } | null;
  shippingAddress?: DeliveryAddress | null;
  mandadoOrigin?: { label?: unknown; lat?: unknown; lng?: unknown } | null;
  mandadoDestination?: { label?: unknown; lat?: unknown; lng?: unknown } | null;
};

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** URL de Google Maps: coordenadas cuando existen, búsqueda de texto como respaldo. */
function mapsUrl(latitude: unknown, longitude: unknown, textFallback: string): string {
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);
  if (lat !== null && lng !== null) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return `https://maps.google.com/maps?q=${encodeURIComponent(String(textFallback ?? "").trim())}`;
}

export function buildDriverConfirmationData(order: DriverConfirmationOrder): DriverConfirmationData {
  const isMandado = String(order.serviceKind ?? "") === "mandado";

  // Punto de recolección: para mandados es el origen capturado por el cliente;
  // para restaurantes, la tienda afiliada.
  const originLabel = String(
    order.mandadoOriginLabel ?? order.mandadoOrigin?.label ?? order.storeName ?? "el punto de recolección"
  );
  const destinationLabel = String(
    order.mandadoDestinationLabel ?? order.mandadoDestination?.label ?? order.destLabel ?? "Ver pedido"
  );

  const storeLat = order.storeLat ?? order.storeCoordinates?.latitude ?? order.mandadoOrigin?.lat;
  const storeLng = order.storeLng ?? order.storeCoordinates?.longitude ?? order.mandadoOrigin?.lng;
  const destLat = order.destLat ?? order.shippingAddress?.latitude ?? order.mandadoDestination?.lat;
  const destLng = order.destLng ?? order.shippingAddress?.longitude ?? order.mandadoDestination?.lng;

  const storeTextFallback = isMandado
    ? originLabel
    : String(order.storeAddress ?? order.storeName ?? "la tienda");

  const restaurantName = isMandado ? originLabel : String(order.storeName ?? "La Tienda");

  const deliveryAddress = isMandado
    ? destinationLabel
    : [order.shippingAddress?.line1, order.shippingAddress?.street, order.shippingAddress?.city]
        .filter(Boolean)
        .join(", ") || "Ver pedido";

  return {
    restaurantName,
    deliveryAddress,
    restaurantMapsUrl: mapsUrl(storeLat, storeLng, storeTextFallback),
    clientMapsUrl: mapsUrl(destLat, destLng, deliveryAddress),
  };
}
