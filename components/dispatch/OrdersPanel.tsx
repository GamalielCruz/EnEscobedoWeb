"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Ban,
  Clock,
  History,
  MapPin,
  MoreHorizontal,
  Package,
  Pencil,
  RefreshCw,
  Sparkles,
  Store,
  Timer,
  Truck,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWaitingTime, hasActiveOffer, shortOrderCode } from "@/lib/dispatch/dispatch-format";
import type { DispatchMode } from "@/lib/dispatch/dispatch-config";
import type { DispatchOrderCard } from "@/lib/dispatch/dispatch-core";
import {
  DRIVE_MOTION_DURATION,
  DRIVE_MOTION_EASE,
} from "@/components/drive/motion";
import {
  DISPATCH_GHOST_BTN,
  DISPATCH_MUTED,
  DISPATCH_PRIMARY_BTN,
  DISPATCH_TEXT,
  DispatchEmptyState,
  DispatchPanelHeader,
  DispatchSurface,
} from "@/components/dispatch/DispatchCard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  /** IDs de pedidos recién llegados (no vistos antes en esta sesión). */
  newOrderIds?: Set<string>;
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

/** Tono por prioridad. El color se usa para estado, nunca como decoración. */
const priorityTone: Record<
  DispatchOrderCard["priority"],
  { border: string; chip: string; label: string }
> = {
  urgent: {
    border: "border-red-200 dark:border-red-500/30",
    chip: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
    label: "Urgente",
  },
  high: {
    border: "border-amber-200/80 dark:border-amber-500/25",
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    label: "Alta",
  },
  normal: { border: "border-slate-200/80 dark:border-white/10", chip: "", label: "" },
};

