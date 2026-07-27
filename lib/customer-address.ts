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

export const DEFAULT_CUSTOMER_ADDRESS: CustomerAddress = {
  id: "5-de-febrero-64",
  label: "5 de febrero #64",
  formattedAddress: "5 de febrero #64, Pedro Escobedo, Querétaro",
  street: "5 de febrero #64",
  city: "Pedro Escobedo",
  state: "Querétaro",
  postalCode: "",
  country: "México",
};

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
