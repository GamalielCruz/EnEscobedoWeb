"use client";

// AddressForm: creación y edición de direcciones por ubicación.
//
// En vez de un formulario de texto ("Dirección completa" + "Etiqueta"), el
// usuario descubre su dirección de tres formas y después la confirma:
//
//   ¿Dónde quieres guardar esta dirección?
//     📍 Usar mi ubicación      → navigator.geolocation → reverse geocode
//     🔎 Buscar una dirección   → Google Places Autocomplete (México)
//     🗺️ Elegir en el mapa      → pin arrastrable + reverse geocode
//        ↓
//   Confirma tu ubicación (mapa + dirección encontrada)
//        ↓
//   ¿Cómo quieres guardarla? (Casa · Oficina · Casa de mamá · Otro)
//        ↓
//   Guardar dirección
//
// El resultado es siempre un CustomerAddress estructurado (texto + lat/lng)
// para que restaurantes, cobertura, tarifas, tienda y Mandados lo reutilicen
// sin geocodificar de nuevo.
//
// Reutiliza la infraestructura de Google Maps del proyecto:
//  - hooks/useGoogleMaps.ts (loader compartido, no crea otro script)
//  - Google Places Autocomplete + Google Geocoder (misma API que
//    GooglePlacesAutocomplete / MandadoMapFlow / ModernDeliveryFlow)
//  - helpers de geocodificación en lib/address-utils.ts (parsing de
//    address_components centralizado)
// Si Google no está disponible (sin API key o error de carga) cae a un
// formulario de texto simple para no bloquear la libreta.
//
// La interfaz de props no cambia: los consumidores (AddressManager,
// AddressSelector, AddressPicker) siguen funcionando igual.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Home,
  Loader2,
  MapPin,
  MoreHorizontal,
  Navigation,
  Search,
  Users,
} from "lucide-react";
import { CustomerAddress, normalizeCustomerAddress } from "@/lib/customer-address";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import {
  geocodeCustomerAddress,
  googlePlaceToCustomerAddress,
  reverseGeocodeCustomerAddress,
} from "@/lib/address-utils";

const LABEL_OPTIONS = ["Casa", "Oficina", "Casa de mamá", "Otro"] as const;
const DEFAULT_CENTER = { lat: 20.502, lng: -100.145 };
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

type Step = "start" | "map" | "label";
type AddressStatus = "idle" | "resolving" | "resolved" | "failed";

const LABEL_ICONS: Record<string, React.ReactNode> = {
  Casa: <Home className="h-4 w-4" />,
  Oficina: <Briefcase className="h-4 w-4" />,
  "Casa de mamá": <Users className="h-4 w-4" />,
  Otro: <MoreHorizontal className="h-4 w-4" />,
};

const inputCls =
  "box-border w-full min-w-0 max-w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#eb1901] focus:ring-2 focus:ring-[#eb1901]/20";

