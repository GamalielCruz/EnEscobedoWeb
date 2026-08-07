"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Clock,
  GripVertical,
  MapPin,
  Package,
  RefreshCw,
  Sparkles,
  Store,
  Timer,
  Truck,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
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
  onDetails: (order: DispatchOrderCard) => void;
  mode: DispatchMode;
};

const priorityStyles: Record<DispatchOrderCard["priority"], { ring: string; chip: string; label: string }> = {
  urgent: {
    ring: "border-red-500/70 shadow-[0_0_0_1px_rgba(239,68,68,0.35),0_4px_14px_rgba(239,68,68,0.15)]",
    chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    label: "Urgente",
  },
  high: {
    ring: "border-amber-400/70",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    label: "Alta",
  },
  normal: {
    ring: "border-slate-200 dark:border-white/10",
    chip: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
    label: "Normal",
  },
};

function OrderCard({
  order,
  selected,
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
  onSelect: (order: DispatchOrderCard) => void;
  onAction?: (action: "assign" | "unassign" | "redispatch", order: DispatchOrderCard) => void;
  onDetails?: (order: DispatchOrderCard) => void;
  mode: DispatchMode;
  dragDisabled?: boolean;
  availableDrivers?: number;
  registeredDrivers?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const style = priorityStyles[order.priority];

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("application/x-elm-dispatch-order", order._id);
    e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  }

  return (
    <div
      draggable={!dragDisabled}
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
      onClick={() => onSelect(order)}
      className={cn(
        "group cursor-pointer rounded-xl border-2 bg-white p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg dark:bg-[#0d1526]",
        style.ring,
        selected && "ring-2 ring-[#EB1902]",
        dragging && "opacity-40"
      )}
    >
      <div className="flex items-center gap-2">
        {!dragDisabled && (
          <GripVertical className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
        )}
        <span className="text-sm font-black text-[#09193B] dark:text-white">Pedido #{shortOrderCode(order.orderNumber)}</span>
        <span
          className={cn(
            "ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
            order.serviceKind === "mandado"
              ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
              : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
          )}
        >
          {order.serviceKind === "mandado" ? <Package className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
          {order.serviceKind === "mandado" ? "Mandado" : "Restaurante"}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", style.chip)}>{style.label}</span>
      </div>

      <div className="mt-2 space-y-1.5 pl-6 text-xs text-slate-600 dark:text-slate-400">
        <p className="flex items-center gap-1.5 font-medium text-[#09193B] dark:text-slate-200">
          <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{order.storeName}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{order.destLabel}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          <span className="flex items-center gap-1">
            <Timer className="h-3.5 w-3.5 text-slate-400" />
            <span className={cn("font-semibold", order.waitingMinutes >= 20 ? "text-red-600 dark:text-red-400" : "")}>
              {formatWaitingTime(order.waitingMinutes)}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            {order.routeKm != null ? `${order.routeKm} km` : "s/ruta"}
          </span>
          <span className="flex items-center gap-1">
            <Banknote className="h-3.5 w-3.5 text-slate-400" />
            ${order.totalPrice.toFixed(2)}
          </span>
          <span className={cn("font-semibold", order.paymentLabel === "Efectivo" ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500")}>
            {order.paymentLabel}
          </span>
        </div>
        {/* Repartidor recomendado (misma lógica de dispatch) o asignado */}
        {order.driverId ? (
          <p className="mt-1 flex items-center gap-1.5 pl-6 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <Truck className="h-3 w-3 shrink-0" />
            {order.driverName ?? "Repartidor asignado"}
          </p>
        ) : order.recommendedDriverName && order.recommendedScore != null ? (
          <p className="mt-1 flex items-center gap-1.5 pl-6 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
            <Sparkles className="h-3 w-3 shrink-0" />
            Rec: {order.recommendedDriverName} · {order.recommendedScore}%
          </p>
        ) : (
          /* Sin candidatos: la razón proviene de datos reales del snapshot
             (nunca se inventa un porcentaje ni un repartidor). */
          <p className="mt-1 flex items-center gap-1.5 pl-6 text-[11px] text-slate-400 dark:text-slate-500">
            <Sparkles className="h-3 w-3 shrink-0" />
            {registeredDrivers === 0
              ? "No hay repartidores registrados"
              : availableDrivers === 0
                ? "No hay repartidores disponibles ahora"
                : "No hay recomendación disponible"}
          </p>
        )}
        {order.fulfillmentTiming === "scheduled" && order.scheduledSlot?.startAt && (
          <p className="flex items-center gap-1.5 text-[11px] text-violet-600 dark:text-violet-400">
            <Clock className="h-3 w-3" />
            Programado ·{" "}
            {new Date(order.scheduledSlot.startAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </p>
        )}
      </div>

      {onAction && (
        <div className="mt-2.5 flex items-center gap-1.5 pl-6">
          {mode !== "auto" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction("assign", order);
              }}
              className="flex items-center gap-1 rounded-md bg-[#EB1902] px-2 py-1 text-[10px] font-bold text-white transition hover:bg-[#c81502]"
            >
              <ArrowRight className="h-3 w-3" />
              Asignar
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction("redispatch", order);
            }}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <RefreshCw className="h-3 w-3" />
            Reintentar algoritmo
          </button>
          {order.driverId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction("unassign", order);
              }}
              className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <XCircle className="h-3 w-3" />
              Liberar
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDetails?.(order);
            }}
            className="ml-auto text-[10px] font-semibold text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
          >
            Ver detalles
          </button>
        </div>
      )}
    </div>
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
  onDetails,
  mode,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"pendientes" | "asignados">("pendientes");

  const unassignedSorted = useMemo(
    () => [...unassigned].sort((a, b) => b.waitingMinutes - a.waitingMinutes),
    [unassigned]
  );

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-black/6 bg-white shadow-[0_1px_3px_rgba(9,25,59,0.06)] dark:border-white/10 dark:bg-[#0d1526]">
      <div className="flex items-center gap-1 border-b border-black/6 px-3 py-2 dark:border-white/10">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
          {(["pendientes", "asignados"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-bold transition-all",
                tab === t ? "bg-white text-[#09193B] shadow-sm dark:bg-[#EB1902] dark:text-white" : "text-slate-500 dark:text-slate-400"
              )}
            >
              {t === "pendientes" ? `Sin asignar · ${unassigned.length}` : `Asignados · ${assigned.length}`}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {mode === "auto" ? "Cola automática" : mode === "assisted" ? "Selecciona para recomendar" : "Asignación manual"}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {(tab === "pendientes" ? unassignedSorted : assigned).length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-14 text-center">
            <Package className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
              {tab === "pendientes" ? "No hay pedidos sin asignar." : "No hay pedidos asignados."}
            </p>
            <p className="max-w-[220px] text-[11px] text-slate-400/80 dark:text-slate-600">
              Los nuevos pedidos aparecerán aquí en tiempo real.
            </p>
          </div>
        ) : (
          (tab === "pendientes" ? unassignedSorted : assigned).map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              selected={selectedOrderId === order._id}
              onSelect={onSelectOrder}
              mode={mode}
              dragDisabled={tab === "asignados"}
              onDetails={onDetails}
              availableDrivers={availableDrivers}
              registeredDrivers={registeredDrivers}
              onAction={(action, o) => {
                if (action === "unassign") onUnassign(o);
                else if (action === "redispatch") onRedispatch(o);
                else if (action === "assign") {
                  // Asignar: se selecciona el pedido; el operador elige repartidor
                  onSelectOrder(o);
                }
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