function OrderCard({
  order,
  selected,
  isNew,
  onSelect,
  onAction,
  onDetails,
  mode,
  dragDisabled = false,
  availableDrivers = 0,
  registeredDrivers = 0,
}: {
  order: DispatchOrderCard;
  selected: boolean;
  isNew: boolean;
  onSelect: (order: DispatchOrderCard) => void;
  onAction?: (action: "assign" | "unassign" | "redispatch" | "cancel_offer", order: DispatchOrderCard) => void;
  onDetails?: (order: DispatchOrderCard) => void;
  mode: DispatchMode;
  dragDisabled?: boolean;
  availableDrivers?: number;
  registeredDrivers?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(Date.now());
  const isOffered = order.dispatchStatus === "offered";
  const tone = priorityTone[order.priority];
  const isHistorical = order.waitingMinutes >= HISTORICAL_THRESHOLD_MINUTES;

  useEffect(() => {
    if (!isOffered) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [isOffered, order.offerExpiresAt]);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("application/x-elm-dispatch-order", order._id);
    e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  }

  // Estado visual de la card. El pedido NUEVO es el único que "brilla"; el
  // resto usa tono por prioridad y el seleccionado gana con un anillo.
  const stateClass = selected
    ? "border-[#EB1902] ring-2 ring-[#EB1902]/25"
    : isNew
      ? "border-[#EB1902]/40 shadow-[0_1px_10px_rgba(235,25,2,0.12)]"
      : tone.border;

  const originLabel =
    order.serviceKind === "mandado" ? order.mandadoOriginLabel || order.storeName : order.storeName;
  const destLabel =
    order.serviceKind === "mandado" ? order.mandadoDestinationLabel || order.destLabel : order.destLabel;
  const assignLabel = order.serviceKind === "mandado" ? "Ofertar repartidor" : "Asignar repartidor";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DRIVE_MOTION_DURATION.standard, ease: DRIVE_MOTION_EASE.enter }}
    >
    {/* El drag nativo (HTML5) vive en este div: framer-motion se reserva su
        propio onDragStart en motion.*, por eso el wrapper existe. */}
    <div
      draggable={!dragDisabled}
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
      onClick={() => onSelect(order)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(order);
        }
      }}
      className={cn(
        "group cursor-pointer rounded-xl border bg-white p-3 transition-shadow duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EB1902]/40 dark:bg-white/[0.02]",
        stateClass,
        dragging && "opacity-40"
      )}
    >
      {/* ── Cabecera: folio + estado + tiempo ───────────────────────── */}
      <div className="flex items-center gap-2">
        <span className={cn("text-sm font-black tabular-nums", DISPATCH_TEXT)}>
          #{shortOrderCode(order.orderNumber)}
        </span>

        {isNew ? (
          <span className="flex items-center gap-1 rounded-full bg-[#EB1902] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Nuevo pedido
          </span>
        ) : (
          tone.label && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", tone.chip)}>
              {tone.label}
            </span>
          )
        )}

        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
            order.serviceKind === "mandado"
              ? "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
              : "bg-orange-50 text-orange-500 dark:bg-orange-500/15 dark:text-orange-300"
          )}
          title={order.serviceKind === "mandado" ? "Mandado" : "Restaurante"}
        >
          {order.serviceKind === "mandado" ? (
            <Package className="h-3 w-3" />
          ) : (
            <UtensilsCrossed className="h-3 w-3" />
          )}
        </span>

        {isHistorical && (
          <span className="flex items-center gap-0.5 rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:border-white/10 dark:text-slate-400">
            <History className="h-3 w-3" />
            Histórico
          </span>
        )}

        <span className="ml-auto flex items-center gap-1">
          <Timer className="h-3.5 w-3.5 text-slate-400" />
          <span
            className={cn(
              "text-xs font-black tabular-nums",
              order.waitingMinutes >= 20 ? "text-red-600 dark:text-red-400" : DISPATCH_MUTED
            )}
          >
            {formatWaitingTime(order.waitingMinutes)}
          </span>
        </span>
      </div>

      {/* ── Ruta: origen → destino ──────────────────────────────────── */}
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className={cn("truncate font-semibold", DISPATCH_TEXT)}>{originLabel}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className={cn("truncate", DISPATCH_MUTED)}>{destLabel}</span>
      </div>

      {/* ── Datos operativos: distancia · pago · monto ──────────────── */}
      <div className="mt-1 flex items-center gap-2.5 text-[11px]">
        <span className={DISPATCH_MUTED}>
          {order.routeKm != null ? `${order.routeKm} km` : "Sin ruta"}
        </span>
        <span className="text-slate-200 dark:text-white/10">·</span>
        <span
          className={cn(
            "font-semibold",
            order.paymentLabel === "Efectivo"
              ? "text-emerald-600 dark:text-emerald-400"
              : DISPATCH_MUTED
          )}
        >
          {order.paymentLabel}
        </span>
        <span className="text-slate-200 dark:text-white/10">·</span>
        <span className={cn("font-bold tabular-nums", DISPATCH_TEXT)}>
          ${order.totalPrice.toFixed(0)}
        </span>
      </div>

      {/* ── Contexto de asignación / oferta ────────────────────────── */}
      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        {order.driverId ? (
          <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
            <Truck className="h-3 w-3" />
            {order.driverName}
          </span>
        ) : order.recommendedDriverName && order.recommendedScore != null ? (
          <span className="flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-300">
            <Sparkles className="h-3 w-3" />
            {order.recommendedDriverName} · {order.recommendedScore}%
          </span>
        ) : (
          <span className={cn("flex items-center gap-1", DISPATCH_MUTED)}>
            <Sparkles className="h-3 w-3" />
            {registeredDrivers === 0
              ? "Sin repartidores"
              : availableDrivers === 0
                ? "Sin disponibles"
                : "Sin sugerencia"}
          </span>
        )}

        {isOffered && (
          <span
            className={cn(
              "ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
              order.offerStatus === "pending_delivery"
                ? "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                : isOfferExpired(order.offerExpiresAt, now)
                  ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            )}
          >
            <Clock className="h-3 w-3" />
            {order.offerStatus === "pending_delivery"
              ? "Enviada · esperando recepción…"
              : isOfferExpired(order.offerExpiresAt, now)
                ? "Vencida"
                : formatOfferCountdown(order.offerExpiresAt, now)}
          </span>
        )}

        {!isOffered && order.lastOfferStatus && (
          <span
            className={cn(
              "ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
              order.lastOfferStatus === "cancelled" || order.lastOfferStatus === "accepted"
                ? "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"
            )}
          >
            <XCircle className="h-3 w-3" />
            {order.lastOfferStatus === "expired"
              ? "Oferta expirada"
              : order.lastOfferStatus === "rejected"
                ? "Rechazada"
                : order.lastOfferStatus === "cancelled"
                  ? "Cancelada"
                  : "Aceptada"}
          </span>
        )}

        {order.fulfillmentTiming === "scheduled" && order.scheduledSlot?.startAt && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
            <Clock className="h-3 w-3" />
            {new Date(order.scheduledSlot.startAt).toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </span>
        )}
      </div>

      {order.serviceKind === "mandado" &&
        (order.mandadoOriginReference || order.mandadoDestinationReference) && (
          <p
            className="mt-1.5 truncate text-[10px] italic text-slate-400 dark:text-slate-500"
            title="Indicaciones"
          >
            {[order.mandadoOriginReference, order.mandadoDestinationReference]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

      {/* ── Acciones: una principal evidente, el resto discreto ─────── */}
      {onAction && (
        <div className="mt-2.5 flex items-center gap-1.5">
          {isOffered ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction("cancel_offer", order);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancelar oferta
            </button>
          ) : (
            mode !== "auto" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction("assign", order);
                }}
                disabled={Boolean(order.driverId)}
                className={cn(DISPATCH_PRIMARY_BTN, order.driverId && "opacity-40")}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                {order.driverId ? "Asignado" : assignLabel}
              </button>
            )
          )}

          <button type="button" onClick={(e) => { e.stopPropagation(); onDetails?.(order); }} className={DISPATCH_GHOST_BTN}>
            <Pencil className="h-3 w-3" />
            Detalle
          </button>

          {/* Acciones secundarias agrupadas en un menú contextual para que no
              compitan con la acción principal. */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label="Más acciones"
                className={cn(DISPATCH_GHOST_BTN, "ml-auto px-1.5")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1 dark:border-white/10 dark:bg-[#0d1526]">
              {!isOffered && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction("redispatch", order);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reintentar despacho
                </button>
              )}
              {order.driverId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction("unassign", order);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Ban className="h-3.5 w-3.5" />
                  Liberar pedido
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
    </motion.div>
  );
}

export function OrdersPanel({
  unassigned,
  assigned,
  selectedOrderId,
  availableDrivers,
  registeredDrivers,
  onSelectOrder,
  onUnassign,
  onRedispatch,
  onCancelOffer,
  onDetails,
  mode,
  newOrderIds,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"pendientes" | "ofertas" | "asignados">("pendientes");

  // "Ofertas" solo cuenta ofertas ACTIVAS (pendientes de respuesta).
  const offered = useMemo(
    () =>
      unassigned.filter(
        (o) =>
          hasActiveOffer(o) &&
          (o.offerStatus === "pending_delivery" || !isOfferExpired(o.offerExpiresAt, Date.now()))
      ),
    [unassigned]
  );
  const waiting = useMemo(() => unassigned.filter((o) => !offered.includes(o)), [unassigned, offered]);
  // Orden de la cola: recién llegados primero, luego prioridad y tiempo de
  // espera. Así el pedido nuevo aparece inmediatamente al inicio.
  const waitingSorted = useMemo(() => {
    const rank: Record<DispatchOrderCard["priority"], number> = { urgent: 0, high: 1, normal: 2 };
    return [...waiting].sort((a, b) => {
      const an = newOrderIds?.has(a._id) ? 1 : 0;
      const bn = newOrderIds?.has(b._id) ? 1 : 0;
      if (an !== bn) return bn - an;
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      return b.waitingMinutes - a.waitingMinutes;
    });
  }, [waiting, newOrderIds]);

  const newCount = newOrderIds ? waiting.filter((o) => newOrderIds.has(o._id)).length : 0;
  const visible = tab === "pendientes" ? waitingSorted : tab === "ofertas" ? offered : assigned;

  const tabs = [
    { key: "pendientes" as const, label: "Sin asignar", count: waiting.length },
    { key: "ofertas" as const, label: "Ofertas", count: offered.length },
    { key: "asignados" as const, label: "Asignados", count: assigned.length },
  ];

  return (
    <DispatchSurface>
      <DispatchPanelHeader
        icon={Package}
        title="Cola de pedidos"
        count={unassigned.length}
        subtitle={
          mode === "auto"
            ? "Despacho automático"
            : mode === "assisted"
              ? "Selecciona un pedido para ver recomendaciones"
              : "Asignación manual"
        }
        action={
          newCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                setTab("pendientes");
                scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="shrink-0 rounded-full bg-[#EB1902] px-2 py-0.5 text-[10px] font-black text-white"
            >
              {newCount} nuevo{newCount !== 1 ? "s" : ""}
            </button>
          ) : undefined
        }
      />

      {/* Segmentos sobrios, sin barra propia compitiendo con la cabecera. */}
      <div className="flex shrink-0 items-center gap-1 px-3 py-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition",
              tab === t.key
                ? "bg-slate-100 text-[#09193B] dark:bg-white/10 dark:text-white"
                : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            )}
          >
            {t.label}
            <span
              className={cn(
                "tabular-nums",
                tab === t.key ? "text-[#09193B] dark:text-white" : "text-slate-400"
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 pb-3">
        {visible.length === 0 ? (
          <DispatchEmptyState
            icon={Package}
            title="No hay pedidos pendientes"
            description={
              tab === "ofertas"
                ? "Las ofertas enviadas por WhatsApp aparecerán aquí con su cuenta regresiva."
                : tab === "asignados"
                  ? "Los pedidos asignados a un repartidor aparecerán aquí."
                  : "Los nuevos pedidos aparecerán aquí en tiempo real."
            }
          />
        ) : (
          <AnimatePresence initial={false}>
            {visible.map((order) => (
              <OrderCard
                key={order._id}
                order={order}
                selected={selectedOrderId === order._id}
                isNew={Boolean(newOrderIds?.has(order._id)) && tab === "pendientes"}
                onSelect={onSelectOrder}
                mode={mode}
                dragDisabled={tab === "asignados" || order.dispatchStatus === "offered"}
                onDetails={onDetails}
                availableDrivers={availableDrivers}
                registeredDrivers={registeredDrivers}
                onAction={(action, o) => {
                  if (action === "unassign") onUnassign(o);
                  else if (action === "redispatch") onRedispatch(o);
                  else if (action === "cancel_offer") onCancelOffer(o);
                  else if (action === "assign") onSelectOrder(o);
                }}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </DispatchSurface>
  );
}