export function AddressForm({
  initial,
  onSave,
  busy,
  submitLabel,
}: {
  /** Dirección existente en modo edición (null en modo crear). */
  initial?: CustomerAddress | null;
  /** Recibe la dirección con la etiqueta ya aplicada. */
  onSave: (address: CustomerAddress) => void;
  busy?: boolean;
  submitLabel?: string;
}) {
  const { isLoaded, loadError } = useGoogleMaps({ apiKey: API_KEY, libraries: ["places"] });

  // ── Estado del flujo ────────────────────────────────────────────────
  // En edición se abre directo en el mapa con la ubicación actual (si tiene
  // coordenadas) para poder ajustarla sin volver a escribir nada.
  const [step, setStep] = useState<Step>(initial ? "map" : "start");
  const [draft, setDraft] = useState<CustomerAddress | null>(initial ?? null);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [addressStatus, setAddressStatus] = useState<AddressStatus>("idle");
  const [locationError, setLocationError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geocodingFallback, setGeocodingFallback] = useState(false);

  // Ref de mapa / búsqueda
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const autocompleteReady = useRef(false);
  const mounted = useRef(true);
  // Indica si el punto actual ya resolvió su dirección (evita geocodificar
  // dos veces el mismo punto al crearse el mapa).
  const resolvedOnceRef = useRef(false);

  // Fallback sin Google Maps (formulario de texto simple)
  const [manualAddress, setManualAddress] = useState(initial?.formattedAddress ?? "");
  const [manualLabel, setManualLabel] = useState(initial?.label ?? "");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const hasCoords = draft?.latitude != null && draft?.longitude != null;

  // ── Mover el pin: actualiza coordenadas y resuelve la dirección ─────
  const movePin = useCallback(
    (lat: number, lng: number) => {
      setAddressStatus("resolving");
      setLocationError(false);
      resolvedOnceRef.current = false;
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setDraft((prev) => ({
        id: prev?.id ?? initial?.id ?? "",
        label: prev?.label ?? "",
        formattedAddress: prev?.formattedAddress || fallback,
        street: prev?.street || fallback,
        city: prev?.city || "",
        state: prev?.state || "",
        postalCode: prev?.postalCode || "",
        country: prev?.country || "México",
        latitude: lat,
        longitude: lng,
      }));
      markerRef.current?.setPosition({ lat, lng });
      mapRef.current?.panTo({ lat, lng });

      reverseGeocodeCustomerAddress(lat, lng).then((resolved) => {
        if (!mounted.current) return;
        if (resolved) {
          resolvedOnceRef.current = true;
          setDraft((prev) => (prev ? { ...prev, ...resolved, latitude: lat, longitude: lng } : null));
          setAddressStatus("resolved");
          if (searchInputRef.current) {
            searchInputRef.current.value = resolved.formattedAddress || fallback;
          }
        } else {
          setAddressStatus("failed");
        }
      });
    },
    [initial?.id]
  );

  // Aplica una dirección ya resuelta (place de Autocomplete o geocode por
  // texto): reemplaza los campos estructurados + coloca el pin en el mapa.
  const applyLocation = useCallback(
    (partial: Partial<CustomerAddress>) => {
      const lat = partial.latitude;
      const lng = partial.longitude;
      if (lat == null || lng == null) return;
      const formattedAddress =
        partial.formattedAddress ||
        [partial.street, partial.city, partial.state].filter(Boolean).join(", ") ||
        `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      setDraft((prev) => ({
        id: prev?.id ?? initial?.id ?? "",
        label: prev?.label ?? "",
        formattedAddress,
        street: partial.street || formattedAddress,
        city: partial.city || prev?.city || "",
        state: partial.state || prev?.state || "",
        postalCode: partial.postalCode || prev?.postalCode || "",
        country: partial.country || prev?.country || "México",
        latitude: lat,
        longitude: lng,
      }));
      setAddressStatus("resolved");
      setLocationError(false);
      resolvedOnceRef.current = true;

      const map = mapRef.current;
      if (map) {
        map.panTo({ lat, lng });
        map.setZoom(17);
      }
      if (markerRef.current) {
        markerRef.current.setPosition({ lat, lng });
      } else if (map) {
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          draggable: true,
          animation: google.maps.Animation.DROP,
        });
        marker.addListener("dragend", () => {
          const position = marker.getPosition();
          if (position) movePin(position.lat(), position.lng());
        });
        markerRef.current = marker;
      }
      if (searchInputRef.current) searchInputRef.current.value = formattedAddress;
    },
    [initial?.id, movePin]
  );

  // ── Mapa: se crea al entrar al paso "map" ───────────────────────────
  useEffect(() => {
    if (step !== "map") {
      mapRef.current = null;
      markerRef.current = null;
      return;
    }
    if (!isLoaded || !mapContainerRef.current || mapRef.current) return;

    const startCenter = hasCoords
      ? { lat: draft.latitude as number, lng: draft.longitude as number }
      : DEFAULT_CENTER;
    const map = new google.maps.Map(mapContainerRef.current, {
      center: startCenter,
      zoom: hasCoords ? 17 : 13,
      disableDefaultUI: true,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",
    });
    mapRef.current = map;

    map.addListener("click", (event: google.maps.MapMouseEvent) => {
      const lat = event.latLng?.lat();
      const lng = event.latLng?.lng();
      if (lat != null && lng != null) movePin(lat, lng);
    });

    if (hasCoords) {
      const marker = new google.maps.Marker({
        position: { lat: draft.latitude as number, lng: draft.longitude as number },
        map,
        draggable: true,
        animation: google.maps.Animation.DROP,
      });
      marker.addListener("dragend", () => {
        const position = marker.getPosition();
        if (position) movePin(position.lat(), position.lng());
      });
      markerRef.current = marker;

      // Si el punto se colocó antes de que Google terminara de cargar (p. ej.
      // "Usar mi ubicación" con red lenta), el reverse geocode inicial falló:
      // se reintenta ahora que el mapa ya existe.
      if (!resolvedOnceRef.current) {
        reverseGeocodeCustomerAddress(
          draft.latitude as number,
          draft.longitude as number
        ).then((resolved) => {
          if (!mounted.current) return;
          if (resolved) {
            resolvedOnceRef.current = true;
            setDraft((prev) => (prev ? { ...prev, ...resolved } : null));
            setAddressStatus("resolved");
            if (searchInputRef.current) {
              searchInputRef.current.value = resolved.formattedAddress || "";
            }
          } else {
            setAddressStatus("failed");
          }
        });
      }
    }
  }, [step, isLoaded, hasCoords, draft?.latitude, draft?.longitude, movePin]);

  // ── Autocompletado de Google Places en el campo de búsqueda ─────────
  useEffect(() => {
    if (step !== "map") {
      autocompleteReady.current = false;
      autocompleteRef.current = null;
      return;
    }
    if (!isLoaded || !searchInputRef.current || autocompleteReady.current) return;
    autocompleteReady.current = true;

    let cancelled = false;
    const init = async () => {
      try {
        const gmaps = (window as { google?: any }).google?.maps;
        if (!gmaps) return;
        // importLibrary garantiza la librería "places" aunque otro componente
        // haya cargado el script sin ella; si no existe, usamos la global.
        const places = gmaps.importLibrary ? await gmaps.importLibrary("places") : gmaps.places;
        if (cancelled || !places?.Autocomplete || !searchInputRef.current) return;
        const autocomplete = new places.Autocomplete(searchInputRef.current, {
          types: ["address"],
          componentRestrictions: { country: "mx" },
          fields: ["formatted_address", "address_components", "geometry", "place_id"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (place?.geometry?.location) applyLocation(googlePlaceToCustomerAddress(place));
        });
        autocompleteRef.current = autocomplete;
      } catch {
        // Sin autocompletado: el usuario puede buscar con Enter (geocode).
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [step, isLoaded, applyLocation]);

  // ── Geolocalización del dispositivo ─────────────────────────────────
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }
    setLocating(true);
    setLocationError(false);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!mounted.current) return;
        setLocating(false);
        setStep("map");
        movePin(coords.latitude, coords.longitude);
      },
      () => {
        if (!mounted.current) return;
        setLocating(false);
        setLocationError(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [movePin]);

  // ── Búsqueda por texto (Enter, sin depender del autocompletado) ─────
  const submitSearch = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const text = searchInputRef.current?.value.trim();
      if (!text || text.length < 3 || !isLoaded) return;
      setGeocodingFallback(true);
      geocodeCustomerAddress(text).then((resolved) => {
        if (!mounted.current) return;
        setGeocodingFallback(false);
        if (resolved && resolved.latitude != null && resolved.longitude != null) {
          applyLocation(resolved);
        } else {
          setAddressStatus("failed");
        }
      });
    },
    [isLoaded, applyLocation]
  );

  const openMap = useCallback((mode: "search" | "map") => {
    setStep("map");
    if (mode === "search") {
      window.setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, []);

  const confirmLocation = useCallback(() => {
    if (!draft) return;
    setStep("label");
  }, [draft]);

  const save = () => {
    const finalLabel = label.trim();
    if (!draft || !finalLabel || busy) return;
    const formattedAddress =
      draft.formattedAddress ||
      [draft.street, draft.city, draft.state].filter(Boolean).join(", ") ||
      "Dirección";
    onSave({
      id: draft.id || initial?.id || "",
      label: finalLabel,
      formattedAddress,
      street: draft.street || formattedAddress,
      city: draft.city || "",
      state: draft.state || "",
      postalCode: draft.postalCode || "",
      country: draft.country || "México",
      latitude: draft.latitude,
      longitude: draft.longitude,
    });
  };

  const displayAddress = draft?.formattedAddress || draft?.street || "";
  const cityLine = [draft?.city, draft?.state].filter(Boolean).join(", ");
  // Se puede confirmar con un punto en el mapa o con una dirección de texto
  // (p. ej. una dirección antigua sin coordenadas que solo se está editando).
  const canConfirm = Boolean(draft) && (hasCoords || Boolean(displayAddress));

  // ── Fallback: Google Maps no disponible → formulario de texto simple ──
  if (loadError || !API_KEY) {
    const saveManual = () => {
      const value = manualAddress.trim();
      const finalLabel = manualLabel.trim();
      if (value.length < 5 || !finalLabel || busy) return;
      const normalized = normalizeCustomerAddress({
        formattedAddress: value,
        street: value,
        country: "México",
      });
      if (!normalized) return;
      onSave({ ...normalized, id: initial?.id ?? normalized.id, label: finalLabel });
    };

    return (
      <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-xl bg-gray-50 p-3">
        <label className="block space-y-2">
          <span className="text-xs font-semibold text-gray-700">Dirección completa</span>
          <div className="relative min-w-0">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={manualAddress}
              onChange={(event) => setManualAddress(event.target.value.slice(0, 240))}
              maxLength={240}
              autoComplete="street-address"
              placeholder="Ej. Calle, número, colonia y municipio"
              className={inputCls}
            />
          </div>
          <span className="block text-xs text-gray-500">
            El mapa no está disponible en este momento. Escribe tu dirección completa.
          </span>
        </label>
        <div className="space-y-2">
          <label htmlFor="address-label-fallback" className="text-xs font-semibold text-gray-700">
            Etiqueta
          </label>
          <div className="flex flex-wrap gap-2">
            {LABEL_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setManualLabel(option)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  manualLabel === option
                    ? "border-[#eb1901] bg-rose-50 text-[#eb1901]"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            id="address-label-fallback"
            value={manualLabel}
            onChange={(event) => setManualLabel(event.target.value.slice(0, 60))}
            maxLength={60}
            placeholder="Casa, Oficina, Casa de mamá…"
            className="box-border w-full min-w-0 max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#eb1901] focus:ring-2 focus:ring-[#eb1901]/20"
          />
        </div>
        <button
          onClick={saveManual}
          disabled={manualAddress.trim().length < 5 || !manualLabel.trim() || busy}
          className="box-border w-full min-w-0 max-w-full rounded-lg bg-[#eb1901] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
            </span>
          ) : (
            submitLabel ?? (initial ? "Guardar cambios" : "Guardar dirección")
          )}
        </button>
      </div>
    );
  }

  // ── Paso 1: ¿Dónde quieres guardar esta dirección? ──────────────────
  if (step === "start") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-bold text-gray-900">¿Dónde quieres guardar esta dirección?</p>

        <button
          type="button"
          onClick={requestLocation}
          disabled={locating}
          className="flex w-full items-center gap-3 rounded-xl border border-[#eb1901]/30 bg-white p-3 text-left transition hover:border-[#eb1901] hover:bg-rose-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-[#eb1901]">
            {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900">Usar mi ubicación</span>
            <span className="block text-xs text-gray-500">Obtén automáticamente tu ubicación actual.</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => openMap("search")}
          className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-[#eb1901] hover:bg-rose-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700">
            <Search className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900">Buscar una dirección</span>
            <span className="block text-xs text-gray-500">Busca calle, colonia, lugar o negocio.</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => openMap("map")}
          className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-[#eb1901] hover:bg-rose-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700">
            <MapPin className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900">Elegir en el mapa</span>
            <span className="block text-xs text-gray-500">Permite mover el mapa y colocar el pin manualmente.</span>
          </span>
        </button>

        {locationError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm font-bold text-gray-900">No pudimos acceder a tu ubicación</p>
            <p className="mt-1 text-xs text-gray-600">
              Puedes buscar una dirección o elegirla directamente en el mapa.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => openMap("search")}
                className="flex-1 rounded-full border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#eb1901] hover:text-[#eb1901]"
              >
                Buscar dirección
              </button>
              <button
                type="button"
                onClick={() => openMap("map")}
                className="flex-1 rounded-full bg-[#eb1901] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#c91602]"
              >
                Elegir en el mapa
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Paso 2: Confirma tu ubicación (mapa) ────────────────────────────
  if (step === "map") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {!initial && (
            <button
              type="button"
              onClick={() => setStep("start")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-200"
              aria-label="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">
              {initial ? `Editar ${initial.label || "dirección"}` : "Confirma tu ubicación"}
            </p>
            <p className="text-xs text-gray-500">Mueve el pin o toca el mapa para ajustar el punto exacto.</p>
          </div>
        </div>

        {/* Búsqueda */}
        <form onSubmit={submitSearch} className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchInputRef}
            defaultValue={initial?.formattedAddress ?? ""}
            autoComplete="off"
            placeholder="Busca calle, colonia, lugar o negocio"
            disabled={!isLoaded}
            className={inputCls}
          />
          {geocodingFallback && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
          )}
        </form>

        <button
          type="button"
          onClick={requestLocation}
          disabled={locating}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-[#eb1901]/40 bg-white px-4 py-2.5 text-xs font-semibold text-[#eb1901] transition hover:bg-rose-50"
        >
          {locating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Detectando ubicación…
            </>
          ) : (
            <>
              <Navigation className="h-4 w-4" /> Usar mi ubicación
            </>
          )}
        </button>

        {/* Mapa */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
          {isLoaded ? (
            <div ref={mapContainerRef} className="h-64 w-full sm:h-72" />
          ) : (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-gray-500 sm:h-72">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando mapa…
            </div>
          )}
        </div>

        {/* Dirección encontrada + confirmación */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Confirma tu ubicación</p>
          {addressStatus === "resolving" ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin text-[#eb1901]" /> Obteniendo dirección…
            </p>
          ) : displayAddress ? (
            <>
              <p className="mt-1 text-sm font-bold text-gray-900">{displayAddress}</p>
              {cityLine && <p className="text-xs text-gray-500">{cityLine}</p>}
              {hasCoords && (
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {Number(draft!.latitude).toFixed(5)}, {Number(draft!.longitude).toFixed(5)}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-600">Toca el mapa o arrastra el pin para colocar tu ubicación.</p>
          )}

          {addressStatus === "failed" && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No encontramos la dirección exacta de este punto. Puedes confirmarla igualmente o mover el pin.
            </p>
          )}
          {locationError && !hasCoords && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No pudimos acceder a tu ubicación. Busca una dirección o elige el punto en el mapa.
            </p>
          )}

          <button
            type="button"
            onClick={confirmLocation}
            disabled={!canConfirm || busy}
            className="mt-3 box-border w-full rounded-full bg-[#eb1901] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c91602] disabled:bg-gray-300"
          >
            Confirmar ubicación
          </button>
        </div>
      </div>
    );
  }

  // ── Paso 3: ¿Cómo quieres guardar esta dirección? (etiqueta) ────────
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-gray-900">¿Cómo quieres guardar esta dirección?</p>

      {displayAddress && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#70E000]" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900">{displayAddress}</p>
            {cityLine && <p className="text-xs text-gray-500">{cityLine}</p>}
            {hasCoords && (
              <p className="mt-0.5 text-[11px] text-gray-400">
                {Number(draft!.latitude).toFixed(5)}, {Number(draft!.longitude).toFixed(5)}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {LABEL_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setLabel(option)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
              label === option
                ? "border-[#eb1901] bg-rose-50 text-[#eb1901]"
                : "border-gray-200 bg-white text-gray-700 hover:border-[#eb1901]/40"
            }`}
          >
            {LABEL_ICONS[option]}
            {option}
          </button>
        ))}
      </div>

      <div className="relative">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value.slice(0, 60))}
          maxLength={60}
          autoComplete="off"
          placeholder="Etiqueta personalizada…"
          className="box-border w-full min-w-0 max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#eb1901] focus:ring-2 focus:ring-[#eb1901]/20"
        />
      </div>

      <button
        onClick={save}
        disabled={!label.trim() || busy}
        className="box-border w-full min-w-0 max-w-full rounded-full bg-[#eb1901] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c91602] disabled:bg-gray-300"
      >
        {busy ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
          </span>
        ) : (
          submitLabel ?? (initial ? "Guardar cambios" : "Guardar dirección")
        )}
      </button>

      <button
        type="button"
        onClick={() => setStep("map")}
        className="w-full text-center text-xs font-semibold text-gray-500 transition hover:text-gray-700"
      >
        Ajustar ubicación
      </button>
    </div>
  );
}
