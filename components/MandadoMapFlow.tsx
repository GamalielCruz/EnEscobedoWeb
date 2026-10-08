"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bike,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  House,
  MessageCircle,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Pencil,
  Phone,
  Plus,
  Route,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Store,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SegmentedTabs } from "./SegmentedTabs";
import {
  calculateMandadoQuote,
  type MandadoAddressPoint,
  type MandadoMode,
  type MandadoPointQuote,
} from "@/lib/mandado";
import { useUser } from "@clerk/nextjs";
import { AddressSelector } from "./AddressSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { customerAddressToMandadoPoint } from "@/lib/address-utils";
import {
  DRIVE_ELEVATION,
  DRIVE_MOTION_DURATION,
  DRIVE_MOTION_EASE,
} from "@/components/drive/motion";

type Mode = MandadoMode;
type View = "main" | "picking";
type ConfirmStep = 1 | 2;
type AddressPoint = MandadoAddressPoint;
type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; price: number }
  | { status: "outside"; point: "origin" | "destination" | null }
  | { status: "error" };

const defaultCenter = { lat: 20.502, lng: -100.145 };

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "pickup", label: "Enviar" },
  { value: "purchase", label: "Recibir" },
];

// Pin personalizado (vector negro) para los marcadores del mapa.
// Con etiqueta: pin con número (1 = recolección, 2 = entrega).
// Sin etiqueta: pin con anillo para el punto que se está colocando.
const pinIcon = (label?: string) => {
  const inner = label
    ? `<text x="12" y="11.4" text-anchor="middle" font-size="9" font-weight="bold" fill="#ffffff" font-family="Helvetica, Arial, sans-serif">${label}</text>`
    : `<circle cx="12" cy="9" r="3.2" fill="none" stroke="#ffffff" stroke-width="1.5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#09193B" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>${inner}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

// El mapa llena exactamente su contenedor absoluto (inset-0 del overlay fijo).
// Usar 100vw/100vh fijos puede desbordarlo en móvil cuando la barra del
// navegador cambia de tamaño (la hoja del panel se traba al scrollear).
const containerStyle = {
  width: "100%",
  height: "100%",
};

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: "greedy",
  clickableIcons: false,
  styles: [
    { featureType: "landscape", elementType: "geometry.fill", stylers: [{ color: "#f3efe6" }] },
    { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#e7e2d6" }] },
    { featureType: "landscape.natural", elementType: "geometry.fill", stylers: [{ color: "#efe9db" }] },
    { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#cfc4b6" }, { weight: 1 }] },
    { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#fff1ea" }] },
    { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ color: "#e0c3b8" }, { weight: 1 }] },
    { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#ffc9c0" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#e0513d" }, { weight: 1.5 }] },
    { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#9ecdec" }] },
    { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#c9e3b6" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4d7c3a" }] },
    { featureType: "poi.place_of_worship", elementType: "geometry.fill", stylers: [{ color: "#e8dfd0" }] },
    { featureType: "poi.place_of_worship", elementType: "labels.text.fill", stylers: [{ color: "#7a6845" }] },
    { featureType: "poi.school", elementType: "geometry.fill", stylers: [{ color: "#e4e0d6" }] },
    { featureType: "poi.school", elementType: "labels.text.fill", stylers: [{ color: "#5a7a9a" }] },
    { featureType: "poi", elementType: "geometry.fill", stylers: [{ color: "#eae4d8" }] },
    { featureType: "poi.business", elementType: "labels.icon", stylers: [{ visibility: "on" }] },
    { featureType: "poi.business", elementType: "labels.text", stylers: [{ visibility: "on" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ visibility: "off" }] },
    { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#3a3a3a" }] },
    { featureType: "all", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  ],
};

const inputCls =
  "w-full border-2 border-gray-200 bg-white px-3.5 py-3 text-sm font-medium text-[#09193B] placeholder:text-gray-400 transition focus:border-[#09193B] focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500";

export default function MandadoMapFlow() {
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "mandado-map-google-maps",
    googleMapsApiKey: apiKey,
  });

  // ── Flujo principal ───────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("pickup");
  // El contenedor del selector Enviar/Recibir se compacta tras la primera
  // elección para que no tape el mapa con demasiada interfaz.
  const [modeCompact, setModeCompact] = useState(false);
  const [view, setView] = useState<View>("main");
  const [pickingFor, setPickingFor] = useState<"origin" | "destination">("origin");
  // Vista de ruta a pantalla completa (cuando ya están ambos puntos)
  const [routeOpen, setRouteOpen] = useState(false);
  // Después de elegir ambos puntos, los datos se piden en pantallas cortas.
  // Esto evita que el cliente tenga que descubrir el CTA bajando toda la hoja.
  const [confirmStep, setConfirmStep] = useState<ConfirmStep>(1);

  const [origin, setOrigin] = useState<AddressPoint | null>(null);
  const [destination, setDestination] = useState<AddressPoint | null>(null);
  const [draftAddress, setDraftAddress] = useState<AddressPoint | null>(null);

  // Libreta de direcciones compartida (Clerk privateMetadata).
  const { user, isLoaded: clerkLoaded } = useUser();
  const [addressDialogFor, setAddressDialogFor] = useState<"origin" | "destination" | null>(null);

  // Indicaciones opcionales para el repartidor (recolección y entrega).
  // Se guardan en la orden como mandadoOriginReference/mandadoDestinationReference
  // y el webhook las envía al repartidor en el mensaje posterior al ACEPTO.
  const [originReference, setOriginReference] = useState("");
  const [destinationReference, setDestinationReference] = useState("");
  // Al confirmar un punto nuevo en el mapa, opción NO obligatoria de guardarlo
  // en la libreta para reutilizarlo después.
  const [saveDraftPoint, setSaveDraftPoint] = useState(false);

  const [details, setDetails] = useState("");

  // Entrega segura (NIP): el código se envía al canal configurado (destinatario
  // o remitente) según lib/mandado-nip-channel.ts. Nunca se exige en la puerta un
  // código sin ruta de entrega (gate del PASO 1).
  const [pinEnabled, setPinEnabled] = useState(false);
  // Destinatario: nombre y teléfono. Con NIP activo definen quién recibe el envío.
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  // Declaración del usuario sobre si el destinatario usa WhatsApp (AJUSTE 2:
  // NO es una verdad verificada; define el canal del NIP).
  const [recipientWhatsAppDeclared, setRecipientWhatsAppDeclared] = useState(true);
  // Confirmación explícita del remitente de ser el canal fallback del NIP cuando
  // el destinatario no tiene WhatsApp (AJUSTE 1). Se persiste en la orden.
  const [senderFallbackAccepted, setSenderFallbackAccepted] = useState(false);
  // Flujo explícito (regla 3): el remitente recibe el código aunque no haya datos
  // del destinatario. ACTIVADO POR DEFECTO: es la ruta más simple y no exige
  // datos extra (el código llega al WhatsApp del que envía).
  const [nipToSender, setNipToSender] = useState(true);

  // Progressive disclosure de los detalles opcionales: cada bloque se expande
  // solo cuando el usuario lo pide. Los datos escritos NO se borran al colapsar
  // (se conservan durante la sesión).
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [notifyActive, setNotifyActive] = useState(false);

  // Cotización
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [quoteNonce, setQuoteNonce] = useState(0);

  // Mapa / búsqueda
  const [searchInput, setSearchInput] = useState("");
  const [predictions, setPredictions] = useState<AddressPoint[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(14);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [locationDetected, setLocationDetected] = useState(false);
  const [pinHint, setPinHint] = useState(false);
  const pinHintTimer = useRef<number | null>(null);
  const suppressPinHint = useRef(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  const mounted = useRef(true);
  const skipPrediction = useRef(false);
  const fittedRouteKey = useRef<string | null>(null);
  const routeLineRef = useRef<google.maps.Polyline | null>(null);
  const dotOffsetRef = useRef(0);

  // Centra y aplica zoom al mapa usando la instancia viva (panTo/setZoom),
  // porque las props center/zoom de <GoogleMap> solo se aplican al montarse.
  // Sin esto, al editar un punto el pin quedaba fuera de pantalla y el zoom
  // lejano del paso 2 nunca se ejecutaba.
  const panMap = useCallback((position: google.maps.LatLngLiteral, zoom: number) => {
    setMapCenter(position);
    setMapZoom(zoom);
    mapRef.current?.panTo(position);
    mapRef.current?.setZoom(zoom);
  }, []);

  const isPickup = mode === "pickup";
  const originTitle = isPickup ? "¿Dónde recogemos?" : "¿Dónde compramos?";
  const originCardTitle = isPickup ? "Recolección" : "Compra";
  const originPlaceholder = isPickup ? "Elegir punto de recolección" : "Elegir tienda o punto de compra";
  const detailsPlaceholder = isPickup
    ? "Ej. Medicamentos, documentos, comida, paquete."
    : "Ej. 2 litros de leche, pan integral y 1 kg de manzanas…";

  // Progreso del flujo: el panel se adapta solo, sin flechas manuales.
  // 1) eligiendo recolección → panel pequeño con el paso 1
  // 2) eligiendo entrega → panel pequeño con el origen resumido + paso 2
  // 3) ambos listos → pantalla completa para revisar y confirmar
  const progress: "step1" | "step2" | "confirm" =
    !origin ? "step1" : !destination ? "step2" : "confirm";

  useEffect(() => () => {
    mounted.current = false;
    if (pinHintTimer.current) window.clearTimeout(pinHintTimer.current);
  }, []);

  // ── Cotización (se dispara al cambiar los puntos) ─────────────────
  useEffect(() => {
    if (!origin || !destination) {
      setQuote({ status: "idle" });
      return;
    }
    let cancelled = false;
    setQuote({ status: "loading" });

    const getQuote = (point: AddressPoint) =>
      fetch("/api/delivery-pricing/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: point.lat, lng: point.lng }),
      }).then(async (response) => {
        if (!response.ok) throw new Error("quote");
        const data = await response.json();
        return data.quote as MandadoPointQuote;
      });

    Promise.all([getQuote(origin), getQuote(destination)])
      .then(([originQuote, destinationQuote]) => {
        if (cancelled) return;
        const result = calculateMandadoQuote(originQuote, destinationQuote);
        if (result.allowed && result.finalPrice != null) {
          setQuote({ status: "ready", price: result.finalPrice });
        } else {
          setQuote({ status: "outside", point: result.outsidePoint });
        }
      })
      .catch(() => {
        if (!cancelled) setQuote({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [origin, destination, quoteNonce]);

  // ── Ajustar la vista del mapa a la ruta completa en la vista principal ──
  useEffect(() => {
    if (view !== "main" || !origin || !destination || !mapRef.current) return;
    const key = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}|${routeOpen ? "route" : "panel"}`;
    if (fittedRouteKey.current === key) return;
    fittedRouteKey.current = key;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(origin);
    bounds.extend(destination);
    const height = window.innerHeight || 0;
    // El padding de fitBounds se mide desde los bordes del mapa. Con el panel
    // de direcciones abierto (68svh) la ruta debe quedar centrada en la franja
    // libre de arriba, así que el padding inferior equivale a la altura del
    // panel (+ margen para el pin). Con la vista de ruta ocupa el mapa entero.
    mapRef.current.fitBounds(
      bounds,
      routeOpen
        ? { top: 84, bottom: 130, left: 48, right: 48 }
        : { top: 84, bottom: height * 0.68 + 56, left: 48, right: 48 }
    );
    // isLoaded en deps: si el mapa termina de cargar después de tener ambos
    // puntos (red lenta), el encuadre se recalcula al montarse.
  }, [view, origin, destination, isLoaded, routeOpen]);

  // ── Al salir de la pantalla de confirmación o al editar un punto,
  //    la vista de ruta vuelve al contenedor de direcciones. ──
  useEffect(() => {
    if (view !== "main" || progress !== "confirm" || confirmStep !== 2) setRouteOpen(false);
  }, [view, progress, confirmStep]);

  // ── Puntitos animados sobre la ruta (misma animación que en el carrito) ──
  useEffect(() => {
    if (!routeOpen || !origin || !destination) return;
    const timer = window.setInterval(() => {
      const line = routeLineRef.current;
      if (!line) return;
      dotOffsetRef.current = (dotOffsetRef.current + 1) % 100;
      const icons = line.get("icons");
      if (icons?.[0]) {
        icons[0].offset = `${dotOffsetRef.current}%`;
        line.set("icons", icons);
      }
    }, 45);
    return () => window.clearInterval(timer);
  }, [routeOpen, origin, destination]);

  // ── Autocompletado de búsqueda ────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || searchInput.trim().length < 3 || skipPrediction.current) {
      skipPrediction.current = false;
      setPredictions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(searchInput)}`, { signal: controller.signal });
        setPredictions(response.ok ? await response.json() : []);
      } catch {
        if (!controller.signal.aborted) setPredictions([]);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchInput, isLoaded]);

  const choosePoint = useCallback((position: google.maps.LatLngLiteral, address?: string) => {
    setIsGeocoding(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    const fallback = address || "";
    const next = { label: fallback, ...position };
    setDraftAddress(next);
    setSearchInput(fallback || "Buscando dirección...");
    setPredictions([]);
    panMap(position, 16);

    new google.maps.Geocoder().geocode({ location: position }, (results, status) => {
      if (!mounted.current) return;
      setIsGeocoding(false);
      const resolved = status === "OK" ? results?.[0]?.formatted_address : null;
      if (!resolved) {
        if (!fallback) setSearchInput("Dirección no encontrada");
        return;
      }
      skipPrediction.current = true;
      setDraftAddress({ ...next, label: resolved });
      setSearchInput(resolved);
    });
  }, []);

  const choosePrediction = useCallback((prediction: AddressPoint) => {
    choosePoint(prediction, prediction.label);
  }, [choosePoint]);

  const movePoint = useCallback((position: google.maps.LatLngLiteral, target: "draft" | "origin" | "destination") => {
    setIsGeocoding(true);
    const fallback =
      target === "draft" ? draftAddress?.label || ""
        : target === "origin" ? origin?.label || ""
          : destination?.label || "";
    const next = { label: fallback, ...position };

    if (target === "draft") {
      setDraftAddress(next);
      setSearchInput("Buscando dirección...");
    } else if (target === "origin") {
      setOrigin(next);
    } else {
      setDestination(next);
    }

    new google.maps.Geocoder().geocode({ location: position }, (results, status) => {
      if (!mounted.current) return;
      setIsGeocoding(false);
      const resolved = status === "OK" ? results?.[0]?.formatted_address : null;
      if (!resolved) {
        if (target === "draft") setSearchInput(fallback || "Dirección no encontrada");
        return;
      }
      const resolvedPoint = { ...next, label: resolved };
      if (target === "draft") {
        skipPrediction.current = true;
        setDraftAddress(resolvedPoint);
        setSearchInput(resolved);
      } else if (target === "origin") {
        setOrigin(resolvedPoint);
      } else {
        setDestination(resolvedPoint);
      }
    });
  }, [draftAddress, origin, destination]);

  const searchAddress = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isLoaded || !searchInput.trim()) return;
    setSearching(true);
    new google.maps.Geocoder().geocode({ address: searchInput, region: "mx" }, (results, status) => {
      if (!mounted.current) return;
      setSearching(false);
      const result = status === "OK" ? results?.[0] : null;
      const location = result?.geometry.location;
      if (!location) return;
      choosePoint({ lat: location.lat(), lng: location.lng() }, result.formatted_address);
    });
  }, [isLoaded, searchInput, choosePoint]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        setLocationDetected(true);
        choosePoint({ lat: coords.latitude, lng: coords.longitude });
      },
      () => {
        setLocating(false);
        setLocationDetected(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [choosePoint]);

  // ── Navegación del flujo ──────────────────────────────────────────
  const startPicking = useCallback((target: "origin" | "destination") => {
    setPickingFor(target);
    setView("picking");
    setDraftAddress(null);
    setSearchInput("");
    setPredictions([]);
    setLocationDetected(false);
    setSaveDraftPoint(false);
    const point = target === "origin" ? origin : destination;
    if (point) {
      // Al editar un punto ya elegido, el pin se mantiene visible y la vista
      // se centra en él (no hay que volver a buscarlo en el mapa).
      setDraftAddress(point);
      setSearchInput(point.label);
      skipPrediction.current = true; // evita disparar el autocompletado con la etiqueta
      panMap(point, 16);
    } else if (target === "destination" && origin) {
      // Vista lejana centrada al norte del origen (primer marcador 2): deja
      // claro que el marcador 1 ya quedó colocado y ahora toca el marcador 2.
      panMap({ lat: origin.lat + 0.006, lng: origin.lng }, 13);
    } else {
      panMap(defaultCenter, 14);
    }
  }, [origin, destination, panMap]);

  const cancelPicking = useCallback(() => {
    setView("main");
    setDraftAddress(null);
    setSearchInput("");
    setPredictions([]);
    setSaveDraftPoint(false);
  }, []);

  // ── Usar una dirección guardada de la libreta compartida ──
  // Se convierte al snapshot de Mandado (label + lat + lng) y se congela en la
  // orden. Si la dirección guardada no tiene coordenadas, se abre el mapa para
  // ubicar el punto exacto.
  const applySavedAddress = useCallback(
    (address: Parameters<typeof customerAddressToMandadoPoint>[0], target: "origin" | "destination") => {
      setAddressDialogFor(null);
      const point = customerAddressToMandadoPoint(address);
      if (point) {
        if (target === "origin") {
          setOrigin(point);
        } else {
          setDestination(point);
          setConfirmStep(1);
        }
        fittedRouteKey.current = null;
        setModeCompact(true);
      } else {
        // Sin coordenadas guardadas: pedir confirmación del punto en el mapa.
        startPicking(target);
        if (address.formattedAddress) {
          setSearchInput(address.formattedAddress);
        }
      }
    },
    [startPicking]
  );

  // Guardar el punto nuevo del mapa en la libreta (opcional, NO obligatorio).
  // Reutiliza POST /api/user/addresses; si falla no bloquea el mandado.
  const saveDraftToAddressBook = useCallback(async (point: AddressPoint) => {
    if (!user?.id) return;
    const payload = {
      label: point.label || "Dirección",
      formattedAddress: point.label,
      street: point.label,
      city: "",
      state: "",
      postalCode: "",
      country: "México",
      latitude: point.lat,
      longitude: point.lng,
    };
    try {
      await fetch("/api/user/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: payload }),
      });
    } catch {
      // El mandado continúa aunque no se pueda guardar la dirección.
    }
  }, [user?.id]);

  const confirmPick = useCallback(() => {
    if (!draftAddress) return;
    const point = draftAddress;
    const shouldSave = saveDraftPoint && !point.label.startsWith("Buscando dirección");
    if (shouldSave) void saveDraftToAddressBook(point);
    if (pickingFor === "origin") {
      setOrigin(point);
      // Solo al colocar el origen por primera vez (sin destino aún) se aleja
      // la vista para que el cliente note que sigue el marcador 2. Al re-editar
      // el origen el mapa no se mueve para no confundir.
      if (!destination && !origin) {
        panMap({ lat: point.lat + 0.006, lng: point.lng }, 13);
      }
    } else {
      setDestination(point);
      setConfirmStep(1);
    }
    fittedRouteKey.current = null; // recalcula el encuadre al volver
    setModeCompact(true);
    setDraftAddress(null);
    setSearchInput("");
    setLocationDetected(false);
    setSaveDraftPoint(false);
    setView("main");
  }, [draftAddress, pickingFor, origin, destination, panMap, saveDraftPoint, saveDraftToAddressBook]);

  const selectMode = useCallback((nextMode: Mode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setModeCompact(true);
    // Los puntos ya elegidos siguen siendo válidos; solo cambian las etiquetas.
    if (origin || destination) fittedRouteKey.current = null;
  }, [mode, origin, destination]);



  // ── Validación y CTA ──────────────────────────────────────────────
  // Sin Entrega segura el teléfono del destinatario es opcional (solo notifica).
  // Con Entrega segura (PASO 3) debe existir un canal WhatsApp para el NIP:
  //  - canal destinatario → nombre + teléfono (10 dígitos) del destinatario;
  //  - canal remitente (explícito, nipToSender) → el teléfono del remitente se
  //    valida en el checkout (aquí solo se confirma la elección).
  const recipientPhoneDigits = recipientPhone.replace(/\D/g, "");
  const recipientIdentified = recipientName.trim().length > 0 && recipientPhoneDigits.length === 10;
  // Canal del NIP calculado IGUAL que el servidor (lib/mandado-nip-channel.ts):
  //  - destinatario identificado + WhatsApp declarado → destinatario (regla 1);
  //  - destinatario sin WhatsApp + confirmación explícita, o flujo "recibir el
  //    código yo" → remitente (reglas 2/3);
  //  - sin canal → null (no se puede confirmar con NIP).
  const nipChannel =
    !pinEnabled
      ? null
      : recipientIdentified && recipientWhatsAppDeclared
        ? "recipient"
        : nipToSender || (recipientIdentified && !recipientWhatsAppDeclared && senderFallbackAccepted)
          ? "sender"
          : null;
  const canConfirm =
    Boolean(origin && destination && details.trim() && quote.status === "ready") &&
    (nipChannel !== null || !pinEnabled);

  // Campos compartidos del destinatario: se pintan UNA sola vez, dentro del
  // bloque opcional que los necesita (Proteger la entrega o Avisar).
  const recipientFieldsNode = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelCls} htmlFor="recipient-name">Nombre</label>
        <input
          id="recipient-name"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value.slice(0, 60))}
          placeholder="Ej. María Fernández"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="recipient-phone">Número telefónico</label>
        <div className="flex items-center gap-2 border-2 border-gray-200 bg-white px-3 py-3 transition focus-within:border-[#09193B]">
          <span className="whitespace-nowrap text-sm font-semibold text-gray-600">+52</span>
          <div className="h-4 w-px bg-gray-300" />
          <input
            id="recipient-phone"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            maxLength={10}
            placeholder="4421234567"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#09193B] placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        {recipientPhoneDigits.length > 0 && recipientPhoneDigits.length < 10 && (
          <p className="mt-1.5 text-xs font-medium text-[#eb1901]">Ingresa los 10 dígitos del teléfono.</p>
        )}
      </div>
    </div>
  );

  // Controles del canal del NIP: viven dentro del bloque "Proteger la entrega".
  // ORDEN SIMPLE: primero la opción por defecto ("Recibir el código yo"), y
  // solo si se desactiva aparece la decisión del WhatsApp del destinatario.
  const nipControlsNode = (
    <div className="space-y-3">
      {/* Opción por DEFECTO: el remitente recibe el código. */}
      <div className="flex items-center justify-between gap-3 border-2 border-gray-200 px-3.5 py-3">
        <div>
          <p className="text-xs font-black text-[#09193B]">Recibir el código yo (remitente)</p>
          <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
            {nipToSender
              ? "El código llega a tu WhatsApp y tú se lo das al repartidor."
              : "El código se enviará al destinatario."}
          </p>
        </div>
        <ModernSwitch checked={nipToSender} onChange={setNipToSender} label="Recibir el código yo" />
      </div>

      {/* Solo al desactivar "Recibir el código yo" se decide el WhatsApp del destinatario. */}
      {!nipToSender && (
        <div className="flex items-center justify-between gap-3 border border-gray-200 bg-gray-50 px-3.5 py-3">
          <div>
            <p className="text-xs font-black text-gray-500">¿El destinatario tiene WhatsApp?</p>
            <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
              {recipientWhatsAppDeclared
                ? "El código se enviará a su WhatsApp."
                : "Sin WhatsApp. Te lo enviaremos a ti."}
            </p>
          </div>
          <ModernSwitch checked={recipientWhatsAppDeclared} onChange={setRecipientWhatsAppDeclared} label="El destinatario tiene WhatsApp" />
        </div>
      )}

      {/* Fallback al remitente: una sola confirmación, sin explicaciones largas. */}
      {!nipToSender && recipientIdentified && !recipientWhatsAppDeclared && (
        <label className="flex items-start gap-3 border-2 border-gray-200 px-3.5 py-3">
          <input
            type="checkbox"
            checked={senderFallbackAccepted}
            onChange={(e) => setSenderFallbackAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#eb1902]"
          />
          <span className="text-[11px] leading-4 text-gray-600">
            <strong className="text-[#09193B]">Yo daré el código al destinatario.</strong>
          </span>
        </label>
      )}

      {/* Aviso corto SOLO si falta algo para poder entregar el código. */}
      {nipChannel === null && (
        <p className="bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {recipientIdentified
            ? "Confirma que tú darás el código, o activa «Recibir el código yo»."
            : "Completa el destinatario o activa «Recibir el código yo»."}
        </p>
      )}
    </div>
  );

  const goToCheckout = useCallback(() => {
    if (!canConfirm || quote.status !== "ready" || !origin || !destination) return;
    const draft = {
      mode,
      origin,
      destination,
      details: details.trim(),
      price: quote.price,
      // Indicaciones opcionales para el repartidor: llegan a la orden como
      // mandadoOriginReference/mandadoDestinationReference y el webhook las
      // envía al repartidor tras el ACEPTO.
      originReference: originReference.trim() || undefined,
      destinationReference: destinationReference.trim() || undefined,
      pinEnabled,
      recipientName: recipientName.trim() || undefined,
      recipientPhone: recipientPhoneDigits,
      // PASO 3 + AJUSTE 1/2: declaración y canal del NIP (el servidor decide
      // igualmente con lib/mandado-nip-channel.ts; esto refleja la elección del
      // usuario y persiste la confirmación explícita del fallback).
      recipientWhatsAppDeclared,
      senderNipFallbackAccepted: nipChannel === "sender" ? true : false,
      nipRecipient: nipChannel === "sender" ? "sender" : "recipient",
    };
    try {
      sessionStorage.setItem("mandadoCheckoutDraft", JSON.stringify(draft));
    } catch {
      return;
    }
    router.push("/mandado/basket");
  }, [
    canConfirm, quote, mode, origin, destination, details, originReference, destinationReference,
    pinEnabled, recipientName, recipientPhoneDigits, recipientWhatsAppDeclared,
    senderFallbackAccepted, nipChannel, nipToSender, router,
  ]);

  const ctaLabel =
    quote.status === "ready"
      ? `Confirmar Mandado  •  $${quote.price.toFixed(2)}`
      : quote.status === "loading"
        ? "Calculando tu mandado…"
        : quote.status === "outside"
          ? "Fuera de nuestra zona"
          : quote.status === "error"
            ? "No pudimos calcular el costo"
            : "Completa los datos de tu mandado";

  const canContinueConfirmStep =
    confirmStep === 1
      ? Boolean(details.trim()) && (!pinEnabled || nipChannel !== null)
      : canConfirm;

  const confirmStepLabel =
    confirmStep === 1
      ? "Detalles del envío"
      : "Revisa tu mandado";

  const continueConfirm = () => {
    if (!canContinueConfirmStep) return;
    if (confirmStep < 2) setConfirmStep((step) => (step + 1) as ConfirmStep);
    else goToCheckout();
  };

  // Opciones dinámicas del mapa: cuando el panel de confirmación está abierto
  // se bloquea el arrastre y el zoom para que el mapa no se mueva (haga scroll)
  // mientras el cliente completa cada pantalla. La vista de ruta vuelve a ser
  // interactiva.
  const mapOptionsDynamic = useMemo(() => {
    const lockMap = view === "main" && progress === "confirm" && !routeOpen;
    return {
      ...mapOptions,
      draggable: !lockMap,
      scrollwheel: !lockMap,
      disableDoubleClickZoom: lockMap,
      gestureHandling: view === "picking" ? "greedy" : lockMap ? "cooperative" : "greedy",
    };
  }, [view, progress, routeOpen]);

  if (loadError || !apiKey) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="border-2 border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">No pudimos cargar el mapa. Intenta de nuevo en unos minutos.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-gray-100">
      {/* ── Mapa de fondo (siempre fijo) ── */}
      <div className="absolute inset-0 z-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={mapCenter}
            zoom={mapZoom}
            onLoad={(map) => {
              mapRef.current = map;
            }}
            onClick={(event) => {
              if (view === "picking") {
                const lat = event.latLng?.lat();
                const lng = event.latLng?.lng();
                if (lat != null && lng != null) choosePoint({ lat, lng });
              } else if (view === "main" && progress === "confirm" && confirmStep === 2 && origin && destination) {
                // Al tocar el mapa se alterna entre ver la ruta y volver a las direcciones
                setRouteOpen((open) => !open);
              }
            }}
            options={mapOptionsDynamic}
          >
            {origin && (
              <Marker
                position={origin}
                // Durante la elección de un punto, los marcadores ya colocados
                // no se pueden arrastrar para evitar confusiones (ej. arrastrar
                // el marcador 1 mientras se coloca el 2). En la vista de ruta
                // tampoco, para que la animación no se interrumpa.
                draggable={view !== "picking" && !routeOpen}
                zIndex={10}
                onDragStart={() => {
                  suppressPinHint.current = true;
                }}
                onClick={() => {
                  if (suppressPinHint.current) {
                    suppressPinHint.current = false;
                    return;
                  }
                  if (view === "picking" && pickingFor === "destination") {
                    setPinHint(true);
                    if (pinHintTimer.current) window.clearTimeout(pinHintTimer.current);
                    pinHintTimer.current = window.setTimeout(() => setPinHint(false), 2600);
                  }
                }}
                onDragEnd={(event) => {
                  const lat = event.latLng?.lat();
                  const lng = event.latLng?.lng();
                  if (lat != null && lng != null) movePoint({ lat, lng }, "origin");
                }}
                icon={{ url: pinIcon("1"), scaledSize: new google.maps.Size(42, 42), anchor: new google.maps.Point(21, 42) }}
              />
            )}
            {destination && (
              <Marker
                position={destination}
                draggable={view !== "picking" && !routeOpen}
                zIndex={10}
                onDragEnd={(event) => {
                  const lat = event.latLng?.lat();
                  const lng = event.latLng?.lng();
                  if (lat != null && lng != null) movePoint({ lat, lng }, "destination");
                }}
                icon={{ url: pinIcon("2"), scaledSize: new google.maps.Size(42, 42), anchor: new google.maps.Point(21, 42) }}
              />
            )}
            {draftAddress && view === "picking" && (
              <Marker
                position={draftAddress}
                draggable
                zIndex={20}
                onDragEnd={(event) => {
                  const lat = event.latLng?.lat();
                  const lng = event.latLng?.lng();
                  if (lat != null && lng != null) movePoint({ lat, lng }, "draft");
                }}
                icon={{ url: pinIcon(), scaledSize: new google.maps.Size(42, 42), anchor: new google.maps.Point(21, 42) }}
              />
            )}
            {origin && destination && view === "main" && (
              <>
                <Polyline
                  path={[
                    { lat: origin.lat, lng: origin.lng },
                    { lat: destination.lat, lng: destination.lng },
                  ]}
                  options={{
                    strokeColor: "#EB1901",
                    strokeOpacity: 0.95,
                    strokeWeight: 4,
                    geodesic: true,
                  }}
                />
                {routeOpen && (
                  <Polyline
                    onLoad={(line) => {
                      routeLineRef.current = line;
                    }}
                    onUnmount={() => {
                      routeLineRef.current = null;
                    }}
                    path={[
                      { lat: origin.lat, lng: origin.lng },
                      { lat: destination.lat, lng: destination.lng },
                    ]}
                    options={{
                      strokeOpacity: 0,
                      geodesic: true,
                      icons: [
                        {
                          icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 3.5,
                            fillColor: "#ffffff",
                            fillOpacity: 1,
                            strokeColor: "#EB1901",
                            strokeWeight: 1.5,
                          },
                          offset: `${dotOffsetRef.current}%`,
                          repeat: "16px",
                        },
                      ],
                    }}
                  />
                )}
              </>
            )}
          </GoogleMap>
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="animate-spin" /> Cargando mapa…
          </div>
        )}

        {/* Guía flotante mientras se elige un punto */}
        {view === "picking" && !draftAddress && (
          <div className="pointer-events-none absolute bottom-64 left-1/2 z-10 -translate-x-1/2">
            <div className="flex items-center gap-2 whitespace-nowrap border-2 border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
              <MapPin className="h-4 w-4 text-[#eb1901]" /> Toca el mapa o arrastra el pin
            </div>
          </div>
        )}

        {pinHint && view === "picking" && pickingFor === "destination" && (
          <div className="pointer-events-none absolute left-1/2 top-[42%] z-30 -translate-x-1/2 -translate-y-1/2">
            <div className="animate-pulse bg-[#09193B] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_28px_rgba(0,0,0,0.35)]">
              Este es el punto de recogida. Toca el mapa para elegir la entrega
            </div>
          </div>
        )}

        {view === "main" && progress === "confirm" && confirmStep === 2 && routeOpen && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2">
            <div className="flex items-center gap-2 whitespace-nowrap bg-[#09193B] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_28px_rgba(0,0,0,0.35)]">
              {isPickup ? <Bike className="h-4 w-4" /> : <ShoppingBasket className="h-4 w-4" />}
              <span className="flex items-center gap-1.5">
                {isPickup ? "Enviando tu mandado" : "Comprando por ti"}
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d4e400] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#d4e400]" />
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Botón flotante: salir en la pantalla de confirmación */}
      {view === "main" && progress === "confirm" && !routeOpen && (
        <button
          onClick={() => router.push("/")}
          className="absolute left-4 top-4 z-40 flex h-11 w-11 items-center justify-center border-2 border-gray-200 bg-white text-[#09193B] shadow-[0_8px_28px_rgba(0,0,0,0.18)] transition active:bg-gray-50"
          aria-label="Salir de mandados"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}

      {/* Botón flotante: cerrar la vista de ruta */}
      {view === "main" && progress === "confirm" && confirmStep === 2 && routeOpen && (
        <button
          onClick={() => setRouteOpen(false)}
          className="absolute left-4 top-4 z-50 flex h-11 w-11 items-center justify-center border-2 border-gray-200 bg-white text-[#09193B] shadow-[0_8px_28px_rgba(0,0,0,0.18)] transition active:bg-gray-50"
          aria-label="Volver a las direcciones"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Diálogo: elegir una dirección guardada de la libreta compartida */}
      {clerkLoaded && user && (
        <Dialog
          open={addressDialogFor !== null}
          onOpenChange={(open) => {
            if (!open) setAddressDialogFor(null);
          }}
        >
          <DialogContent className="w-[calc(100vw-1.5rem)] max-w-xl overflow-hidden p-0">
            <DialogHeader className="border-b px-5 py-4">
              <DialogTitle>
                {addressDialogFor === "origin"
                  ? isPickup
                    ? "¿Dónde recogemos?"
                    : "¿Dónde compramos?"
                  : "¿A dónde lo entregamos?"}
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[calc(85vh-6rem)] overflow-y-auto px-4 pb-5 pt-4 sm:px-5">
              <AddressSelector
                userId={user.id}
                onSelect={(address) => {
                  if (addressDialogFor) applySavedAddress(address, addressDialogFor);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ═══════════ VISTA: ELECCIÓN DE PUNTO EN EL MAPA ═══════════ */}
      <AnimatePresence>
        {view === "picking" && (
          <>
            {/* Tarjeta superior de búsqueda */}
            <motion.div
              key="picking-top"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute left-4 right-4 top-4 z-40 sm:left-8 sm:right-8"
            >
              <div className="overflow-visible border-2 border-gray-200 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                <div className="flex items-center gap-3 px-3 pb-1 pt-2">
                  <button
                    onClick={cancelPicking}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-[#09193B] transition active:bg-gray-100"
                    aria-label="Volver"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#eb1901]">
                      {pickingFor === "origin" ? "Punto de inicio" : "Punto de entrega"}
                    </p>
                    <p className="truncate text-sm font-semibold leading-tight text-[#09193B]">
                      {pickingFor === "origin" ? originTitle : "¿A dónde lo entregamos?"}
                    </p>
                  </div>
                </div>

                {pickingFor === "destination" && origin && (
                  <div className="mx-3 mb-2 flex items-center gap-2 border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center bg-[#09193B]">
                      <CheckCircle className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#09193B]">
                        {mode === "purchase" ? "Tienda confirmada" : "Origen confirmado"}
                      </p>
                      <p className="truncate text-xs text-gray-500">{origin.label}</p>
                    </div>
                  </div>
                )}

                <div className="relative px-3 pb-3">
                  <form onSubmit={searchAddress} className="relative">
                    <MapPin className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={searchInput}
                      onChange={(e) => {
                        skipPrediction.current = false;
                        setSearchInput(e.target.value);
                      }}
                      placeholder="Buscar dirección..."
                      autoComplete="off"
                      className="h-10 pl-9 pr-12 text-sm"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={searching || !searchInput.trim()}
                      className="absolute right-1 top-1 h-8 w-8 bg-[#09193B] hover:bg-[#162d5c]"
                    >
                      {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    </Button>
                  </form>

                  {predictions.length > 0 && (
                    <div className="absolute left-3 right-3 top-full z-50 mt-1 overflow-hidden border-2 border-gray-200 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                      {predictions.slice(0, 5).map((prediction) => (
                        <button
                          key={`${prediction.lat}-${prediction.lng}`}
                          type="button"
                          onClick={() => choosePrediction(prediction)}
                          className="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left text-sm last:border-0 hover:bg-rose-50"
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#eb1901]" />
                          <span className="flex-1">{prediction.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={useMyLocation}
                    disabled={locating}
                    className="mt-2 h-9 w-full border-2 border-gray-200 text-sm font-bold text-[#09193B] hover:bg-gray-50"
                  >
                    {locating ? (
                      <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Detectando ubicación...</>
                    ) : locationDetected ? (
                      <><CheckCircle className="mr-2 h-3.5 w-3.5" /> Ubicación actual detectada</>
                    ) : (
                      <><Navigation className="mr-2 h-3.5 w-3.5" /> Usar mi ubicación</>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>

            {/* Panel inferior de confirmación */}
            <motion.div
              key="picking-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: DRIVE_MOTION_DURATION.standard, ease: DRIVE_MOTION_EASE.enter }}
              className="absolute bottom-0 left-0 right-0 z-40"
            >
              <div className={`${DRIVE_ELEVATION.sheet} flex flex-col border-t border-black/[0.06] bg-white`}>
                <div className="flex justify-center pb-2 pt-4">
                  <span className="h-1 w-10 bg-gray-300" aria-hidden />
                </div>

                <div className="px-6 pb-6">
                  {draftAddress ? (
                    <div className="mb-4 text-center">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        {pickingFor === "origin" ? "Punto de recolección" : "Punto de entrega"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#09193B]">{draftAddress.label}</p>
                    </div>
                  ) : (
                    <p className="mb-4 text-center text-sm text-gray-500">
                      Toca el mapa, busca una dirección o arrastra el pin
                    </p>
                  )}

                  {isGeocoding && (
                    <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Obteniendo dirección…
                    </p>
                  )}

                  {draftAddress && user && (
                    <button
                      type="button"
                      onClick={() => setSaveDraftPoint((value) => !value)}
                      className={`mb-2 flex w-full items-center gap-2.5 border-2 px-3.5 py-2.5 text-left text-xs transition ${
                        saveDraftPoint
                          ? "border-[#eb1902] bg-[#eb1902]/[0.05] text-[#09193B]"
                          : "border-gray-200 bg-white text-gray-600"
                      }`}
                    >
                      <span
                        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center border ${
                          saveDraftPoint ? "border-[#eb1902] bg-[#eb1902]" : "border-gray-300 bg-white"
                        }`}
                      >
                        {saveDraftPoint && <CheckCircle className="h-3 w-3 text-white" />}
                      </span>
                      <span className="flex-1">
                        <strong>Guardar esta dirección</strong>{" "}
                        <span className="text-gray-400">(opcional)</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-gray-500">
                          La guardamos en tu libreta para usarla después. Si no, solo se usará para este mandado.
                        </span>
                      </span>
                    </button>
                  )}

                  <Button
                    onClick={confirmPick}
                    disabled={!draftAddress}
                    className={`w-full py-3.5 text-base font-black uppercase tracking-wide transition-all active:scale-[0.99] ${
                      draftAddress
                        ? "bg-[#eb1902] text-white hover:bg-[#c11300]"
                        : "cursor-not-allowed bg-gray-200 text-gray-500"
                    }`}
                  >
                    {draftAddress ? (
                      <>Continuar <ChevronRight className="ml-2 h-5 w-5" /></>
                    ) : pickingFor === "origin" ? (
                      "Elige el punto de recolección"
                    ) : (
                      "Elige el punto de entrega"
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════ VISTA PRINCIPAL: TARJETAS SOBRE EL MAPA ═══════════ */}
      <AnimatePresence>
        {view === "main" && !(progress === "confirm" && routeOpen) && (
          <>
            {/* Control superior: atrás + selector Enviar/Recibir.
                Tras la primera elección se compacta para no tapar el mapa;
                el selector compacto sigue permitiendo cambiar de Enviar a
                Recibir y viceversa. En la confirmación se oculta para dejar
                más espacio al mapa. */}
            {progress !== "confirm" && (
            <motion.div
              key="main-top"
              initial={{ y: -24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -24, opacity: 0 }}
              transition={{ duration: 0.28 }}
              className="absolute left-4 right-4 top-4 z-40 mx-auto w-auto sm:left-8 sm:right-8"
            >
              <div className="mx-auto w-full max-w-md">
                {modeCompact ? (
                  <div className="flex items-center gap-2 border-2 border-gray-200 bg-white p-2 shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                    <button
                      onClick={() => router.push("/")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-[#09193B] transition active:bg-gray-100"
                      aria-label="Salir de mandados"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <SegmentedTabs value={mode} onChange={selectMode} options={MODE_OPTIONS} compact layoutId="mode-pill" />
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-gray-200 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                    <div className="flex items-center gap-3 px-3 pt-3">
                      <button
                        onClick={() => router.push("/")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center text-[#09193B] transition active:bg-gray-100"
                        aria-label="Salir de mandados"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="truncate text-sm font-semibold text-[#09193B]">¿Qué necesitas hoy?</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-3 pb-3 pt-2.5">
                      <SegmentedTabs value={mode} onChange={selectMode} options={MODE_OPTIONS} layoutId="mode-pill" />
                      <p className="mt-2 text-center text-xs leading-4 text-gray-500">
                        {isPickup
                          ? "Pasamos por un artículo y lo entregamos donde indiques."
                          : "Compramos por ti y te lo llevamos. El costo de los productos se paga por separado."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
            )}

            {/* Panel de tarjetas + CTA fijo */}
            <motion.div
              key="main-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: DRIVE_MOTION_DURATION.standard, ease: DRIVE_MOTION_EASE.enter }}
              className="absolute inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md"
            >
              <div className={`${DRIVE_ELEVATION.sheet} flex flex-col overflow-hidden border-t border-black/[0.06] bg-white`}>
                {/* Altura inteligente según el progreso del flujo (sin flechas).
                    Se usa svh (viewport mínimo estable) en lugar de dvh: en móvil,
                    cuando la barra del navegador se oculta, dvh cambia y la
                    transición de altura anima el panel durante el scroll (se traba).
                    Con svh la altura es estable y la transición solo anima al
                    cambiar de paso. */}
                <div className={`transition-[height] duration-500 ease-in-out ${progress === "confirm" ? "h-[68svh]" : progress === "step2" ? "h-[44svh]" : "h-[38svh]"}`}>
                  <div className="flex h-full flex-col">
                    <div className="flex justify-center pb-1 pt-3">
                      <span className="h-1 w-10 bg-gray-300" aria-hidden />
                    </div>

                    {/* Acceso a la vista de ruta a pantalla completa */}
                    {progress === "confirm" && confirmStep === 2 && (
                      <div className="shrink-0 px-4 pb-2">
                        <button
                          onClick={() => setRouteOpen(true)}
                          className="flex w-full items-center justify-center gap-2 border-2 border-gray-200 bg-white py-2.5 text-sm font-black text-[#09193B] transition active:bg-gray-50"
                        >
                          <Route className="h-4 w-4 text-[#eb1901]" /> Ver ruta en el mapa
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    )}

                    {/* ── Tarjetas según el paso (fade al cambiar de paso) ── */}
                    {/* touch-pan-y: en iOS/Android el gesto vertical se atribuye
                        explícitamente a este contenedor (scroll del panel) y no se
                        traba ni lo toma el mapa de fondo. */}
                    <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
                      <motion.div
                        key={progress}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="space-y-3"
                      >
                      {progress !== "confirm" ? (
                        <p className="text-center text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          {progress === "step1"
                            ? isPickup
                              ? "Elige dónde recogemos"
                              : "Elige dónde compramos"
                            : "¿A dónde lo entregamos?"}
                        </p>
                      ) : (
                        <p className="text-center text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          {confirmStepLabel}
                        </p>
                      )}

                      {/* En el paso 2, el origen ya elegido se muestra compacto */}
                      {progress === "step2" && (
                        <AddressSummaryRow
                          label={isPickup ? "Recolección" : "Compra"}
                          icon={Store}
                          point={origin!}
                          onEdit={() => startPicking("origin")}
                        />
                      )}

                      {/* 1. Recolección (solo se elige en el mapa durante el paso 1) */}
                      {progress === "step1" && (
                      <Card>
                        <div className="mb-2 flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center bg-gray-100">
                            <Store className="h-4 w-4 text-[#09193B]" />
                          </div>
                          <h3 className="text-sm font-bold text-[#09193B]">{originCardTitle}</h3>
                        </div>
                        <button
                          onClick={() => startPicking("origin")}
                          className="flex w-full items-center gap-3 border-2 border-dashed border-gray-200 px-4 py-4 text-left transition hover:border-emerald-500/50 hover:bg-emerald-50/40"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-gray-100">
                            <Store className="h-5 w-5 text-[#09193B]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#09193B]">{originPlaceholder}</p>
                            <p className="mt-0.5 text-xs text-gray-500">Toca para elegirlo en el mapa</p>
                          </div>
                        </button>

                        {clerkLoaded && user && (
                          <button
                            type="button"
                            onClick={() => setAddressDialogFor("origin")}
                            className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-black text-[#09193B] transition active:bg-gray-50"
                          >
                            <MapPin className="h-4 w-4 text-[#eb1901]" /> Usar una dirección guardada
                          </button>
                        )}
                      </Card>
                      )}

                      {/* 2. Entrega (solo se elige en el mapa durante el paso 2) */}
                      {progress === "step2" && (
                      <Card>
                        <div className="mb-2 flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center bg-gray-100">
                            <House className="h-4 w-4 text-[#09193B]" />
                          </div>
                          <h3 className="text-sm font-bold text-[#09193B]">Entrega</h3>
                        </div>
                        <button
                          onClick={() => startPicking("destination")}
                          className="flex w-full items-center gap-3 border-2 border-dashed border-gray-200 px-4 py-4 text-left transition hover:border-[#eb1902]/50 hover:bg-[#eb1902]/[0.04]"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-gray-100">
                            <House className="h-5 w-5 text-[#09193B]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#09193B]">Elegir punto de entrega</p>
                            <p className="mt-0.5 text-xs text-gray-500">Toca para elegirlo en el mapa</p>
                          </div>
                        </button>

                        {clerkLoaded && user && (
                          <button
                            type="button"
                            onClick={() => setAddressDialogFor("destination")}
                            className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-black text-[#09193B] transition active:bg-gray-50"
                          >
                            <MapPin className="h-4 w-4 text-[#eb1901]" /> Usar una dirección guardada
                          </button>
                        )}
                      </Card>
                      )}

                      {/* 3. Artículo (solo al confirmar) */}
                      {progress === "confirm" && confirmStep === 1 && (
                      <Card>
                        <div className="mb-2 flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center bg-gray-100">
                            <Package className="h-4 w-4 text-[#09193B]" />
                          </div>
                          <h3 className="text-sm font-bold text-[#09193B]">
                            {isPickup ? "¿Qué vas a enviar?" : "¿Qué quieres que compremos?"}
                          </h3>
                        </div>
                        <textarea
                          value={details}
                          onChange={(e) => setDetails(e.target.value)}
                          placeholder={detailsPlaceholder}
                          maxLength={800}
                          rows={3}
                          className="w-full resize-none border-2 border-gray-200 p-4 text-base leading-6 text-[#09193B] placeholder:text-gray-400 focus:border-[#09193B] focus:outline-none"
                        />
                        <p className="mt-2 text-xs leading-5 text-gray-500">
                          {isPickup
                            ? "Cuéntale al repartidor qué llevará y cómo debe manejarlo."
                            : "Escribe productos, cantidades y cualquier indicación útil. Te confirmamos el total antes de comprar."}
                        </p>
                      </Card>
                      )}

                      {/* Detalles OPCIONALES — progressive disclosure: cada
                          función se ofrece como acción compacta y su formulario
                          se despliega EN LÍNEA, justo debajo de la opción. El `+`
                          activa la función directamente (sin paso "Activar"). */}
                      {progress === "confirm" && confirmStep === 1 && (
                      <Card>
                        <h3 className="text-sm font-black text-[#09193B]">
                          ¿Quieres agregar algún detalle?
                        </h3>
                        <p className="mt-0.5 text-xs leading-5 text-gray-500">
                          Opcional. Si no necesitas nada de esto, puedes continuar.
                        </p>
                        <div className="mt-3 space-y-2">
                          {/* Instrucciones: el `+` despliega los campos aquí mismo. */}
                          <OptionalOption
                            icon={Navigation}
                            label="Instrucciones de entrega"
                            hint="¿Qué debe saber el repartidor?"
                            active={instructionsOpen}
                            onClick={() => setInstructionsOpen((open) => !open)}
                          >
                            <div className="space-y-3 border-t border-gray-100 px-3 pb-3 pt-3">
                              <div>
                                <label className={labelCls} htmlFor="origin-reference">
                                  {isPickup ? "Recolección" : "Compra"}{" "}
                                  <span className="font-medium text-gray-400">(opcional)</span>
                                </label>
                                <textarea
                                  id="origin-reference"
                                  value={originReference}
                                  onChange={(e) => setOriginReference(e.target.value.slice(0, 120))}
                                  maxLength={120}
                                  rows={2}
                                  placeholder={
                                    isPickup
                                      ? "Ej. Local rojo junto a la farmacia, entrada por la esquina."
                                      : "Ej. Tienda con toldo rojo, entrada por la calle lateral."
                                  }
                                  className="w-full resize-none border-2 border-gray-200 p-3 text-sm leading-5 text-[#09193B] placeholder:text-gray-400 focus:border-[#09193B] focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className={labelCls} htmlFor="destination-reference">
                                  Entrega <span className="font-medium text-gray-400">(opcional)</span>
                                </label>
                                <textarea
                                  id="destination-reference"
                                  value={destinationReference}
                                  onChange={(e) => setDestinationReference(e.target.value.slice(0, 120))}
                                  maxLength={120}
                                  rows={2}
                                  placeholder="Ej. Casa con portón negro, frente al parque."
                                  className="w-full resize-none border-2 border-gray-200 p-3 text-sm leading-5 text-[#09193B] placeholder:text-gray-400 focus:border-[#09193B] focus:outline-none"
                                />
                              </div>
                            </div>
                          </OptionalOption>

                          {/* Proteger la entrega: el `+` activa la función y muestra
                              el NIP y los datos del destinatario en el acto. */}
                          <OptionalOption
                            icon={ShieldCheck}
                            label="Proteger la entrega"
                            hint="Pide un código (NIP) al entregar."
                            active={pinEnabled}
                            onClick={() => setPinEnabled((value) => !value)}
                          >
                            <div className="space-y-3 border-t border-gray-100 px-3 pb-3 pt-3">
                              <div className="bg-gray-50 px-3.5 py-3">
                                <p className="text-xs leading-5 text-gray-600">
                                  {nipToSender || !recipientWhatsAppDeclared
                                    ? "El código de entrega llegará a tu WhatsApp y tú se lo das al repartidor."
                                    : "El código de entrega llegará al WhatsApp del destinatario para confirmar la entrega."}
                                </p>
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-black uppercase tracking-wide text-gray-500">Datos del destinatario</p>
                                {recipientFieldsNode}
                              </div>
                              {nipControlsNode}
                              <button
                                type="button"
                                onClick={() => setPinEnabled(false)}
                                className="w-full text-center text-xs font-bold text-gray-500 underline underline-offset-2"
                              >
                                Desactivar la protección
                              </button>
                            </div>
                          </OptionalOption>

                          {/* Avisar al destinatario: el `+` activa el aviso y muestra
                              los datos que necesita. */}
                          <OptionalOption
                            icon={Phone}
                            label="Avisar al destinatario"
                            hint="Solo un aviso por WhatsApp, sin código."
                            active={notifyActive}
                            onClick={() => setNotifyActive((value) => !value)}
                          >
                            <div className="space-y-3 border-t border-gray-100 px-3 pb-3 pt-3">
                              <p className="text-xs leading-5 text-gray-500">
                                {pinEnabled
                                  ? "Solo avisaremos por WhatsApp cuando el repartidor vaya en camino. El código de la entrega protegida no cambia."
                                  : "Le enviaremos un aviso por WhatsApp cuando el repartidor vaya en camino."}
                              </p>
                              {!pinEnabled && recipientFieldsNode}
                            </div>
                          </OptionalOption>
                        </div>
                      </Card>
                      )}

                      {progress === "confirm" && confirmStep === 2 && origin && destination && (
                        <Card>
                          <div className="mb-3 flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center bg-[#eb1902]/10">
                              <CheckCircle className="h-4 w-4 text-[#eb1902]" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-[#09193B]">Tu mandado está listo</h3>
                              <p className="text-xs text-gray-500">Revisa los datos antes de continuar.</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <AddressSummaryRow label={originCardTitle} icon={Store} point={origin} onEdit={() => startPicking("origin")} />
                            {originReference.trim() && (
                              <p className="flex items-start gap-1.5 px-1 text-xs text-gray-500">
                                <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#eb1901]" />
                                {originReference.trim()}
                              </p>
                            )}
                            <AddressSummaryRow label="Entrega" icon={House} point={destination} onEdit={() => startPicking("destination")} />
                            {destinationReference.trim() && (
                              <p className="flex items-start gap-1.5 px-1 text-xs text-gray-500">
                                <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#eb1901]" />
                                {destinationReference.trim()}
                              </p>
                            )}
                            <div className="bg-gray-50 px-3.5 py-3">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{isPickup ? "Enviarás" : "Compra"}</p>
                              <p className="mt-0.5 text-sm font-medium text-[#09193B]">{details}</p>
                            </div>
                            {pinEnabled && (
                              <div className="bg-gray-50 px-3.5 py-3 text-xs text-[#09193B]">
                                Entrega segura activada{nipChannel === "recipient" ? " · NIP para el destinatario" : " · NIP para ti"}
                              </div>
                            )}
                          </div>
                        </Card>
                      )}
                      </motion.div>
                    </div>

                    {/* Avisos de cotización (fuera de zona / error) */}
                    {progress === "confirm" && quote.status === "outside" && (
                      <div className="shrink-0 px-4 pb-2">
                        <div className="border-2 border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-800">
                          Todavía no llegamos hasta{" "}
                          {quote.point === "origin" ? "el punto de recolección" : "el punto de entrega"}.{" "}
                          Toca <strong>Editar</strong> para cambiarlo.
                        </div>
                      </div>
                    )}

                    {progress === "confirm" && quote.status === "error" && (
                      <div className="shrink-0 px-4 pb-2">
                        <div className="flex items-center justify-between gap-3 border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                          <span>No pudimos calcular el costo del mandado.</span>
                          <button
                            type="button"
                            onClick={() => setQuoteNonce((n) => n + 1)}
                            className="shrink-0 font-bold underline underline-offset-2"
                          >
                            Reintentar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── CTA fijo: siempre indica el siguiente paso ── */}
                    {progress === "confirm" && (
                    <div className="shrink-0 border-t border-gray-100 bg-white px-4 pt-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
                      {confirmStep > 1 && (
                        <button
                          type="button"
                          onClick={() => setConfirmStep((step) => (step - 1) as ConfirmStep)}
                          className="mb-2 w-full text-center text-sm font-semibold text-[#09193B]"
                        >
                          Volver al paso anterior
                        </button>
                      )}
                      <Button
                        onClick={continueConfirm}
                        disabled={!canContinueConfirmStep}
                        className={`w-full py-4 text-base font-black uppercase tracking-wide transition-all active:scale-[0.99] ${
                          canContinueConfirmStep
                            ? "bg-[#eb1902] text-white hover:bg-[#c11300]"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {confirmStep === 2 ? ctaLabel : <>Continuar <ChevronRight className="ml-2 h-5 w-5" /></>}
                      </Button>
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}

        {/* ── Vista de ruta a pantalla completa (barra delgada + mapa) ── */}
        {view === "main" && progress === "confirm" && confirmStep === 2 && routeOpen && (
          <motion.div
            key="route-bar"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: DRIVE_MOTION_DURATION.standard, ease: DRIVE_MOTION_EASE.enter }}
            className="absolute inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md"
          >
            <div
              className={`${DRIVE_ELEVATION.sheet} border-t border-black/[0.06] bg-white px-4 pt-3`}
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  {isPickup ? "Enviando tu mandado" : "Comprando por ti"}
                </p>
                <button
                  onClick={() => setRouteOpen(false)}
                  className="flex shrink-0 items-center gap-1 border-2 border-gray-200 px-3 py-1.5 text-xs font-black text-[#09193B] transition active:bg-gray-50"
                >
                  <ChevronDown className="h-3.5 w-3.5" /> Ver direcciones
                </button>
              </div>
              <Button
                onClick={goToCheckout}
                disabled={!canConfirm}
                className={`w-full py-4 text-base font-black uppercase tracking-wide transition-all active:scale-[0.99] ${
                  canConfirm
                    ? "bg-[#eb1902] text-white hover:bg-[#c11300]"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {ctaLabel}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── UI helpers ─────────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-2 border-gray-200 bg-white p-4">
      {children}
    </section>
  );
}

/**
 * Acción OPCIONAL compacta para el bloque de detalles. Se ve como una acción
 * (no como un campo obligatorio): el usuario entiende que puede ignorarla y
 * continuar. Al tocarla se expande el formulario correspondiente.
 */
function OptionalOption({
  icon: Icon,
  label,
  hint,
  active,
  onClick,
  children,
}: {
  icon: typeof Navigation;
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`border-2 transition-colors ${active ? "border-[#eb1902]" : "border-gray-200"}`}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-expanded={active}
        className={`flex w-full items-center gap-3 p-3 text-left transition ${
          active ? "bg-[#eb1902]/[0.04]" : "bg-white hover:bg-gray-50"
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center ${
            active ? "bg-[#eb1902]/10 text-[#eb1902]" : "bg-gray-100 text-[#09193B]"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-[#09193B]">{label}</span>
          <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>
        </span>
        <span
          aria-hidden
          className={`flex h-6 w-6 shrink-0 items-center justify-center text-white ${
            active ? "bg-[#eb1902]" : "bg-gray-300"
          }`}
        >
          {active ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </span>
      </button>
      {/* Formulario del detalle: se despliega EN LÍNEA, dentro de la misma
          tarjeta y justo debajo de su opción (nunca al final de la lista). */}
      <AnimatePresence initial={false}>
        {active && children && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: DRIVE_MOTION_DURATION.standard, ease: DRIVE_MOTION_EASE.enter }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModernSwitch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${
        checked ? "bg-[#eb1902]" : "bg-gray-300"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

function AddressSummaryRow({
  label,
  icon: Icon,
  point,
  onEdit,
}: {
  label: string;
  icon: typeof Store;
  point: AddressPoint;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-2 border-gray-200 bg-white p-3.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-gray-100">
        <Icon className="h-4 w-4 text-[#09193B]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="truncate text-sm font-semibold text-[#09193B]">{point.label}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="flex shrink-0 items-center gap-1 border-2 border-gray-200 px-3 py-1.5 text-xs font-black text-[#09193B] transition active:bg-gray-50"
      >
        <Pencil className="h-3 w-3" /> Editar
      </button>
    </div>
  );
}
