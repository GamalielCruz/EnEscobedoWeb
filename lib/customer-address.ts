export type CustomerAddress = {
  id: string;
  label: string;
  formattedAddress: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
};

export const ACTIVE_ADDRESS_KEY = "activeCustomerAddress";

export const customerAddressStorageKey = (userId: string) =>
  `${ACTIVE_ADDRESS_KEY}:${userId}`;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const coordinate = (value: unknown, min: number, max: number) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
};

export function normalizeCustomerAddress(value: unknown): CustomerAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const street = text(input.street ?? input.address, 120);
  const city = text(input.city, 80);
  const state = text(input.state, 80);
  const formattedAddress =
    text(input.formattedAddress ?? input.formatted_address, 240) ||
    [street, city, state].filter(Boolean).join(", ");

  if (street.length < 3 || formattedAddress.length < 5) return null;

  return {
    id: text(input.id, 80),
    label: text(input.label, 60) || street,
    formattedAddress,
    street,
    city,
    state,
    postalCode: text(input.postalCode ?? input.postal_code, 12),
    country: text(input.country, 60) || "México",
    latitude: coordinate(input.latitude, -90, 90),
    longitude: coordinate(input.longitude, -180, 180),
  };
}

export function parseCustomerAddress(value: string | null) {
  try {
    return normalizeCustomerAddress(value ? JSON.parse(value) : null);
  } catch {
    return null;
  }
}

export function restoreCustomerAddress(storedValue: string | null, checkoutValue: unknown) {
  return parseCustomerAddress(storedValue) ?? normalizeCustomerAddress(checkoutValue);
}

// ── Identidad y deduplicación ────────────────────────────────────────────
//
// La identidad de un registro es su `id` (edición = mismo registro, aunque
// cambien los datos). Para registros sin `id` (datos legacy) se comparan los
// datos reales: calle, ciudad, código postal y coordenadas. El nombre
// (label) NO forma parte de la identidad: dos registros con el mismo nombre
// pero distinta ubicación son direcciones distintas.

const logicalAddressKey = (address: CustomerAddress) => {
  const norm = (value: string) => value.trim().toLocaleLowerCase("es-MX");
  const parts = [norm(address.street), norm(address.city), norm(address.postalCode)];
  if (typeof address.latitude === "number" && typeof address.longitude === "number") {
    parts.push(address.latitude.toFixed(5), address.longitude.toFixed(5));
  }
  return parts.join("|");
};

/** Dos direcciones representan el mismo registro lógico. */
export function sameCustomerAddress(a: CustomerAddress, b: CustomerAddress): boolean {
  if (a.id && b.id) return a.id === b.id;
  return logicalAddressKey(a) === logicalAddressKey(b);
}

/**
 * Devuelve la lista sin duplicados preservando el orden.
 * - Mismo `id` → se conserva la versión más reciente (última aparición).
 * - Sin `id`, misma clave lógica (datos + coordenadas) → se conserva la
 *   primera aparición.
 * No colapsa registros con ids distintos aunque tengan el mismo contenido:
 * eso corresponde a la persistencia, no al estado de la UI.
 */
export function dedupeCustomerAddresses(list: CustomerAddress[]): CustomerAddress[] {
  const seen = new Set<string>();
  const result: CustomerAddress[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    const key = item.id ? `id:${item.id}` : `key:${logicalAddressKey(item)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.unshift(item);
  }
  return result;
}

/**
 * Selecciona la dirección activa: primero la referenciada por
 * `activeAddressId`, luego una preferida (localStorage), luego la primera.
 * Siempre devuelve un único registro → a lo sumo una dirección marcada
 * como ACTUAL.
 */
export function selectActiveAddress(
  addresses: CustomerAddress[],
  activeAddressId: string,
  preferredId?: string
): CustomerAddress | null {
  return (
    addresses.find((address) => address.id === activeAddressId) ??
    addresses.find((address) => address.id === preferredId) ??
    addresses[0] ??
    null
  );
}
