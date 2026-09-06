"use client";

import { CalendarClock, Clock, Package, Truck, UtensilsCrossed, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";
import type { UpcomingScheduledCard } from "@/lib/dispatch/dispatch-core";

type Props = { orders: UpcomingScheduledCard[]; onRelease?: (orderId: string) => void };

function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" });
}

function timeUntil(iso?: string | null): string {
  if (!iso) return "";
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs < 0) return "Ahora";
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export function UpcomingScheduledPanel({ orders, onRelease }: Props) {
  if (orders.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#0d1526]">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-1.5 dark:border-white/5">
        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-400" />
        <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Programadas</span>
        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">{orders.length}</span>
        <span className="ml-auto text-[10px] text-violet-400 dark:text-violet-500">Entra automáticamente a Dispatch</span>
      </div>

      <div className="max-h-[120px] overflow-y-auto px-4 py-2 sm:max-h-[200px]">
        {orders.map((order) => {
          const timeLabel = timeUntil(order.scheduledDispatchAt);
          const hasPreassigned = Boolean(order.preassignedDriverId);
          return (
            <div key={order._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-50 py-1.5 text-xs last:border-0 dark:border-white/5">
              <span className="font-bold text-[#09193B] dark:text-white">#{shortOrderCode(order.orderNumber)}</span>
              <span className={cn("flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                order.serviceKind === "mandado" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300")}>
                {order.serviceKind === "mandado" ? <Package className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
                <span className="hidden sm:inline">{order.serviceKind === "mandado" ? "Mandado" : "Rest."}</span>
              </span>
              <span className="hidden truncate font-medium text-[#09193B] dark:text-slate-200 sm:inline max-w-[120px]">{order.storeName}</span>
              <span className="flex items-center gap-0.5 text-violet-600 dark:text-violet-400">
                <Clock className="h-3 w-3" />{formatTime(order.scheduledSlot?.startAt)}–{formatTime(order.scheduledSlot?.endAt)}
              </span>
              <span className="hidden items-center gap-0.5 text-sky-600 dark:text-sky-400 sm:flex">
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <Clock className="h-3 w-3" />Disp: {formatTime(order.scheduledDispatchAt)}
              </span>
              {hasPreassigned || order.driverId ? (
                <span className="flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                  <Truck className="h-3 w-3" />{order.preassignedDriverName || order.driverName}
                  {hasPreassigned && <span className="rounded bg-violet-100 px-1 text-[8px] font-bold text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">Res.</span>}
                </span>
              ) : <span className="text-slate-400 dark:text-slate-500">Sin asignar</span>}
              {timeLabel && (
                <span className={cn("ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold",
                  timeLabel === "Ahora" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400")}>
                  {timeLabel}
                </span>
              )}
              {hasPreassigned && onRelease && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onRelease(order._id); }}
                  className="rounded border border-slate-200 p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-white/10 dark:hover:bg-white/5" title="Liberar reserva">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
