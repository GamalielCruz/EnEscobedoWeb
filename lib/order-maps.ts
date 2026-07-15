type DeliveryAddress = {
  line1?: string;
  latitude?: number;
  longitude?: number;
};

export function buildAddressMapsUrl(address?: DeliveryAddress | null, fallback = "Ver pedido") {
  const hasCoordinates = Number.isFinite(address?.latitude) && Number.isFinite(address?.longitude);
  const target = hasCoordinates ? `${address!.latitude},${address!.longitude}` : String(address?.line1 || fallback).trim();
  return `https://www.google.com/maps?q=${encodeURIComponent(target)}`;
}
