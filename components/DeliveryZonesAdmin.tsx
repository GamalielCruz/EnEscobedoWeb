"use client";

import { useEffect, useMemo, useState } from "react";
import { GoogleMap, Marker, Polygon, useJsApiLoader } from "@react-google-maps/api";
import { AlertTriangle, Copy, Loader2, MapPin, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateDeliveryQuote,
  DEFAULT_DELIVERY_CONFIG,
  DeliveryPricingConfig,
  DeliveryZone,
  LatLng,
  ScheduleRule,
  validateZoneOverlaps,
} from "@/lib/delivery-zones";

const mapContainerStyle = {
  width: "100%",
  height: "420px",
};

const defaultCenter = {
  lat: 20.5888,
  lng: -100.3899,
};

const defaultPreviewTime = "2026-04-27T12:00";

const demandPresets = {
  low: 1,
  medium: 1.2,
  high: 1.5,
  custom: 1,
};

const colors = ["#f97316", "#0ea5e9", "#22c55e", "#a855f7", "#ef4444", "#14b8a6"];

type DeliveryZonesAdminProps = {
  storeId?: string;
  center?: LatLng;
};

export default function DeliveryZonesAdmin({ storeId, center = defaultCenter }: DeliveryZonesAdminProps) {
  const endpoint = storeId
    ? `/api/dashboard/delivery-pricing?storeId=${encodeURIComponent(storeId)}`
    : "/api/dashboard/delivery-pricing";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded } = useJsApiLoader({
    id: "delivery-zones-map",
    googleMapsApiKey: apiKey,
  });

  const [config, setConfig] = useState<DeliveryPricingConfig>(DEFAULT_DELIVERY_CONFIG);
  const [selectedZoneId, setSelectedZoneId] = useState(DEFAULT_DELIVERY_CONFIG.zones[0]?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [previewPoint, setPreviewPoint] = useState<LatLng>(center);
  const [previewTime, setPreviewTime] = useState(defaultPreviewTime);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState("");

  useEffect(() => {
    fetch(endpoint, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setConfig(data.config);
          setJsonDraft(JSON.stringify(data.config, null, 2));
          setSelectedZoneId(data.config.zones?.[0]?.id ?? "");
        } else {
          setMessage(data.error ?? "No se pudo cargar la configuracion.");
        }
      })
      .catch(() => setMessage("No se pudo cargar la configuracion."))
      .finally(() => setLoading(false));
  }, [endpoint]);

  const selectedZone = useMemo(
    () => config.zones.find((zone) => zone.id === selectedZoneId) ?? config.zones[0],
    [config.zones, selectedZoneId]
  );

  const quote = useMemo(
    () =>
      calculateDeliveryQuote(config, {
        lat: previewPoint.lat,
        lng: previewPoint.lng,
        orderDate: previewTime ? new Date(previewTime) : new Date(),
      }),
    [config, previewPoint, previewTime]
  );

  const overlapWarnings = useMemo(() => validateZoneOverlaps(config.zones), [config.zones]);

  const updateConfig = (nextConfig: DeliveryPricingConfig) => {
    setConfig(nextConfig);
    setJsonDraft(JSON.stringify(nextConfig, null, 2));
  };

  const updateZone = (zoneId: string, patch: Partial<DeliveryZone>) => {
    updateConfig({
      ...config,
      zones: config.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)),
    });
  };

  const addZone = () => {
    const id = `zona-${Date.now()}`;
    const offset = config.zones.length * 0.01;
    const nextZone: DeliveryZone = {
      id,
      name: `Zona ${config.zones.length + 1}`,
      basePrice: 50,
      color: colors[config.zones.length % colors.length],
      active: true,
      coordinates: [
        { lat: center.lat + offset, lng: center.lng - 0.01 + offset },
        { lat: center.lat + offset, lng: center.lng + 0.01 + offset },
        { lat: center.lat - 0.01 + offset, lng: center.lng + 0.01 + offset },
        { lat: center.lat - 0.01 + offset, lng: center.lng - 0.01 + offset },
      ],
    };

    updateConfig({ ...config, zones: [...config.zones, nextZone] });
    setSelectedZoneId(id);
  };

  const deleteZone = (zoneId: string) => {
    const nextZones = config.zones.filter((zone) => zone.id !== zoneId);
    updateConfig({ ...config, zones: nextZones });
    setSelectedZoneId(nextZones[0]?.id ?? "");
  };

  const addScheduleRule = () => {
    const nextRule: ScheduleRule = {
      id: `horario-${Date.now()}`,
      name: "Nuevo horario",
      startTime: "18:00",
      endTime: "20:00",
      multiplier: 1,
      active: true,
    };

    updateConfig({ ...config, scheduleRules: [...config.scheduleRules, nextRule] });
  };

  const updateScheduleRule = (ruleId: string, patch: Partial<ScheduleRule>) => {
    updateConfig({
      ...config,
      scheduleRules: config.scheduleRules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    });
  };

  const deleteScheduleRule = (ruleId: string) => {
    updateConfig({
      ...config,
      scheduleRules: config.scheduleRules.filter((rule) => rule.id !== ruleId),
    });
  };

  const handlePolygonEdit = (zoneId: string, polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    const coordinates: LatLng[] = [];
    for (let index = 0; index < path.getLength(); index += 1) {
      const point = path.getAt(index);
      coordinates.push({ lat: point.lat(), lng: point.lng() });
    }
    updateZone(zoneId, { coordinates });
  };

  const applyJsonDraft = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      updateConfig(parsed);
      setJsonError("");
      setSelectedZoneId(parsed.zones?.[0]?.id ?? "");
    } catch {
      setJsonError("JSON invalido. Revisa comas, llaves y tipos de dato.");
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, storeId }),
      });
      const data = await res.json();

      if (!data.success) {
        setMessage(data.error ?? "No se pudo guardar.");
        return;
      }

      setConfig(data.config);
      setJsonDraft(JSON.stringify(data.config, null, 2));
      setMessage("Configuracion guardada.");
    } catch {
      setMessage("No se pudo guardar la configuracion.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#ff8800]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{storeId ? "Mis zonas de entrega" : "Envios por zonas"}</h2>
          <p className="text-sm text-gray-600">Poligonos, costos, horarios y vista previa del precio.</p>
        </div>
        <Button onClick={saveConfig} disabled={saving} className="bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar
        </Button>
      </div>

      {message && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message}
        </div>
      )}

      {overlapWarnings.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-medium">Posibles zonas superpuestas</p>
              <ul className="mt-1 list-disc pl-5">
                {overlapWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Mapa de zonas</CardTitle>
            <CardDescription>Arrastra los puntos del poligono o haz clic para probar una ubicacion.</CardDescription>
          </CardHeader>
          <CardContent>
            {!apiKey ? (
              <div className="flex h-[420px] items-center justify-center rounded-md border bg-gray-50 text-sm text-gray-600">
                Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
              </div>
            ) : !isLoaded ? (
              <div className="flex h-[420px] items-center justify-center rounded-md border bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-[#ff8800]" />
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={selectedZone?.coordinates?.[0] ?? center}
                  zoom={13}
                  onClick={(event) => {
                    if (!event.latLng) return;
                    setPreviewPoint({ lat: event.latLng.lat(), lng: event.latLng.lng() });
                  }}
                  options={{
                    streetViewControl: false,
                    mapTypeControl: false,
                    fullscreenControl: false,
                  }}
                >
                  {config.zones.map((zone) => (
                    <Polygon
                      key={zone.id}
                      paths={zone.coordinates}
                      editable={zone.id === selectedZone?.id}
                      draggable={zone.id === selectedZone?.id}
                      onMouseUp={(event) => {
                        const polygon = event.domEvent?.target ? undefined : undefined;
                        void polygon;
                      }}
                      onLoad={(polygon) => {
                        polygon.addListener("mouseup", () => handlePolygonEdit(zone.id, polygon));
                        polygon.addListener("dragend", () => handlePolygonEdit(zone.id, polygon));
                        polygon.getPath().addListener("set_at", () => handlePolygonEdit(zone.id, polygon));
                        polygon.getPath().addListener("insert_at", () => handlePolygonEdit(zone.id, polygon));
                      }}
                      options={{
                        fillColor: zone.color ?? "#f97316",
                        fillOpacity: zone.id === selectedZone?.id ? 0.28 : 0.15,
                        strokeColor: zone.color ?? "#f97316",
                        strokeOpacity: zone.active === false ? 0.35 : 0.95,
                        strokeWeight: zone.id === selectedZone?.id ? 3 : 2,
                        clickable: true,
                      }}
                      onClick={() => setSelectedZoneId(zone.id)}
                    />
                  ))}
                  <Marker position={previewPoint} />
                </GoogleMap>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Formula: precio zona x demanda x horario.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Latitud</Label>
                <Input
                  type="number"
                  value={previewPoint.lat}
                  onChange={(event) => setPreviewPoint({ ...previewPoint, lat: Number(event.target.value) })}
                />
              </div>
              <div>
                <Label>Longitud</Label>
                <Input
                  type="number"
                  value={previewPoint.lng}
                  onChange={(event) => setPreviewPoint({ ...previewPoint, lng: Number(event.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Fecha y hora</Label>
              <Input type="datetime-local" value={previewTime} onChange={(event) => setPreviewTime(event.target.value)} />
            </div>
            <div className="rounded-md border bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Costo calculado</span>
                <span className="text-2xl font-bold text-gray-900">
                  {quote.finalPrice == null
                    ? "Rechazado"
                    : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(quote.finalPrice)}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-sm text-gray-700">
                <p>Zona: {quote.zone?.name ?? "Fuera de zona"}</p>
                <p>Demanda: x{quote.demandMultiplier}</p>
                <p>Horario: {quote.scheduleRule?.name ?? "Sin regla"} x{quote.scheduleMultiplier}</p>
                {quote.reason && <p className="text-amber-700">{quote.reason}</p>}
              </div>
              {config.debug && (
                <pre className="mt-3 max-h-32 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                  {quote.debug.join("\n")}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Zonas</CardTitle>
              <CardDescription>Precio base y coordenadas por poligono.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addZone}>
              <Plus className="mr-2 h-4 w-4" />
              Zona
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedZone?.id ?? ""} onValueChange={setSelectedZoneId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona zona" />
              </SelectTrigger>
              <SelectContent>
                {config.zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedZone && (
              <div className="space-y-4 rounded-md border p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Nombre</Label>
                    <Input value={selectedZone.name} onChange={(event) => updateZone(selectedZone.id, { name: event.target.value })} />
                  </div>
                  <div>
                    <Label>Precio base</Label>
                    <Input
                      type="number"
                      value={selectedZone.basePrice}
                      onChange={(event) => updateZone(selectedZone.id, { basePrice: Number(event.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <Input value={selectedZone.color ?? ""} onChange={(event) => updateZone(selectedZone.id, { color: event.target.value })} />
                  </div>
                  <div>
                    <Label>Activa</Label>
                    <Select
                      value={selectedZone.active === false ? "false" : "true"}
                      onValueChange={(value) => updateZone(selectedZone.id, { active: value === "true" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Si</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Coordenadas</Label>
                  <Textarea
                    className="min-h-40 font-mono text-xs"
                    value={JSON.stringify(selectedZone.coordinates, null, 2)}
                    onChange={(event) => {
                      try {
                        const coordinates = JSON.parse(event.target.value);
                        if (Array.isArray(coordinates)) updateZone(selectedZone.id, { coordinates });
                      } catch {
                        // Keep typing fluid while JSON is incomplete.
                      }
                    }}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => deleteZone(selectedZone.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar zona
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Variables globales</CardTitle>
            <CardDescription>Demanda, horarios y reglas fuera de zona.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Demanda</Label>
                <Select
                  value={config.demand.level}
                  onValueChange={(value) =>
                    updateConfig({
                      ...config,
                      demand: {
                        level: value as DeliveryPricingConfig["demand"]["level"],
                        multiplier: demandPresets[value as keyof typeof demandPresets] ?? config.demand.multiplier,
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja x1.0</SelectItem>
                    <SelectItem value="medium">Media x1.2</SelectItem>
                    <SelectItem value="high">Alta x1.5</SelectItem>
                    <SelectItem value="custom">Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Multiplicador</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={config.demand.multiplier}
                  onChange={(event) =>
                    updateConfig({
                      ...config,
                      demand: { ...config.demand, level: "custom", multiplier: Number(event.target.value) },
                    })
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Fuera de zona</Label>
                <Select
                  value={config.outsideZone.mode}
                  onValueChange={(value) =>
                    updateConfig({
                      ...config,
                      outsideZone: { ...config.outsideZone, mode: value as DeliveryPricingConfig["outsideZone"]["mode"] },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reject">Rechazar</SelectItem>
                    <SelectItem value="special_fee">Tarifa especial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tarifa especial</Label>
                <Input
                  type="number"
                  value={config.outsideZone.specialFee}
                  onChange={(event) =>
                    updateConfig({
                      ...config,
                      outsideZone: { ...config.outsideZone, specialFee: Number(event.target.value) },
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Horarios</Label>
                <Button variant="outline" size="sm" onClick={addScheduleRule}>
                  <Plus className="mr-2 h-4 w-4" />
                  Horario
                </Button>
              </div>
              {config.scheduleRules.map((rule) => (
                <div key={rule.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_92px_92px_92px_40px]">
                  <Input value={rule.name} onChange={(event) => updateScheduleRule(rule.id, { name: event.target.value })} />
                  <Input type="time" value={rule.startTime} onChange={(event) => updateScheduleRule(rule.id, { startTime: event.target.value })} />
                  <Input type="time" value={rule.endTime} onChange={(event) => updateScheduleRule(rule.id, { endTime: event.target.value })} />
                  <Input
                    type="number"
                    step="0.05"
                    value={rule.multiplier}
                    onChange={(event) => updateScheduleRule(rule.id, { multiplier: Number(event.target.value) })}
                  />
                  <Button variant="outline" size="icon" onClick={() => deleteScheduleRule(rule.id)} aria-label="Eliminar horario">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>JSON de configuracion</CardTitle>
            <CardDescription>Ejemplo editable para guardar o migrar la configuracion dinamica.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={applyJsonDraft}>
            <Copy className="mr-2 h-4 w-4" />
            Aplicar JSON
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-80 font-mono text-xs"
            value={jsonDraft}
            onChange={(event) => setJsonDraft(event.target.value)}
          />
          {jsonError && <p className="mt-2 text-sm text-red-600">{jsonError}</p>}
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <MapPin className="h-4 w-4" />
            <span>{storeId ? "Esta configuracion solo aplica a tu restaurante." : "Configuracion global de entregas de El Menu."}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
