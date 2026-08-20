"use client";

import {
  CalendarClock,
  Clock,
  Package,
  Truck,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";
import type { UpcomingScheduledCard } from "@/lib/dispatch/dispatch-core";

type Props = {
  orders: UpcomingScheduledCard[];
  onRelease?: (orderId: string) => void;
};

const riskStyles: Record<string, { chip: string; label: string }> = {
  none: { chip: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400", label: "Normal" },
  watch: { chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300", label: "Vigilar" },
  risk: { chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", label: "Riesgo" },
  alert: { chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300", label: "Alerta" },
  contingency: { chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300", label: "Contingencia" },
};

function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Mexico_City",
  });
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "America/Mexico_City",
  });
}

function timeUntil(iso?: string | null): string {
  if (!iso) return "";
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs < 0) return "Entrando ahora";
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `En ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins === 0 ? `En ${hours} h` : `En ${hours} h ${mins} min`;
}

export function UpcomingScheduledPanel({ orders, onRelease }: Props) {
  if (orders.length === 0) return null;

  const now = Date.now();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));

  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now + 86_400_000));

  function dateKey(iso?: string | null): string {
    if (!iso) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  }

  const entries = orders.map((order) => {
    const dk = dateKey(order.scheduledDispatchAt);
    let group: string;
    if (dk === today) group = "Hoy";
    else if (dk === tomorrow) group = "Mañana";
    else group = formatDate(order.scheduledDispatchAt);
    return { order, group };
  });

  // Agrupar por fecha
  const grouped = entries.reduce<Record<string, typeof entries>>((acc, entry) => {
    (acc[entry.group] ??= []).push(entry);
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-violet-200/60 bg-violet-50/40 shadow-[0_1px_3px_rgba(139,92,246,0.06)] dark:border-violet-500/20 dark:bg-violet-500/5">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-violet-200/40 px-4 py-2.5 dark:border-violet-500/15">
        <CalendarClock className="h-4 w-4 text-violet-500 dark:text-violet-400" />
        <span className="text-xs font-bold text-violet-800 dark:text-violet-300">
          Próximas programadas
        </span>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
          {orders.length}
        </span>
        <span className="ml-auto text-[10px] font-medium text-violet-400 dark:text-violet-500">
          Entrarán automáticamente a Dispatch
        </span>
      </div>

      {/* Content */}
      <div className="max-h-[280px] overflow-y-auto p-2.5">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="mb-2.5 last:mb-0">
            <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-violet-400 dark:text-violet-500">
              {group}
            </p>
            <div className="space-y-2">
              {items.map(({ order }) => {
                const risk = riskStyles[order.scheduleRiskLevel ?? "none"] ?? riskStyles.none;
                const hasDriver = Boolean(order.driverId || order.preassignedDriverId);
                const timeLabel = timeUntil(order.scheduledDispatchAt);

                return (
                  <div
                    key={order._id}
                    className="group rounded-lg border border-violet-100 bg-white p-2.5 transition hover:shadow-sm dark:border-violet-500/15 dark:bg-[#0d1526]"
                  >
                    {/* Row 1: Order number + badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-[#09193B] dark:text-white">
                        #{shortOrderCode(order.orderNumber)}
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                          order.serviceKind === "mandado"
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
                        )}
                      >
                        {order.serviceKind === "mandado" ? (
                          <Package className="h-3 w-3" />
                        ) : (
                          <UtensilsCrossed className="h-3 w-3" />
                        )}
                        {order.serviceKind === "mandado" ? "Mandado" : "Restaurante"}
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", risk.chip)}>
                        {risk.label}
                      </span>
                      {order.customerHelpRequested && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-500/20 dark:text-red-400">
                          Ayuda
                        </span>
                      )}
                    </div>

                    {/* Row 2: Store + destination */}
                    <div className="mt-1.5 space-y-0.5 pl-6 text-[11px] text-slate-600 dark:text-slate-400">
                      <p className="font-medium text-[#09193B] dark:text-slate-200">
                        {order.storeName}
                      </p>
                      <p className="truncate">{order.destLabel}</p>
                    </div>

                    {/* Row 3: Timing details */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[11px]">
                      <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                        <Clock className="h-3 w-3" />
                        Entrega: {formatTime(order.scheduledSlot?.startAt)}–{formatTime(order.scheduledSlot?.endAt)}
                      </span>
                      <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                        <Clock className="h-3 w-3" />
                        Entra a Dispatch: {formatTime(order.scheduledDispatchAt)}
                      </span>
                    </div>

                    {/* Row 4: Driver + countdown */}
                    <div className="mt-1.5 flex items-center gap-3 pl-6 text-[11px]">
                      {hasDriver ? (
                        <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                          <Truck className="h-3 w-3" />
                          {order.driverName}
                        </span>
                      ) : order.preassignedDriverName ? (
                        <span className="flex items-center gap-1 font-semibold text-violet-600 dark:text-violet-400">
                          <Truck className="h-3 w-3" />
                          {order.preassignedDriverName}
                          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
                            Reserva
                          </span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                          <Truck className="h-3 w-3" />
                          Sin asignar
                        </span>
                      )}
                      {timeLabel && (
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                            timeLabel === "Entrando ahora"
                              ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                              : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                          )}
                        >
                          {timeLabel}
                        </span>
                      )}
                    </div>

                    {/* Banner */}
                    <div className="mt-2 rounded-md bg-violet-50/80 px-2.5 py-1.5 text-[10px] font-medium text-violet-500 dark:bg-violet-500/10 dark:text-violet-400">
                      {order.preassignedDriverName
                        ? `Repartidor confirmado cuando inicie el despacho a las ${formatTime(order.scheduledDispatchAt)}`
                        : `Entrará automáticamente a Dispatch${order.scheduledDispatchAt ? ` a las ${formatTime(order.scheduledDispatchAt)}` : ""}`}
                    </div>
                    {/* Release button for preassigned */}
                    {order.preassignedDriverName && onRelease && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRelease(order._id);
                        }}
                        className="mt-1.5 flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                      >
                        <XCircle className="h-3 w-3" />
                        Liberar reserva
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
