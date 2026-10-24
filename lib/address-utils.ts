// Conversiones centralizadas entre los formatos de dirección del sistema.
//
// - `CustomerAddress` (lib/customer-address.ts) es el modelo principal de la
//   libreta de direcciones del usuario (Clerk privateMetadata + localStorage).
// - `MandadoAddressPoint` (lib/mandado.ts) es el snapshot que guarda una orden
//   de Mandado (label + lat + lng).
//
// La orden SIEMPRE conserva un snapshot independiente de la dirección guardada:
// si mañana el usuario edita su dirección, las órdenes ya creadas no cambian.

import type { CustomerAddress } from "./customer-address";
import type { MandadoAddressPoint } from "./mandado";
import {
  mapboxForwardGeocode,
  mapboxReverseGeocode,
  type MapboxGeocodeResult,
} from "./mapbox";

export const addressLabel = (address: CustomerAddress) =>
  address.label?.trim() || address.street?.trim() || address.formattedAddress?.trim() || "Dirección";

// ─────────────────────────────────────────────────────────────────────────────
// Geocodificación con Mapbox (helpers compartidos)
//
// Usan la Geocoding API v6 a través de lib/mapbox.ts (fetch, client-safe).
// Centralizan la conversión de una feature de Mapbox al modelo CustomerAddress
// para que los componentes no dupliquen el parsing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte un resultado de Mapbox (forward o reverse) en un CustomerAddress
 * parcial con coordenadas. Devuelve null si el resultado no es válido.
 */
export function mapboxResultToCustomerAddress(
  result: MapboxGeocodeResult | null | undefined
): Partial<CustomerAddress> | null {
  if (!result) return null;
  const formattedAddress =
    result.fullAddress ||
    [result.street, result.city, result.state].filter(Boolean).join(", ");
  return {
    formattedAddress,
    street: result.street || formattedAddress,
    city: result.city,
    state: result.state,
    postalCode: result.postalCode,
    country: result.country || "México",
    latitude: Number.isFinite(result.latitude) ? result.latitude : undefined,
    longitude: Number.isFinite(result.longitude) ? result.longitude : undefined,
  };
}

/**
 * Reverse geocoding: coordenadas → dirección legible (Mapbox).
 * Devuelve null si no se encuentra dirección o falla la petición.
 */
export async function reverseGeocodeCustomerAddress(
  lat: number,
  lng: number
): Promise<Partial<CustomerAddress> | null> {
  const result = await mapboxReverseGeocode(lat, lng);
  const address = mapboxResultToCustomerAddress(result);
  if (!address) return null;
  return { ...address, latitude: lat, longitude: lng };
}

/**
 * Forward geocoding: texto → dirección estructurada con coordenadas
 * (Mapbox, restringido a México). Devuelve null si no la encuentra.
 */
export async function geocodeCustomerAddress(
  text: string
): Promise<Partial<CustomerAddress> | null> {
  const [result] = await mapboxForwardGeocode(text, { limit: 1, country: "mx" });
  return mapboxResultToCustomerAddress(result);
}

/**
 * Convierte una dirección guardada del usuario al punto que usa el flujo de
 * Mandados (label + coordenadas). Si la dirección guardada no tiene
 * coordenadas, devuelve null: en ese caso el usuario debe ubicarla en el mapa.
 */
export function customerAddressToMandadoPoint(
  address: CustomerAddress
): MandadoAddressPoint | null {
  if (
    typeof address.latitude !== "number" ||
    typeof address.longitude !== "number" ||
    !Number.isFinite(address.latitude) ||
    !Number.isFinite(address.longitude)
  ) {
    return null;
  }
  return {
    label: addressLabel(address),
    lat: address.latitude,
    lng: address.longitude,
  };
}
