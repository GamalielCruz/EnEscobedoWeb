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

export const addressLabel = (address: CustomerAddress) =>
  address.label?.trim() || address.street?.trim() || address.formattedAddress?.trim() || "Dirección";

// ─────────────────────────────────────────────────────────────────────────────
// Geocodificación con Google Maps (helpers compartidos)
//
// El script de Google Maps lo carga useGoogleMaps (hooks/useGoogleMaps.ts) o
// cualquier otro loader del proyecto; estas funciones solo operan sobre
// `window.google.maps` en tiempo de ejecución y desde componentes cliente.
// Centralizan el parsing de `address_components` que antes estaba duplicado en
// EnhancedAddressInput y ModernDeliveryFlow: devuelven un CustomerAddress
// parcial con texto estructurado + coordenadas, listo para guardarse tal cual.
// ─────────────────────────────────────────────────────────────────────────────

export type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export type GooglePlaceLike = {
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: {
    location?: { lat: () => number; lng: () => number };
  };
};

/**
 * Convierte los `address_components` de Google (PlaceResult o GeocoderResult)
 * en los campos estructurados de CustomerAddress. Nunca lanza: devuelve
 * siempre los campos con los valores que encontró (vacíos si faltan).
 */
export function parseGoogleAddressComponents(
  components: GoogleAddressComponent[] | undefined
): Pick<CustomerAddress, "street" | "city" | "state" | "postalCode" | "country"> {
  const streetParts: string[] = [];
  let city = "";
  let state = "";
  let postalCode = "";
  let country = "México";

  for (const component of components ?? []) {
    const types = component.types;
    if (types.includes("street_number") || types.includes("route")) {
      streetParts.push(component.long_name);
    } else if (types.includes("locality")) {
      city = city || component.long_name;
    } else if (types.includes("administrative_area_level_1")) {
      state = component.long_name;
    } else if (types.includes("postal_code")) {
      postalCode = component.long_name;
    } else if (types.includes("country")) {
      country = component.long_name;
    }
  }
  // Sin `locality` (p. ej. una colonia o municipio), caemos al nivel 2.
  if (!city) {
    for (const component of components ?? []) {
      if (component.types.includes("sublocality_level_1") || component.types.includes("administrative_area_level_2")) {
        city = component.long_name;
        break;
      }
    }
  }

  return {
    street: streetParts.join(" ").trim(),
    city,
    state,
    postalCode,
    country: country || "México",
  };
}

/**
 * Convierte un resultado de Google (place de Autocomplete o resultado de
 * Geocoder) en un CustomerAddress parcial con coordenadas. Si el resultado no
 * trae geometría, las coordenadas quedan undefined.
 */
export function googlePlaceToCustomerAddress(place: GooglePlaceLike): Partial<CustomerAddress> {
  const fields = parseGoogleAddressComponents(place.address_components);
  const lat = place.geometry?.location?.lat?.();
  const lng = place.geometry?.location?.lng?.();
  const formattedAddress =
    place.formatted_address ||
    [fields.street, fields.city, fields.state].filter(Boolean).join(", ");
  return {
    formattedAddress,
    street: fields.street || formattedAddress,
    city: fields.city,
    state: fields.state,
    postalCode: fields.postalCode,
    country: fields.country || "México",
    latitude: typeof lat === "number" && Number.isFinite(lat) ? lat : undefined,
    longitude: typeof lng === "number" && Number.isFinite(lng) ? lng : undefined,
  };
}

/**
 * Reverse geocoding: coordenadas → dirección legible (Google Geocoder).
 * Devuelve null si Google no está cargado o no encuentra dirección.
 */
export function reverseGeocodeCustomerAddress(
  lat: number,
  lng: number
): Promise<Partial<CustomerAddress> | null> {
  return new Promise((resolve) => {
    const gmaps = (window as { google?: any }).google?.maps;
    if (!gmaps?.Geocoder) return resolve(null);
    try {
      new gmaps.Geocoder().geocode({ location: { lat, lng } }, (results: any, status: string) => {
        if (status === "OK" && results?.[0]) {
          resolve({ ...googlePlaceToCustomerAddress(results[0]), latitude: lat, longitude: lng });
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Forward geocoding: texto → dirección estructurada con coordenadas
 * (Google Geocoder, restringido a México). Devuelve null si no la encuentra.
 */
export function geocodeCustomerAddress(
  text: string
): Promise<Partial<CustomerAddress> | null> {
  return new Promise((resolve) => {
    const gmaps = (window as { google?: any }).google?.maps;
    if (!gmaps?.Geocoder) return resolve(null);
    try {
      new gmaps.Geocoder().geocode({ address: text, region: "mx" }, (results: any, status: string) => {
        if (status === "OK" && results?.[0]) {
          resolve(googlePlaceToCustomerAddress(results[0]));
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
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
