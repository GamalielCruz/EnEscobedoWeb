"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Clock,
  History,
  MessagesSquare,
  Moon,
  RefreshCw,
  Settings2,
  Sun,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  DispatchDriverCard,
  DispatchOrderCard,
  DispatchSnapshot,
  DriverRecommendation,
} from "@/lib/dispatch/dispatch-core";
import type { DispatchConfig, DispatchMode } from "@/lib/dispatch/dispatch-config";
import { OrdersPanel } from "@/components/dispatch/OrdersPanel";
import { DriversPanel } from "@/components/dispatch/DriversPanel";
import { DispatchMap } from "@/components/dispatch/DispatchMap";
import { ConfigPanel } from "@/components/dispatch/ConfigPanel";
import { HistoryPanel } from "@/components/dispatch/HistoryPanel";
import { DriverSupportPanel } from "@/components/dispatch/DriverSupportPanel";
import { AssignModal } from "@/components/dispatch/AssignModal";
import { OrderDetailsModal } from "@/components/dispatch/OrderDetailsModal";
import { NipIncidentsPanel } from "@/components/dispatch/NipIncidentsPanel";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";

const POLL_INTERVAL_MS = 12_000;

const modeMeta: Record<DispatchMode, { label: string; hint: string }> = {
  auto: {
    label: "Automático",
    hint: "El sistema asigna automáticamente según disponibilidad, distancia y carga.",
  },
  manual: {
    label: "Manual",
    hint: "Las nuevas órdenes requieren asignación manual.",
  },
  assisted: {
    label: "Asistido",
    hint: "El sistema recomienda un repartidor y tú confirmas.",
  },
};

const modeBanner: Record<
  DispatchMode,
  { dot: string; border: string; bg: string; title: string; desc: string; badge: string }
