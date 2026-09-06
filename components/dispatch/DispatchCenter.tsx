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
import { UpcomingScheduledPanel } from "@/components/dispatch/UpcomingScheduledPanel";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";
import { useOfferAlertSound } from "@/hooks/useOfferAlertSound";

const POLL_INTERVAL_MS = 12_000;

const modeMeta: Record<DispatchMode, { label: string; hint: string; abbr: string }> = {
  auto: { label: "Automático", hint: "El sistema asigna automáticamente.", abbr: "Auto" },
  manual: { label: "Manual", hint: "Asignación manual requerida.", abbr: "Manual" },
  assisted: { label: "Asistido", hint: "El sistema recomienda y tú confirmas.", abbr: "Asistido" },
};

const modeBanner: Record<DispatchMode, { dot: string; badge: string }> = {
  auto: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  manual: { dot: "bg-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
  assisted: { dot: "bg-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
};

const severityStyle: Record<string, { chip: string; dot: string }> = {
  critical: { chip: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300", dot: "bg-red-500" },
  warning: { chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300", dot: "bg-amber-400" },
  info: { chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300", dot: "bg-sky-400" },
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
  const [assignDraft, setAssignDraft] = useState<{ order: DispatchOrderCard; driver: DispatchDriverCard; isReassign: boolean } | null>(null);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [detailsOrder, setDetailsOrder] = useState<DispatchOrderCard | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sound alert for new offers ──────────────────────────────
  const { notifyOfferChange } = useOfferAlertSound();
  const prevOfferedIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const config = snapshot?.config ?? null;
  const unreadSupportTotal = (snapshot?.drivers ?? []).reduce(
    (total, driver) => total + (driver.supportChat ?? []).filter((m) => m.role === "driver" && !m.readAt).length,
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

  useEffect(() => {
    if (!selectedOrderId) { setRecommendations([]); return; }
    let cancelled = false;
    setRecommendationsLoading(true);
    fetch(`/api/admin/dispatch/recommend?orderId=${encodeURIComponent(selectedOrderId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setRecommendations(d.recommendations ?? []); })
      .catch(() => { if (!cancelled) setRecommendations([]); })
      .finally(() => { if (!cancelled) setRecommendationsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedOrderId, snapshot?.orders]);

  async function changeMode(mode: DispatchMode) {
    if (!config || config.mode === mode) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSnapshot((prev) => (prev ? { ...prev, config: data.config } : prev));
      notify("success", `Modo ${modeMeta[mode].label} activado.`);
    } catch (err) { notify("error", err instanceof Error ? err.message : "Error"); }
    finally { setBusy(false); }
  }

  async function saveConfig(next: DispatchConfig) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSnapshot((prev) => (prev ? { ...prev, config: data.config } : prev));
      notify("success", "Configuración guardada.");
    } catch (err) { notify("error", err instanceof Error ? err.message : "Error"); }
    finally { setBusy(false); }
  }

  function openAssignModal(order: DispatchOrderCard, driver: DispatchDriverCard) {
    setAssignDraft({ order, driver, isReassign: Boolean(order.driverId && order.driverId !== driver._id) });
  }

  async function confirmAssignment() {
    if (!assignDraft) return;
    const { order, driver, isReassign } = assignDraft;
    const isMandado = order.serviceKind === "mandado";
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/assign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isReassign
          ? { action: "reassign", orderId: order._id, fromDriverId: order.driverId, toDriverId: driver._id, reason: "reasignación manual" }
          : { action: isMandado ? "offer" : "assign", orderId: order._id, driverId: driver._id, reason: isMandado ? "oferta manual" : "asignación manual" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setAssignDraft(null);
      notify("success", isMandado ? `Oferta enviada a ${driver.name} para #${shortOrderCode(order.orderNumber)}.` : `#${shortOrderCode(order.orderNumber)} asignado a ${driver.name}.`);
      await fetchSnapshot();
    } catch (err) { notify("error", err instanceof Error ? err.message : "Error"); await fetchSnapshot().catch(() => null); }
    finally { setBusy(false); }
  }

  async function unassign(order: DispatchOrderCard) {
    if (!order.driverId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unassign", orderId: order._id, driverId: order.driverId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      notify("success", `#${shortOrderCode(order.orderNumber)} liberado.`);
      await fetchSnapshot();
    } catch (err) { notify("error", err instanceof Error ? err.message : "Error"); await fetchSnapshot().catch(() => null); }
    finally { setBusy(false); }
  }

  async function cancelOffer(order: DispatchOrderCard) {
    if (!order.offerDriverId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel_offer", orderId: order._id, driverId: order.offerDriverId, reason: "cancelación desde Dispatch" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      notify("success", `Oferta de #${shortOrderCode(order.orderNumber)} cancelada.`);
      await fetchSnapshot();
    } catch (err) { notify("error", err instanceof Error ? err.message : "Error"); await fetchSnapshot().catch(() => null); }
    finally { setBusy(false); }
  }

  async function redispatch(order: DispatchOrderCard) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "redispatch", orderId: order._id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      notify("success", data.info ?? "Algoritmo ejecutado.");
      await fetchSnapshot();
    } catch (err) { notify("error", err instanceof Error ? err.message : "Error"); await fetchSnapshot().catch(() => null); }
    finally { setBusy(false); }
  }

  async function driverControl(driver: DispatchDriverCard, action: "block" | "unblock" | "pause" | "resume", reason?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/driver", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverId: driver._id, action, reason: reason ?? "desde Dispatch" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      const label = { block: "bloqueado", unblock: "desbloqueado", pause: "pausado", resume: "reanudado" }[action];
      notify("success", `${driver.name} ${label}.`);
      await fetchSnapshot();
    } catch (err) { notify("error", err instanceof Error ? err.message : "Error"); }
    finally { setBusy(false); }
  }

  // Detect new offers → play alert sound
  useEffect(() => {
    if (!snapshot) return;

    const currentOfferedIds = new Set(
      (snapshot.orders ?? [])
        .filter((o) => o.dispatchStatus === "offered")
        .map((o) => o._id)
    );

    if (!initializedRef.current) {
      // First snapshot: register without playing sound
      prevOfferedIdsRef.current = currentOfferedIds;
      initializedRef.current = true;
      return;
    }

    const prevIds = prevOfferedIdsRef.current;
    const newOfferIds = [...currentOfferedIds].filter((id) => !prevIds.has(id));

    if (newOfferIds.length > 0) {
      for (const orderId of newOfferIds) {
        const order = snapshot.orders.find((o) => o._id === orderId);
        if (order) {
          notifyOfferChange(order.orderNumber, order.offerExpiresAt ?? new Date().toISOString());
        }
      }
    }

    prevOfferedIdsRef.current = currentOfferedIds;
  }, [snapshot, notifyOfferChange]);

  const mode = config?.mode ?? "auto";
  const unassignedOrders = (snapshot?.orders ?? []).filter((o) => !o.driverId);
  const assignedOrders = (snapshot?.orders ?? []).filter((o) => o.driverId);
  const selectedOrder = snapshot?.orders.find((o) => o._id === selectedOrderId) ?? null;
  const alertCount = (snapshot?.alerts ?? []).length;
  const hasScheduled = (snapshot?.upcomingScheduled?.length ?? 0) > 0;

  return (
    <div className={`flex h-[calc(100dvh-64px)] min-h-0 flex-col overflow-hidden ${dark ? "dark" : ""}`}>
      {/* ═══ HEADER ═══ */}
      <header className="flex shrink-0 flex-col border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#0d1526]">
        {/* Row 1: Title + Mode + Actions */}
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${modeBanner[mode].dot}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${modeBanner[mode].dot}`} />
            </span>
            <h1 className="text-sm font-bold text-[#09193B] dark:text-white lg:text-base">Dispatch Center</h1>
          </div>

          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
            {(Object.keys(modeMeta) as DispatchMode[]).map((m) => (
              <button key={m} type="button" onClick={() => changeMode(m)} disabled={busy} title={modeMeta[m].hint}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all sm:text-xs ${mode === m ? "bg-white text-[#EB1902] shadow-sm dark:bg-[#EB1902] dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}>
                <span className="hidden sm:inline">{modeMeta[m].label}</span>
                <span className="sm:hidden">{modeMeta[m].abbr}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => setDark((v) => !v)}
              className="hidden h-8 w-8 rounded-lg border-slate-200 p-0 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 md:inline-flex" aria-label="Modo oscuro">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={fetchSnapshot} disabled={loading}
              className="h-8 gap-1.5 rounded-lg border-slate-200 px-2.5 text-xs dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
          </div>
        </div>

        {/* Row 2: KPIs — prominent numbers with labels */}
        <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-1.5 dark:border-white/5">
          {[
            { label: "Sin asignar", value: unassignedOrders.length, color: "text-[#EB1902]", icon: ClipboardList, highlight: true },
            { label: "Ofertas", value: (snapshot?.orders ?? []).filter((o) => o.dispatchStatus === "offered").length, color: "text-amber-600", icon: Clock, highlight: false },
            { label: "Asignados", value: assignedOrders.length, color: "text-emerald-600", icon: CheckCircle2, highlight: false },
            { label: "Disponibles", value: snapshot?.kpis.availableDrivers ?? 0, color: "text-emerald-600", icon: Truck, highlight: false },
            { label: "Ocupados", value: snapshot?.kpis.busyDrivers ?? 0, color: "text-amber-600", icon: Activity, highlight: false },
          ].map((kpi) => (
            <div key={kpi.label} className={`flex items-center gap-1.5 ${kpi.highlight ? "" : "hidden sm:flex"}`}>
              <kpi.icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{kpi.label}</span>
              <span className={`text-sm font-bold ${kpi.color}`}>{kpi.value}</span>
            </div>
          ))}
          <div className="ml-auto hidden items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 lg:flex">
            <Users className="h-3.5 w-3.5" />
            <span>{snapshot?.kpis.connectedDrivers ?? 0}/{snapshot?.kpis.registeredDrivers ?? 0}</span>
            <span>conectados</span>
          </div>
        </div>
      </header>

      {/* ═══ ALERTS / NIP / SCHEDULED — inline bar ═══ */}
      {(alertCount > 0 || hasScheduled) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-1.5 dark:border-white/5 dark:bg-white/[0.02]">
          <NipIncidentsPanel onSelectOrder={(id) => { setSelectedOrderId(id); setAlertsOpen(false); }} notify={notify} />
          {alertCount > 0 && (
            <button type="button" onClick={() => setAlertsOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold transition hover:bg-slate-50 dark:border-white/10 dark:bg-[#0d1526]">
              <BellRing className="h-3.5 w-3.5 text-[#EB1902]" />
              <span className="text-[#09193B] dark:text-white">Alertas</span>
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-500/20 dark:text-red-300">{alertCount}</span>
            </button>
          )}
          {hasScheduled && (
            <span className="flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
              <Clock className="h-3.5 w-3.5" />
              {snapshot!.upcomingScheduled.length} programada{snapshot!.upcomingScheduled.length !== 1 ? "s" : ""}
            </span>
          )}
          {alertsOpen && alertCount > 0 && (
            <div className="w-full space-y-1.5 border-t border-slate-200 pt-2 dark:border-white/10">
              {(snapshot?.alerts ?? []).map((alert) => {
                const style = severityStyle[alert.severity];
                return (
                  <button key={alert.id} type="button"
                    onClick={() => { if (alert.id.startsWith("support-")) { setActiveTab("support"); } else if (alert.orderId) { setSelectedOrderId(alert.orderId); } else if (alert.driverId) { setSelectedDriverId(alert.driverId); } setAlertsOpen(false); }}
                    className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:opacity-90 ${style.chip}`}>
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
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

      {/* ═══ SCHEDULED ORDERS — horizontal scrollable ═══ */}
      {hasScheduled && (
        <UpcomingScheduledPanel orders={snapshot!.upcomingScheduled} onRelease={async (orderId) => {
          setBusy(true);
          try {
            const res = await fetch("/api/admin/delivery-schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "release_reservation", orderId }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Error");
            notify("success", "Reserva liberada.");
            await fetchSnapshot();
          } catch (err) { notify("error", err instanceof Error ? err.message : "Error"); }
          finally { setBusy(false); }
        }} />
      )}

      {/* ═══ ERROR ═══ */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={fetchSnapshot}>Reintentar</Button>
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Tabs */}
        <nav className="flex shrink-0 items-center gap-0.5 border-b border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-[#0d1526]">
          {([
            { key: "ops" as const, label: "Operación", shortLabel: "Ops", icon: Activity },
            { key: "config" as const, label: "Configuración", shortLabel: "Config", icon: Settings2 },
            { key: "history" as const, label: "Historial", icon: History },
            { key: "support" as const, label: "Mensajes", shortLabel: "Chat", icon: MessagesSquare },
          ]).map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${activeTab === tab.key ? "border-[#EB1902] text-[#EB1902]" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}>
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel ?? tab.label}</span>
              {tab.key === "support" && unreadSupportTotal > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EB1902] px-1 text-[9px] font-bold text-white">{unreadSupportTotal}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        {activeTab === "ops" && (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {loading && !snapshot ? (
              <div className="grid w-full grid-cols-1 gap-3 p-3 sm:grid-cols-[1fr_320px] lg:grid-cols-[1.15fr_1fr_0.9fr]">
                <div className="space-y-3"><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-24 w-full rounded-xl" /></div>
                <Skeleton className="h-64 w-full rounded-xl lg:h-full" />
                <div className="hidden space-y-3 lg:block"><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-24 w-full rounded-xl" /></div>
              </div>
            ) : (
              <>
                {/* Desktop/Laptop: side-by-side columns */}
                <div className="hidden w-full min-h-0 grid-cols-[1.15fr_1fr_0.9fr] gap-3 overflow-hidden p-3 sm:grid lg:grid-cols-[1.15fr_1fr_0.9fr]">
                  <OrdersPanel unassigned={unassignedOrders} assigned={assignedOrders} selectedOrderId={selectedOrderId}
                    availableDrivers={snapshot?.kpis.availableDrivers ?? 0} registeredDrivers={snapshot?.kpis.registeredDrivers ?? 0}
                    onSelectOrder={(o) => setSelectedOrderId(o._id)} onUnassign={unassign} onRedispatch={redispatch}
                    onCancelOffer={cancelOffer} onDetails={(o) => setDetailsOrder(o)} mode={mode} />
                  <DispatchMap orders={snapshot?.orders ?? []} stores={snapshot?.stores ?? []} zones={snapshot?.zones ?? []}
                    drivers={snapshot?.drivers ?? []} recommendations={recommendations} selectedOrderId={selectedOrderId}
                    selectedDriverId={selectedDriverId} onSelectOrder={(id) => setSelectedOrderId(id)} onSelectDriver={(id) => setSelectedDriverId(id)} dark={dark} />
                  <DriversPanel drivers={snapshot?.drivers ?? []} selectedDriverId={selectedDriverId} selectedOrder={selectedOrder}
                    recommendations={recommendations} recommendationsLoading={recommendationsLoading} mode={mode}
                    onSelectDriver={(id) => setSelectedDriverId(id)}
                    onAssign={(d) => { if (selectedOrder) openAssignModal(selectedOrder, d); else notify("error", "Selecciona un pedido primero."); }}
                    onDriverControl={driverControl} />
                </div>

                {/* Mobile: stacked with priorities */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:hidden">
                  {/* Priority 1: Orders — full width, always visible */}
                  <div className="min-h-0 flex-1 p-2">
                    <OrdersPanel unassigned={unassignedOrders} assigned={assignedOrders} selectedOrderId={selectedOrderId}
                      availableDrivers={snapshot?.kpis.availableDrivers ?? 0} registeredDrivers={snapshot?.kpis.registeredDrivers ?? 0}
                      onSelectOrder={(o) => setSelectedOrderId(o._id)} onUnassign={unassign} onRedispatch={redispatch}
                      onCancelOffer={cancelOffer} onDetails={(o) => setDetailsOrder(o)} mode={mode} />
                  </div>

                  {/* Priority 2: Drivers — compact summary */}
                  <div className="shrink-0 border-t border-slate-200 p-2 dark:border-white/10">
                    <DriversPanel drivers={snapshot?.drivers ?? []} selectedDriverId={selectedDriverId} selectedOrder={selectedOrder}
                      recommendations={recommendations} recommendationsLoading={recommendationsLoading} mode={mode}
                      onSelectDriver={(id) => setSelectedDriverId(id)}
                      onAssign={(d) => { if (selectedOrder) openAssignModal(selectedOrder, d); else notify("error", "Selecciona un pedido primero."); }}
                      onDriverControl={driverControl} />
                  </div>

                  {/* Priority 3: Map — collapsible */}
                  <div className="shrink-0 border-t border-slate-200 dark:border-white/10">
                    <button type="button" onClick={() => setMapExpanded((v) => !v)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span>Mapa de operación</span>
                      <span className="ml-auto text-slate-400">{mapExpanded ? "▲" : "▼"}</span>
                    </button>
                    {mapExpanded && (
                      <div className="h-[300px]">
                        <DispatchMap orders={snapshot?.orders ?? []} stores={snapshot?.stores ?? []} zones={snapshot?.zones ?? []}
                          drivers={snapshot?.drivers ?? []} recommendations={recommendations} selectedOrderId={selectedOrderId}
                          selectedDriverId={selectedDriverId} onSelectOrder={(id) => setSelectedOrderId(id)} onSelectDriver={(id) => setSelectedDriverId(id)} dark={dark} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "config" && <div className="flex min-h-0 flex-1 overflow-hidden p-3"><ConfigPanel config={config} loading={loading} saving={busy} onSave={saveConfig} /></div>}
        {activeTab === "history" && <div className="flex min-h-0 flex-1 overflow-hidden p-3"><HistoryPanel /></div>}
        {activeTab === "support" && <div className="flex min-h-0 flex-1 overflow-hidden p-3"><DriverSupportPanel drivers={snapshot?.drivers ?? []} busy={busy} onChanged={fetchSnapshot} notify={notify} /></div>}
      </div>

      {/* ═══ MODALS ═══ */}
      <AssignModal draft={assignDraft} busy={busy} onConfirm={confirmAssignment} onCancel={() => setAssignDraft(null)} />
      <OrderDetailsModal order={detailsOrder} onClose={() => setDetailsOrder(null)} />
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[999] flex max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-bottom-3 fade-in duration-200 ${toast.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950 dark:text-emerald-300" : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950 dark:text-red-300"}`} role="status">
          {toast.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
