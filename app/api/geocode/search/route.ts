import { NextRequest, NextResponse } from "next/server";
import { mapboxForwardGeocode } from "@/lib/mapbox";

/**
 * Autocompletado de direcciones (Mapbox Geocoding v6).
 * Respuesta estable que ya consumen los flujos de mandados y checkout:
 * [{ label, lat, lng }]
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 3) return NextResponse.json([]);

  const proximity = (() => {
    const lat = Number(request.nextUrl.searchParams.get("lat"));
    const lng = Number(request.nextUrl.searchParams.get("lng"));
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
  })();

  const results = await mapboxForwardGeocode(query, {
    limit: 5,
    country: "mx",
    language: "es",
    proximity,
  });

  if (!results.length) {
    // Sin resultados no es un error de proveedor: devolver lista vacía deja
    // que el usuario ajuste el texto o toque el mapa.
    return NextResponse.json([]);
  }

  const suggestions = results.map((result) => ({
    label: result.fullAddress || result.label,
    lat: result.latitude,
    lng: result.longitude,
  }));

  return NextResponse.json(
    suggestions.filter(
      (item, index) =>
        suggestions.findIndex((candidate) => candidate.label === item.label) === index
    )
  );
}