> = {
  auto: {
    dot: "bg-emerald-500",
    border: "border-emerald-300/60 dark:border-emerald-500/25",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    title: "DESPACHO AUTOMÁTICO",
    desc: "El sistema asigna automáticamente según disponibilidad, distancia y carga.",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  manual: {
    dot: "bg-red-500",
    border: "border-red-300/60 dark:border-red-500/25",
    bg: "bg-red-50 dark:bg-red-500/10",
    title: "DESPACHO MANUAL",
    desc: "Las nuevas órdenes requieren asignación manual.",
    badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  },
  assisted: {
    dot: "bg-amber-400",
    border: "border-amber-300/60 dark:border-amber-500/25",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    title: "DESPACHO ASISTIDO",
    desc: "El sistema recomienda un repartidor y tú confirmas.",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  },
};

const severityStyle: Record<string, { chip: string; dot: string; icon: string }> = {
  critical: {
    chip: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
    dot: "bg-red-500",
    icon: "text-red-500",
  },
  warning: {
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    dot: "bg-amber-400",
    icon: "text-amber-500",
  },
  info: {
    chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    dot: "bg-sky-400",
    icon: "text-sky-500",
  },
};

export function DispatchCenter() {
  const [snapshot, setSnapshot] = useState<DispatchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ops" | "config" | "history" | "support">("ops");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<DriverRecommendation[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [assignDraft, setAssignDraft] = useState<{
    order: DispatchOrderCard;
    driver: DispatchDriverCard;
    isReassign: boolean;
  } | null>(null);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [detailsOrder, setDetailsOrder] = useState<DispatchOrderCard | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = snapshot?.config ?? null;
  const unreadSupportTotal = (snapshot?.drivers ?? []).reduce(
    (total, driver) =>
      total + (driver.supportChat ?? []).filter((m) => m.role === "driver" && !m.readAt).length,
    0
  );

  const notify = useCallback((kind: "success" | "error", message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, message });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dispatch", { cache: "no-store" });
      if (!res.ok) throw new Error("Error de servidor");
      const data = (await res.json()) as DispatchSnapshot;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el Dispatch Center.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const interval = window.setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchSnapshot]);

  // Recomendaciones (modo asistido) al seleccionar un pedido
  useEffect(() => {
    if (!selectedOrderId) {
      setRecommendations([]);
      return;
    }
    let cancelled = false;
    setRecommendationsLoading(true);
    fetch(`/api/admin/dispatch/recommend?orderId=${encodeURIComponent(selectedOrderId)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRecommendations(data.recommendations ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecommendations([]);
      })
      .finally(() => {
        if (!cancelled) setRecommendationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrderId, snapshot?.orders]);

  async function changeMode(mode: DispatchMode) {
    if (!config || config.mode === mode) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cambiar el modo");
      setSnapshot((prev) => (prev ? { ...prev, config: data.config } : prev));
      notify("success", `Modo ${modeMeta[mode].label} activado.`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo cambiar el modo.");
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig(next: DispatchConfig) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setSnapshot((prev) => (prev ? { ...prev, config: data.config } : prev));
      notify("success", "Configuración guardada.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  function openAssignModal(order: DispatchOrderCard, driver: DispatchDriverCard) {
    const isReassign = Boolean(order.driverId && order.driverId !== driver._id);
    setAssignDraft({ order, driver, isReassign });
  }

  async function confirmAssignment() {
    if (!assignDraft) return;
    const { order, driver, isReassign } = assignDraft;
    // Mandados: seleccionar repartidor = crear OFERTA (la asignación real ocurre
    // cuando el repartidor acepta por WhatsApp). Restaurantes: asignación directa.
    const isMandado = order.serviceKind === "mandado";
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isReassign
            ? {
                action: "reassign",
                orderId: order._id,
                fromDriverId: order.driverId,
                toDriverId: driver._id,
                reason: "reasignación manual",
              }
            : {
                action: isMandado ? "offer" : "assign",
                orderId: order._id,
                driverId: driver._id,
                reason: isMandado ? "oferta manual" : "asignación manual",
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo completar la acción");
      setAssignDraft(null);
      notify(
        "success",
        isMandado
          ? `Oferta enviada a ${driver.name} para el pedido #${shortOrderCode(order.orderNumber)}. Esperando su confirmación.`
          : `Pedido #${shortOrderCode(order.orderNumber)} asignado a ${driver.name}.`
      );
      await fetchSnapshot();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo completar la acción.");
      // Concurrencia: si otro operador asignó el pedido o el repartidor cambió
      // de estado, el servidor rechazó (409). Refresca para reflejar el estado real.
      await fetchSnapshot().catch(() => null);
    } finally {
      setBusy(false);
    }
  }

  async function unassign(order: DispatchOrderCard) {
    if (!order.driverId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unassign", orderId: order._id, driverId: order.driverId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo liberar");
      notify("success", `Pedido #${shortOrderCode(order.orderNumber)} liberado y devuelto a la cola.`);
      await fetchSnapshot();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo liberar.");
      await fetchSnapshot().catch(() => null);
    } finally {
      setBusy(false);
    }
  }

  async function cancelOffer(order: DispatchOrderCard) {
    if (!order.offerDriverId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel_offer",
          orderId: order._id,
          driverId: order.offerDriverId,
          reason: "cancelación de oferta desde el Dispatch Center",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cancelar la oferta");
      notify("success", `Oferta del pedido #${shortOrderCode(order.orderNumber)} cancelada. Vuelve a la cola.`);
      await fetchSnapshot();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo cancelar la oferta.");
      await fetchSnapshot().catch(() => null);
    } finally {
      setBusy(false);
    }
  }

  async function redispatch(order: DispatchOrderCard) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "redispatch", orderId: order._id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo ejecutar el algoritmo");
      notify("success", data.info ?? "Algoritmo ejecutado.");
      await fetchSnapshot();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo ejecutar el algoritmo.");
      await fetchSnapshot().catch(() => null);
    } finally {
      setBusy(false);
    }
  }

  async function driverControl(driver: DispatchDriverCard, action: "block" | "unblock" | "pause" | "resume", reason?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/driver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: driver._id, action, reason: reason ?? "desde el Dispatch Center" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al actualizar repartidor");
      const actionLabel = { block: "bloqueado", unblock: "desbloqueado", pause: "pausado", resume: "reanudado" }[action];
      notify("success", `${driver.name} ${actionLabel}.`);
      await fetchSnapshot();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al actualizar repartidor.");
    } finally {
      setBusy(false);
    }
  }

  const mode = config?.mode ?? "auto";
  const unassignedOrders = (snapshot?.orders ?? []).filter((o) => !o.driverId);
  const assignedOrders = (snapshot?.orders ?? []).filter((o) => o.driverId);
  const selectedOrder = snapshot?.orders.find((o) => o._id === selectedOrderId) ?? null;

  return (
    <div className={`flex h-[calc(100dvh-64px)] min-h-[640px] flex-col gap-3 ${dark ? "dark" : ""}`}>
      {/* ── Barra de KPIs y modo ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/6 bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(9,25,59,0.06)] dark:border-white/10 dark:bg-[#0d1526]">
        <div className="flex flex-wrap items-center gap-4">
          {[
            { label: "Pendientes", value: snapshot?.kpis.pendingOrders ?? 0, color: "text-[#EB1902]", icon: ClipboardList },
            { label: "Asignados", value: snapshot?.kpis.assignedOrders ?? 0, color: "text-[#0b7a3b]", icon: CheckCircle2 },
            { label: "Disponibles", value: snapshot?.kpis.availableDrivers ?? 0, color: "text-[#0b7a3b]", icon: Truck },
            { label: "Ocupados", value: snapshot?.kpis.busyDrivers ?? 0, color: "text-amber-600", icon: Activity },
            { label: "Conectados", value: `${snapshot?.kpis.connectedDrivers ?? 0}/${snapshot?.kpis.registeredDrivers ?? 0}`, color: "text-sky-600", icon: Users },
            { label: "Tiempo asignación", value: snapshot?.kpis.avgAssignmentMinutes != null ? `${snapshot.kpis.avgAssignmentMinutes} min` : "No estimado", color: "text-[#09193B]", icon: Zap },
            { label: "Tiempo entrega", value: snapshot?.kpis.avgDeliveryMinutes != null ? `${snapshot.kpis.avgDeliveryMinutes} min` : "No estimado", color: "text-[#09193B]", icon: Clock },
          ].map((kpi) => (
            <div key={kpi.label} className="flex items-center gap-1.5">
              <kpi.icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <span className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</span>
              <span className={`text-sm font-bold ${kpi.color} dark:brightness-150`}>{kpi.value}</span>
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
            {(Object.keys(modeMeta) as DispatchMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => changeMode(m)}
                disabled={busy}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  mode === m
                    ? "bg-white text-[#EB1902] shadow-sm dark:bg-[#EB1902] dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {modeMeta[m].label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDark((v) => !v)}
            className="h-8 w-8 rounded-lg border-black/8 p-0 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            aria-label="Alternar modo oscuro"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchSnapshot}
            disabled={loading}
            className="h-8 gap-1.5 rounded-lg border-black/8 text-xs dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* ── Banner de estado del modo ─────────────────────────── */}
      <div className={`flex flex-wrap items-center gap-2.5 rounded-xl border px-3 py-2.5 ${modeBanner[mode].border} ${modeBanner[mode].bg}`}>
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${modeBanner[mode].dot}`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${modeBanner[mode].dot}`} />
        </span>
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${modeBanner[mode].badge}`}>
          {modeBanner[mode].title}
        </span>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{modeBanner[mode].desc}</span>
        {unassignedOrders.length > 0 && (
          <span className="ml-auto text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {unassignedOrders.length} pedido{unassignedOrders.length !== 1 ? "s" : ""} por asignar
          </span>
        )}
      </div>

      {/* ── Incidencias de NIP (entregas protegidas sin código entregado) ── */}
      <NipIncidentsPanel
        onSelectOrder={(orderId) => {
          setSelectedOrderId(orderId);
          setAlertsOpen(false);
        }}
        notify={notify}
      />

      {/* ── Bandeja de alertas operativas ─────────────────────── */}
      {(snapshot?.alerts?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-xl border border-black/6 bg-white shadow-[0_1px_3px_rgba(9,25,59,0.06)] dark:border-white/10 dark:bg-[#0d1526]">
          <button
            type="button"
            onClick={() => setAlertsOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-white/5"
          >
            <BellRing className={`h-4 w-4 ${(snapshot?.alerts ?? []).some((a) => a.severity === "critical") ? "text-[#EB1902]" : "text-amber-500"}`} />
            <span className="text-xs font-bold text-[#09193B] dark:text-white">Alertas operativas</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
              {(snapshot?.alerts ?? []).length}
            </span>
            <span className="ml-auto text-[10px] font-semibold text-slate-400">{alertsOpen ? "Ocultar" : "Ver"}</span>
          </button>
          {alertsOpen && (
            <div className="max-h-48 space-y-1.5 overflow-y-auto border-t border-black/6 px-3 py-2.5 dark:border-white/10">
              {(snapshot?.alerts ?? []).map((alert) => {
                const style = severityStyle[alert.severity];
                return (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => {
                      if (alert.id.startsWith("support-")) {
                        setActiveTab("support");
                        setAlertsOpen(false);
                      } else if (alert.orderId) {
                        setSelectedOrderId(alert.orderId);
                        setAlertsOpen(false);
                      } else if (alert.driverId) {
                        setSelectedDriverId(alert.driverId);
                        setAlertsOpen(false);
                      }
                    }}
                    className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:opacity-90 ${style.chip}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold">{alert.title}</span>
                      {alert.detail && <span className="block text-[10px] opacity-80">{alert.detail}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={fetchSnapshot}>
            Reintentar
          </Button>
        </div>
      )}

      {/* ── Pestañas ─────────────────────────────────────────── */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "ops" | "config" | "history" | "support")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="h-9 w-fit gap-1 bg-slate-100/80 px-1 dark:bg-white/5">
          <TabsTrigger value="ops" className="gap-1.5 text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-[#0d1526] dark:data-[state=active]:text-white">
            <Activity className="h-3.5 w-3.5" />
            Operación
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5 text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-[#0d1526] dark:data-[state=active]:text-white">
            <Settings2 className="h-3.5 w-3.5" />
            Configuración
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-[#0d1526] dark:data-[state=active]:text-white">
            <History className="h-3.5 w-3.5" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="support" className="relative gap-1.5 text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-[#0d1526] dark:data-[state=active]:text-white">
            <MessagesSquare className="h-3.5 w-3.5" />
            Mensajes
            {unreadSupportTotal > 0 && (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EB1902] px-1 text-[9px] font-black text-white">
                {unreadSupportTotal}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ops" className="mt-2 flex min-h-0 flex-1">
          {loading && !snapshot ? (
            <div className="grid w-full grid-cols-[340px_1fr_360px] gap-3">
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
              <Skeleton className="h-full w-full rounded-xl" />
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            </div>
          ) : (
            <div className="grid w-full min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)_360px]">
              {/* Panel izquierdo: pedidos */}
              <OrdersPanel
                unassigned={unassignedOrders}
                assigned={assignedOrders}
                selectedOrderId={selectedOrderId}
                availableDrivers={snapshot?.kpis.availableDrivers ?? 0}
                registeredDrivers={snapshot?.kpis.registeredDrivers ?? 0}
                onSelectOrder={(order) => setSelectedOrderId(order._id)}
                onUnassign={unassign}
                onRedispatch={redispatch}
                onCancelOffer={cancelOffer}
                onDetails={(order) => setDetailsOrder(order)}
                mode={mode}
              />

              {/* Panel central: mapa */}
              <DispatchMap
                orders={snapshot?.orders ?? []}
                stores={snapshot?.stores ?? []}
                zones={snapshot?.zones ?? []}
                drivers={snapshot?.drivers ?? []}
                recommendations={recommendations}
                selectedOrderId={selectedOrderId}
                selectedDriverId={selectedDriverId}
                onSelectOrder={(id) => setSelectedOrderId(id)}
                onSelectDriver={(id) => setSelectedDriverId(id)}
                dark={dark}
              />

              {/* Panel derecho: repartidores */}
              <DriversPanel
                drivers={snapshot?.drivers ?? []}
                selectedDriverId={selectedDriverId}
                selectedOrder={selectedOrder}
                recommendations={recommendations}
                recommendationsLoading={recommendationsLoading}
                mode={mode}
                onSelectDriver={(id) => setSelectedDriverId(id)}
                onAssign={(driver) => {
                  if (selectedOrder) openAssignModal(selectedOrder, driver);
                  else notify("error", "Selecciona primero un pedido en el panel izquierdo.");
                }}
                onDriverControl={driverControl}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="config" className="mt-2 flex min-h-0 flex-1">
          <ConfigPanel
            config={config}
            loading={loading}
            saving={busy}
            onSave={saveConfig}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-2 flex min-h-0 flex-1">
          <HistoryPanel />
        </TabsContent>

        <TabsContent value="support" className="mt-2 flex min-h-0 flex-1">
          <DriverSupportPanel
            drivers={snapshot?.drivers ?? []}
            busy={busy}
            onChanged={fetchSnapshot}
            notify={notify}
          />
        </TabsContent>
      </Tabs>

      {/* ── Modal de confirmación de asignación ─────────────── */}
      <AssignModal
        draft={assignDraft}
        busy={busy}
        onConfirm={confirmAssignment}
        onCancel={() => setAssignDraft(null)}
      />

      {/* ── Detalles del pedido (UUID completo aquí) ─────────── */}
      <OrderDetailsModal order={detailsOrder} onClose={() => setDetailsOrder(null)} />

      {/* ── Toast ───────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[999] flex max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-bottom-3 fade-in duration-200 ${
            toast.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950 dark:text-red-300"
          }`}
          role="status"
        >
          {toast.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
