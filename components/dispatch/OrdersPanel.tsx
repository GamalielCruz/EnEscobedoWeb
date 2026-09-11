"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Banknote, Clock, GripVertical, History, MapPin, Package, RefreshCw, Sparkles, Store, Timer, Truck, UtensilsCrossed, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWaitingTime, shortOrderCode } from "@/lib/dispatch/dispatch-format";
import type { DispatchMode } from "@/lib/dispatch/dispatch-config";
import type { DispatchOrderCard } from "@/lib/dispatch/dispatch-core";

type Props = {
  unassigned: DispatchOrderCard[];
  assigned: DispatchOrderCard[];
  selectedOrderId: string | null;
  availableDrivers: number;
  registeredDrivers: number;
  onSelectOrder: (order: DispatchOrderCard) => void;
  onUnassign: (order: DispatchOrderCard) => void;
  onRedispatch: (order: DispatchOrderCard) => void;
  onCancelOffer: (order: DispatchOrderCard) => void;
  onDetails: (order: DispatchOrderCard) => void;
  mode: DispatchMode;
};

const HISTORICAL_THRESHOLD_MINUTES = 24 * 60;

function formatOfferCountdown(expiresAt: string | null | undefined, nowMs: number) {
  if (!expiresAt) return "00:00";
  const remainingSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - nowMs) / 1000));
  return `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;
}

function isOfferExpired(expiresAt: string | null | undefined, nowMs: number) {
  return expiresAt ? new Date(expiresAt).getTime() <= nowMs : false;
}

const priorityStyles: Record<DispatchOrderCard["priority"], { border: string; badge: string; label: string }> = {
  urgent: { border: "border-l-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300", label: "Urgente" },
  high: { border: "border-l-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", label: "Alta" },
  normal: { border: "border-l-slate-200 dark:border-l-white/10", badge: "", label: "" },
};

function OrderCard({ order, selected, onSelect, onAction, onDetails, mode, dragDisabled = false, availableDrivers = 0, registeredDrivers = 0 }: {
  order: DispatchOrderCard; selected: boolean; onSelect: (order: DispatchOrderCard) => void;
  onAction?: (action: "assign" | "unassign" | "redispatch" | "cancel_offer", order: DispatchOrderCard) => void;
  onDetails?: (order: DispatchOrderCard) => void; mode: DispatchMode; dragDisabled?: boolean; availableDrivers?: number; registeredDrivers?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(Date.now());
  const isOffered = order.dispatchStatus === "offered";
  useEffect(() => { if (!isOffered) return; const tick = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(tick); }, [isOffered, order.offerExpiresAt]);
  const style = priorityStyles[order.priority];

  function handleDragStart(e: React.DragEvent) { e.dataTransfer.setData("application/x-elm-dispatch-order", order._id); e.dataTransfer.effectAllowed = "move"; setDragging(true); }

  return (
    <div draggable={!dragDisabled} onDragStart={handleDragStart} onDragEnd={() => setDragging(false)} onClick={() => onSelect(order)}
      className={cn("group cursor-pointer border-l-4 bg-white transition-all duration-150 hover:shadow-md dark:bg-[#0d1526]", style.border, selected && "ring-2 ring-[#EB1902] shadow-md", dragging && "opacity-40", "rounded-r-lg border border-slate-200 border-l-0 dark:border-white/10 dark:border-l-0")}>

      {/* ROW 1: ID + Priority badge + Time (right) */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        {!dragDisabled && <GripVertical className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />}
        <span className="text-base font-bold text-[#09193B] dark:text-white">#{shortOrderCode(order.orderNumber)}</span>
        {style.label && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", style.badge)}>{style.label}</span>}
        <span className={cn("flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
          order.serviceKind === "mandado" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300")}>
          {order.serviceKind === "mandado" ? <Package className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
          <span className="hidden sm:inline">{order.serviceKind === "mandado" ? "Mandado" : "Rest."}</span>
        </span>
        {order.waitingMinutes >= HISTORICAL_THRESHOLD_MINUTES && (
          <span className="flex items-center gap-0.5 rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:border-white/10 dark:text-slate-400">
            <History className="h-3 w-3" /><span className="hidden sm:inline">Histórico</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm">
            <Timer className="h-4 w-4 text-slate-400" />
            <span className={cn("font-bold", order.waitingMinutes >= 20 ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400")}>
              {formatWaitingTime(order.waitingMinutes)}
            </span>
          </span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="flex items-center gap-1 font-bold text-[#09193B] dark:text-white">
            <Banknote className="h-4 w-4 text-slate-400" />${order.totalPrice.toFixed(0)}
          </span>
        </div>
      </div>

      {/* ROW 2: Store → Destination */}
      <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-slate-600 dark:text-slate-400">
        <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate font-medium text-[#09193B] dark:text-slate-200">
          {order.serviceKind === "mandado" ? (order.mandadoOriginLabel || order.storeName) : order.storeName}
        </span>
        <ArrowRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate">{order.serviceKind === "mandado" ? (order.mandadoDestinationLabel || order.destLabel) : order.destLabel}</span>
        {order.routeKm != null && <span className="ml-auto shrink-0 text-[10px] text-slate-400">{order.routeKm} km</span>}
        <span className={cn("text-[10px] font-semibold", order.paymentLabel === "Efectivo" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400")}>{order.paymentLabel}</span>
      </div>

      {/* ROW 3: Driver / Recommendation / Offer status */}
      <div className="flex items-center gap-2 px-3 py-1 text-[11px]">
        {order.driverId ? (
          <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"><Truck className="h-3 w-3" />{order.driverName}</span>
        ) : order.recommendedDriverName && order.recommendedScore != null ? (
          <span className="flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-300"><Sparkles className="h-3 w-3" />{order.recommendedDriverName} · {order.recommendedScore}%</span>
        ) : (
          <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500"><Sparkles className="h-3 w-3" />{registeredDrivers === 0 ? "Sin repartidores" : availableDrivers === 0 ? "Sin disponibles" : "—"}</span>
        )}
        {isOffered && (
          <span className={cn("ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
            isOfferExpired(order.offerExpiresAt, now) ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300")}>
            <Clock className="h-3 w-3" />{isOfferExpired(order.offerExpiresAt, now) ? "Vencida" : formatOfferCountdown(order.offerExpiresAt, now)}
          </span>
        )}
        {order.fulfillmentTiming === "scheduled" && order.scheduledSlot?.startAt && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400">
            <Clock className="h-3 w-3" />{new Date(order.scheduledSlot.startAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
        )}
        {order.serviceKind === "mandado" && (order.mandadoOriginReference || order.mandadoDestinationReference) && (
          <span className="ml-auto truncate text-[10px] italic text-slate-400 dark:text-slate-500" title="Indicaciones">
            💬 {[order.mandadoOriginReference, order.mandadoDestinationReference].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {/* ROW 4: Actions */}
      {onAction && (
        <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 dark:border-white/5">
          {mode !== "auto" && !isOffered && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAction("assign", order); }}
              className="flex items-center gap-1 rounded-md bg-[#EB1902] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#c81502]">
              <ArrowRight className="h-3 w-3" />{order.serviceKind === "mandado" ? "Ofertar" : "Asignar"}
            </button>
          )}
          {isOffered && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAction("cancel_offer", order); }}
              className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              <XCircle className="h-3 w-3" />Cancelar oferta
            </button>
          )}
          {!isOffered && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAction("redispatch", order); }}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
              <RefreshCw className="h-3 w-3" />Reintentar
            </button>
          )}
          {order.driverId && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAction("unassign", order); }}
              className="flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400">
              <XCircle className="h-3 w-3" />Liberar
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onDetails?.(order); }}
            className="ml-auto text-[11px] font-semibold text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200">Ver detalles</button>
        </div>
      )}
    </div>
  );
}

export function OrdersPanel({ unassigned, assigned, selectedOrderId, availableDrivers, registeredDrivers, onSelectOrder, onUnassign, onRedispatch, onCancelOffer, onDetails, mode }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"pendientes" | "ofertas" | "asignados">("pendientes");
  const offered = useMemo(() => unassigned.filter((o) => o.dispatchStatus === "offered"), [unassigned]);
  const waiting = useMemo(() => unassigned.filter((o) => o.dispatchStatus !== "offered"), [unassigned]);
  const waitingSorted = useMemo(() => [...waiting].sort((a, b) => b.waitingMinutes - a.waitingMinutes), [waiting]);

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0d1526]">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#0d1526]">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
          {(["pendientes", "ofertas", "asignados"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn("rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all",
                tab === t ? "bg-white text-[#09193B] shadow-sm dark:bg-[#EB1902] dark:text-white" : "text-slate-500 dark:text-slate-400")}>
              {t === "pendientes" ? `Sin asignar · ${waiting.length}` : t === "ofertas" ? `Ofertas · ${offered.length}` : `Asignados · ${assigned.length}`}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] font-semibold text-slate-400 dark:text-slate-500">
          {mode === "auto" ? "Cola automática" : mode === "assisted" ? "Selecciona para recomendar" : "Asignación manual"}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
        {(tab === "pendientes" ? waitingSorted : tab === "ofertas" ? offered : assigned).length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-14 text-center">
            <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
              {tab === "pendientes" ? "No hay pedidos sin asignar." : tab === "ofertas" ? "No hay ofertas enviadas." : "No hay pedidos asignados."}
            </p>
            <p className="max-w-[240px] text-xs text-slate-400/80 dark:text-slate-600">
              {tab === "ofertas" ? "Las ofertas enviadas por WhatsApp aparecerán aquí con su countdown." : "Los nuevos pedidos aparecerán aquí en tiempo real."}
            </p>
          </div>
        ) : (
          (tab === "pendientes" ? waitingSorted : tab === "ofertas" ? offered : assigned).map((order) => (
            <OrderCard key={order._id} order={order} selected={selectedOrderId === order._id} onSelect={onSelectOrder} mode={mode}
              dragDisabled={tab === "asignados" || order.dispatchStatus === "offered"} onDetails={onDetails}
              availableDrivers={availableDrivers} registeredDrivers={registeredDrivers}
              onAction={(action, o) => { if (action === "unassign") onUnassign(o); else if (action === "redispatch") onRedispatch(o); else if (action === "cancel_offer") onCancelOffer(o); else if (action === "assign") onSelectOrder(o); }} />
          ))
        )}
      </div>
    </div>
  );
}
