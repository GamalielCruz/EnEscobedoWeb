"use client";

import * as React from "react";
import { CalendarClock, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_DELIVERY_SCHEDULE,
  WEEKDAYS,
  zonedDateTimeToDate,
  type DeliveryScheduleConfig,
} from "@/lib/fulfillment-schedule";

type ScheduledOrder = {
  _id: string;
  orderNumber?: string;
  customerName?: string;
  orderType?: string;
  orderStatus?: string;
  dispatchStatus?: string;
  scheduleStatus?: string;
  scheduledSlot?: { startAt?: string; endAt?: string };
  scheduledPreparationAt?: string;
  scheduledDispatchAt?: string;
  scheduleRiskLevel?: string;
  customerHelpRequested?: boolean;
  storeName?: string;
  repartidorAsignado?: { _id: string; nombre: string };
  preassignedDriver?: { _id: string; nombre: string };
};

type Driver = { _id: string; nombre: string; estadoDisponibilidad?: string };
type Filter = "today" | "tomorrow" | "week" | "no_driver" | "risk" | "completed" | "cancelled";

const labels = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
} as const;

function localDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function localInputValue(value?: string) {
  if (!value) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value)).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function localInputToIso(value: string) {
  const [date, time] = value.split("T");
  return zonedDateTimeToDate(date, time).toISOString();
}

