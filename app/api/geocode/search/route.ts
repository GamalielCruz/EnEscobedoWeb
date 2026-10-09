import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 3) return NextResponse.json([]);

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lat", "20.502");
  url.searchParams.set("lon", "-100.145");

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error("Geocoder unavailable");
    const result = (await response.json()) as { features?: Array<{ properties?: Record<string, string>; geometry?: { coordinates?: number[] } }> };
    const suggestions = (result.features || []).flatMap(({ properties = {}, geometry }) => {
      const [lng, lat] = geometry?.coordinates || [];
      if (properties.countrycode !== "MX" || properties.type === "county" || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const label = [...new Set([properties.name, properties.street, properties.housenumber, properties.city, properties.county, properties.state, properties.postcode, properties.country].filter(Boolean))].join(", ");
      return label ? [{ label, lat, lng }] : [];
    });
    return NextResponse.json(suggestions.filter((item, index) => suggestions.findIndex((candidate) => candidate.label === item.label) === index));
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}