export default function DeliveryScheduleAdminPage() {
  const [config, setConfig] = React.useState<DeliveryScheduleConfig>(DEFAULT_DELIVERY_SCHEDULE);
  const [orders, setOrders] = React.useState<ScheduledOrder[]>([]);
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [filter, setFilter] = React.useState<Filter>("today");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/delivery-schedule", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setConfig(data.config);
      setOrders(data.orders);
      setDrivers(data.drivers);
    } else setMessage(data.error || "No se pudo cargar.");
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/delivery-schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = await response.json();
    setMessage(response.ok ? "Configuración guardada." : data.error || "No se pudo guardar.");
    setSaving(false);
  }

  async function assignDriver(orderId: string, driverId: string) {
    if (!driverId) return;
    const response = await fetch("/api/admin/delivery-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign_driver", orderId, driverId }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Repartidor asignado." : data.error || "No se pudo asignar.");
    if (response.ok) await load();
  }

  async function releaseReservation(orderId: string) {
    const response = await fetch("/api/admin/delivery-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release_reservation", orderId }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Reserva liberada." : data.error || "No se pudo liberar.");
    if (response.ok) await load();
  }

  const today = localDateKey();
  const tomorrow = localDateKey(new Date(Date.now() + 86_400_000));
  const visibleOrders = orders.filter((order) => {
    const date = order.scheduledSlot?.startAt ? localDateKey(new Date(order.scheduledSlot.startAt)) : "";
    if (filter === "today") return date === today;
    if (filter === "tomorrow") return date === tomorrow;
    if (filter === "week") return date >= today && date <= localDateKey(new Date(Date.now() + 7 * 86_400_000));
    if (filter === "no_driver") return order.orderType === "delivery" && !order.repartidorAsignado;
    if (filter === "risk") return ["risk", "alert", "contingency"].includes(order.scheduleRiskLevel || "") || order.customerHelpRequested;
    if (filter === "completed") return ["completed", "delivered"].includes(order.orderStatus || "");
    return order.orderStatus === "cancelled";
  });

  const numberFields: Array<[keyof DeliveryScheduleConfig, string]> = [
    ["minimumAdvanceMinutes", "Anticipación mínima"],
    ["maximumScheduledDays", "Días máximos"],
    ["slotMinutes", "Duración del intervalo"],
    ["operationalMarginMinutes", "Margen antes del cierre"],
    ["driverAssignmentMarginMinutes", "Margen para conseguir repartidor"],
    ["estimatedTravelMinutes", "Traslado estimado"],
    ["riskBeforeMinutes", "Marcar riesgo antes"],
    ["adminAlertBeforeMinutes", "Alertar admin antes"],
    ["contingencyBeforeMinutes", "Avisar contingencia al cliente antes"],
  ];

  function renderDriverCell(order: ScheduledOrder) {
    if (order.repartidorAsignado?.nombre) {
      return <span className="font-medium text-emerald-700">{order.repartidorAsignado.nombre}</span>;
    }
    if (order.preassignedDriver?.nombre) {
      return (
        <span className="flex items-center gap-1">
          <span className="font-medium text-violet-600">{order.preassignedDriver.nombre}</span>
          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-600">Reserva</span>
          <button
            className="ml-1 text-[10px] text-slate-400 underline hover:text-slate-600"
            onClick={() => releaseReservation(order._id)}
          >
            liberar
          </button>
        </span>
      );
    }
    if (order.orderType === "delivery") {
      return (
        <select className="max-w-40 rounded border p-1" defaultValue="" onChange={(event) => assignDriver(order._id, event.target.value)}>
          <option value="">Asignar…</option>
          {drivers.map((driver) => <option key={driver._id} value={driver._id}>{driver.nombre}</option>)}
        </select>
      );
    }
    return "No aplica";
  }

  return (
    <div className="space-y-5 px-4 sm:px-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#EB1901]">Operación</p>
          <h1 className="text-2xl font-bold">Horarios de reparto</h1>
          <p className="text-sm text-gray-500">Zona horaria: America/Mexico_City</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4" />Actualizar</Button>
          <Button onClick={save} disabled={saving} className="bg-[#EB1901] text-white hover:bg-[#c91501]"><Save className="h-4 w-4" />{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </div>
      {message ? <p className="rounded-xl bg-white p-3 text-sm">{message}</p> : null}

      <Card>
        <CardHeader><CardTitle>Horario habitual de reparto</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Día</th><th>Activo</th><th>Inicio</th><th>Fin</th><th>Programados</th></tr></thead>
            <tbody>
              {WEEKDAYS.map((weekday) => {
                const day = config.weeklySchedule[weekday];
                return (
                  <tr key={weekday} className="border-b last:border-0">
                    <td className="py-3 font-medium">{labels[weekday]}</td>
                    <td><input type="checkbox" checked={day.enabled} onChange={(event) => setConfig((current) => ({ ...current, weeklySchedule: { ...current.weeklySchedule, [weekday]: { ...day, enabled: event.target.checked } } }))} /></td>
                    <td><input type="time" className="rounded-lg border p-2" value={day.startTime} onChange={(event) => setConfig((current) => ({ ...current, weeklySchedule: { ...current.weeklySchedule, [weekday]: { ...day, startTime: event.target.value } } }))} /></td>
                    <td><input type="time" className="rounded-lg border p-2" value={day.endTime} onChange={(event) => setConfig((current) => ({ ...current, weeklySchedule: { ...current.weeklySchedule, [weekday]: { ...day, endTime: event.target.value } } }))} /></td>
                    <td><input type="checkbox" checked={day.scheduledOrdersEnabled !== false} onChange={(event) => setConfig((current) => ({ ...current, weeklySchedule: { ...current.weeklySchedule, [weekday]: { ...day, scheduledOrdersEnabled: event.target.checked } } }))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pedidos programados y alertas</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="flex items-center gap-2 rounded-xl border p-3 text-sm font-medium">
            <input type="checkbox" checked={config.scheduledOrdersEnabled} onChange={(event) => setConfig({ ...config, scheduledOrdersEnabled: event.target.checked })} />
            Permitir pedidos programados
          </label>
          {numberFields.map(([key, label]) => (
            <label key={key} className="text-sm">
              <span className="mb-1 block font-medium">{label} (min)</span>
              <input type="number" min={key === "slotMinutes" ? 30 : 0} step={key === "slotMinutes" ? 30 : 1} className="w-full rounded-lg border p-2" value={Number(config[key] ?? 0)} onChange={(event) => setConfig({ ...config, [key]: Number(event.target.value) })} />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Control operativo</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border p-3 font-medium">
            <input type="checkbox" checked={config.pause.active} onChange={(event) => setConfig({ ...config, pause: { ...config.pause, active: event.target.checked } })} />
            Pausar entregas temporalmente
          </label>
          <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
            <input type="checkbox" checked={config.pause.allowFutureScheduling !== false} onChange={(event) => setConfig({ ...config, pause: { ...config.pause, allowFutureScheduling: event.target.checked } })} />
            Permitir programar después de reactivar
          </label>
          <label className="text-sm">Inicio<input type="datetime-local" className="mt-1 w-full rounded-lg border p-2" value={localInputValue(config.pause.startAt)} onChange={(event) => setConfig({ ...config, pause: { ...config.pause, startAt: event.target.value ? localInputToIso(event.target.value) : undefined } })} /></label>
          <label className="text-sm">Reactivación estimada<input type="datetime-local" className="mt-1 w-full rounded-lg border p-2" value={localInputValue(config.pause.estimatedResumeAt)} onChange={(event) => setConfig({ ...config, pause: { ...config.pause, estimatedResumeAt: event.target.value ? localInputToIso(event.target.value) : undefined } })} /></label>
          <label className="text-sm sm:col-span-2">Motivo visible<input className="mt-1 w-full rounded-lg border p-2" value={config.pause.reason || ""} onChange={(event) => setConfig({ ...config, pause: { ...config.pause, reason: event.target.value } })} /></label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between"><CardTitle>Excepciones</CardTitle><Button variant="outline" size="sm" onClick={() => setConfig({ ...config, exceptions: [...config.exceptions, { _key: crypto.randomUUID(), date: today, deliveryEnabled: false, reason: "" }] })}><Plus className="h-4 w-4" />Añadir</Button></div>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.exceptions.map((exception, index) => (
            <div key={exception._key || index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_auto_1fr_1fr_2fr_auto]">
              <input type="date" className="rounded-lg border p-2" value={exception.date} onChange={(event) => setConfig({ ...config, exceptions: config.exceptions.map((item, itemIndex) => itemIndex === index ? { ...item, date: event.target.value } : item) })} />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={exception.deliveryEnabled} onChange={(event) => setConfig({ ...config, exceptions: config.exceptions.map((item, itemIndex) => itemIndex === index ? { ...item, deliveryEnabled: event.target.checked } : item) })} />Activo</label>
              <input type="time" disabled={!exception.deliveryEnabled} className="rounded-lg border p-2" value={exception.startTime || ""} onChange={(event) => setConfig({ ...config, exceptions: config.exceptions.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: event.target.value } : item) })} />
              <input type="time" disabled={!exception.deliveryEnabled} className="rounded-lg border p-2" value={exception.endTime || ""} onChange={(event) => setConfig({ ...config, exceptions: config.exceptions.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: event.target.value } : item) })} />
              <input placeholder="Motivo" className="rounded-lg border p-2" value={exception.reason || ""} onChange={(event) => setConfig({ ...config, exceptions: config.exceptions.map((item, itemIndex) => itemIndex === index ? { ...item, reason: event.target.value } : item) })} />
              <Button variant="outline" size="icon" aria-label="Eliminar excepción" onClick={() => setConfig({ ...config, exceptions: config.exceptions.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-[#EB1901]" />Órdenes programadas</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {([["today", "Hoy"], ["tomorrow", "Mañana"], ["week", "Esta semana"], ["no_driver", "Sin repartidor"], ["risk", "En riesgo"], ["completed", "Completadas"], ["cancelled", "Canceladas"]] as Array<[Filter, string]>).map(([value, label]) => (
              <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-sm ${filter === value ? "bg-black text-white" : "bg-gray-100"}`}>{label}</button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Pedido</th><th>Restaurante</th><th>Cliente</th><th>Modalidad</th><th>Horario</th><th>Preparación</th><th>Dispatch</th><th>Estado</th><th>Repartidor</th><th>Riesgo</th></tr></thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order._id} className="border-b align-top">
                    <td className="py-3 font-medium">#{order.orderNumber}</td>
                    <td>{order.storeName}</td><td>{order.customerName}</td><td>{order.orderType}</td>
                    <td>{formatDate(order.scheduledSlot?.startAt)}</td>
                    <td>{formatDate(order.scheduledPreparationAt)}</td>
                    <td>{formatDate(order.scheduledDispatchAt)}</td>
                    <td>{order.scheduleStatus || order.orderStatus}</td>
                    <td>
                      {renderDriverCell(order)}
                    </td>
                    <td className={["alert", "contingency"].includes(order.scheduleRiskLevel || "") ? "font-semibold text-red-600" : ""}>{order.customerHelpRequested ? "Ayuda" : order.scheduleRiskLevel || "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && visibleOrders.length === 0 ? <p className="py-8 text-center text-gray-500">No hay órdenes para este filtro.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
