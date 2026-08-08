"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Award,
  Battery,
  Ban,
  CircleDollarSign,
  Clock,
  Hand,
  Info,
  MapPin,
  Package,
  PauseCircle,
  Phone,
  PlayCircle,
  Sparkles,
  Star,
  Timer,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactDuration, formatRelativeTime, shortOrderCode } from "@/lib/dispatch/dispatch-format";
import type { DispatchMode } from "@/lib/dispatch/dispatch-config";
import type { DispatchDriverCard, DispatchOrderCard, DriverRecommendation } from "@/lib/dispatch/dispatch-core";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  drivers: DispatchDriverCard[];
  selectedDriverId: string | null;
  selectedOrder: DispatchOrderCard | null;
  recommendations: DriverRecommendation[];
  recommendationsLoading: boolean;
  mode: DispatchMode;
  onSelectDriver: (id: string) => void;
  onAssign: (driver: DispatchDriverCard) => void;
  onDriverControl: (driver: DispatchDriverCard, action: "block" | "unblock" | "pause" | "resume") => void;
};

const estadoMeta: Record<DispatchDriverCard["estado"], { label: string; dot: string; chip: string }> = {
  available: {
    label: "Disponible",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  busy: {
    label: "En ruta",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  },
  offer_pending: {
    label: "Oferta pendiente",
    dot: "bg-sky-500",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  },
  paused: {
    label: "Pausado",
    dot: "bg-slate-500",
    chip: "bg-slate-200 text-slate-700 dark:bg-white/15 dark:text-slate-200",
  },
  offline: {
    label: "Desconectado",
    dot: "bg-slate-400",
    chip: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400",
  },
  blocked: {
    label: "Bloqueado",
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  },
};

function formatDistanceEta(rec: DriverRecommendation | null | undefined): string {
  if (!rec) return "Sin estimar";
  const distance = rec.distanceKm != null ? `${rec.distanceKm} km` : "Ubicación no disponible";
  const eta = rec.estimatedMinutes != null ? `${rec.estimatedMinutes} min` : "Sin estimar";
  return `${distance} · ${eta}`;
}

function DriverCard({
  driver,
  selected,
  selectedOrder,
  recommendation,
  isTopRec,
  onSelect,
  onAssign,
  onDriverControl,
  expanded,
  onToggleExpand,
  onDrop,
  isDropTarget,
  onDragOver,
  onDragLeave,
}: {
  driver: DispatchDriverCard;
  selected: boolean;
  selectedOrder: DispatchOrderCard | null;
  recommendation?: DriverRecommendation | null;
  isTopRec: boolean;
  onSelect: () => void;
  onAssign: () => void;
  onDriverControl: (action: "block" | "unblock" | "pause" | "resume") => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onDrop: () => void;
  isDropTarget: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
}) {
  const meta = estadoMeta[driver.estado];
  const initials = driver.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div
      onClick={onSelect}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "cursor-pointer rounded-xl border-2 bg-white p-3 transition-all duration-150 dark:bg-[#0d1526]",
        isDropTarget
          ? "border-[#EB1902] bg-rose-50/60 shadow-[0_0_0_2px_rgba(235,25,2,0.35)] dark:bg-rose-500/10"
          : selected
            ? "border-[#EB1902] ring-2 ring-[#EB1902]/30"
            : isTopRec
              ? "border-emerald-400/70 dark:border-emerald-500/40"
              : "border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/25",
        driver.bloqueado && "opacity-70"
      )}
    >
      <div className="flex items-center gap-2.5">
        {driver.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driver.fotoUrl}
            alt={driver.name}
            className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-white/10"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#EB1902] to-[#850C22] text-sm font-bold text-white">
            {initials || "R"}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-[#09193B] dark:text-white">{driver.name}</p>
            {driver.prioridad > 0 && (
              <Award className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label={`Prioridad ${driver.prioridad}`} />
            )}
            {driver.rating != null && (
              <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {driver.rating.toFixed(1)}
              </span>
            )}
            {isTopRec && (
              <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                Mejor
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold", meta.chip)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </span>
            {driver.storeName && (
              <span className="truncate text-[10px] text-slate-400 dark:text-slate-500">{driver.storeName}</span>
            )}
          </div>
        </div>

        {recommendation && (
          <div className="flex shrink-0 flex-col items-center rounded-lg bg-emerald-50 px-2 py-1 dark:bg-emerald-500/15">
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{recommendation.score}%</span>
            <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600/70 dark:text-emerald-400/70">
              Match
            </span>
          </div>
        )}
      </div>

      {/* Recomendación: motivos */}
      {recommendation && recommendation.reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-[50px]">
          {recommendation.reasons.map((reason) => (
            <span
              key={reason}
              className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400"
            >
              {reason}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <Package className="h-3 w-3 text-slate-400" />
          {driver.activeOrders.length} pedido{driver.activeOrders.length !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          <CircleDollarSign className="h-3 w-3 text-slate-400" />
          ${driver.pendingCash.toFixed(2)}
        </span>
        <span className="flex items-center gap-1">
          <Timer className="h-3 w-3 text-slate-400" />
          {formatCompactDuration(driver.connectedMinutes)}
        </span>
      </div>

      {recommendation && selectedOrder && (
        <p className="mt-1.5 flex items-center gap-1.5 pl-[50px] text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          <MapPin className="h-3 w-3 text-slate-400" />
          {formatDistanceEta(recommendation)} hasta el origen
        </p>
      )}

      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
          <p className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 text-slate-400" />
            {driver.phone}
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-slate-400" />
            Última actividad: {formatRelativeTime(driver.lastActivityAt)}
          </p>
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-slate-400" />
            Ubicación:{" "}
            {driver.lastLocation?.lat != null && driver.lastLocation?.lng != null ? (
              "reportada"
            ) : (
              <span className="font-medium text-slate-400">Ubicación no disponible</span>
            )}
          </p>
          <p className="flex items-center gap-1.5">
            <Battery className="h-3 w-3 text-slate-400" />
            Batería: {driver.battery != null ? `${driver.battery}%` : "n/d"}
          </p>
          {driver.activeOrders.length > 0 && (
            <p className="flex items-center gap-1.5 font-medium text-[#09193B] dark:text-slate-200">
              <Truck className="h-3 w-3 text-slate-400" />
              En ruta: {driver.activeOrders.map((o) => `#${shortOrderCode(o.orderNumber)}`).join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAssign();
          }}
          disabled={!selectedOrder || driver.bloqueado || !driver.activo}
          className="flex items-center gap-1 rounded-md bg-[#EB1902] px-2.5 py-1 text-[10px] font-bold text-white transition hover:bg-[#c81502] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Hand className="h-3 w-3" />
          Asignar
        </button>
        {driver.bloqueado ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDriverControl("unblock");
            }}
            className="rounded-md border border-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
          >
            Desbloquear
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDriverControl("block");
              }}
              className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Ban className="h-3 w-3" />
              Bloquear
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDriverControl(driver.estado === "available" || driver.estado === "offer_pending" ? "pause" : "resume");
              }}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              {driver.estado === "available" || driver.estado === "offer_pending" ? (
                <PauseCircle className="h-3 w-3" />
              ) : (
                <PlayCircle className="h-3 w-3" />
              )}
              {driver.estado === "available" || driver.estado === "offer_pending" ? "Pausar" : "Reanudar"}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="ml-auto text-[10px] font-semibold text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
        >
          {expanded ? "Ver menos" : "Ver detalles"}
        </button>
      </div>
    </div>
  );
}

export function DriversPanel({
  drivers,
  selectedDriverId,
  selectedOrder,
  recommendations,
  recommendationsLoading,
  mode,
  onSelectDriver,
  onAssign,
  onDriverControl,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const recByDriver = new Map(recommendations.map((r) => [r.driver._id, r]));
  const topRec = recommendations[0] ?? null;

  // Resumen de estados del repartidor (datos reales del snapshot).
  const counts = useMemo(() => {
    const connected = drivers.filter(
      (d) => d.activo && !d.bloqueado && ["available", "busy", "offer_pending"].includes(d.estado)
    ).length;
    const available = drivers.filter((d) => d.activo && !d.bloqueado && d.estado === "available").length;
    const busy = drivers.filter((d) => d.estado === "busy").length;
    const paused = drivers.filter((d) => d.estado === "paused").length;
    const offline = drivers.filter((d) => d.estado === "offline").length;
    const blocked = drivers.filter((d) => d.estado === "blocked").length;
    return { connected, available, busy, paused, offline, blocked };
  }, [drivers]);

  const sorted = useMemo(() => {
    const order: Record<DispatchDriverCard["estado"], number> = {
      available: 0,
      offer_pending: 1,
      busy: 2,
      paused: 3,
      offline: 4,
      blocked: 5,
    };
    return [...drivers].sort((a, b) => {
      const ra = recByDriver.get(a._id)?.score ?? -1;
      const rb = recByDriver.get(b._id)?.score ?? -1;
      if (ra !== rb) return rb - ra;
      return order[a.estado] - order[b.estado];
    });
  }, [drivers, recByDriver]);

  const statusStrip: Array<{ label: string; value: number; dot: string }> = [
    { label: "Registrados", value: drivers.length, dot: "bg-slate-400" },
    { label: "Conectados", value: counts.connected, dot: "bg-sky-500" },
    { label: "Disponibles", value: counts.available, dot: "bg-emerald-500" },
    { label: "Ocupados", value: counts.busy, dot: "bg-amber-500" },
    { label: "Pausados", value: counts.paused, dot: "bg-slate-500" },
    { label: "Desconectados", value: counts.offline + counts.blocked, dot: "bg-slate-300 dark:bg-slate-600" },
  ];

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-black/6 bg-white shadow-[0_1px_3px_rgba(9,25,59,0.06)] dark:border-white/10 dark:bg-[#0d1526]">
      <div className="flex items-center gap-2 border-b border-black/6 px-3 py-2 dark:border-white/10">
        <Truck className="h-4 w-4 text-[#EB1902]" />
        <span className="text-xs font-bold text-[#09193B] dark:text-white">Repartidores</span>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
          {drivers.length}
        </span>
      </div>

      {/* Resumen de estados: el operador ve de inmediato cuántos pueden recibir una orden */}
      <div className="border-b border-slate-100 px-3 py-2 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {statusStrip.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", item.dot)} />
              <span className="text-[10px] text-slate-500 dark:text-slate-400">{item.label}</span>
              <span className="text-[11px] font-black text-[#09193B] dark:text-white">{item.value}</span>
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
          {drivers.length === 0
            ? "No hay repartidores registrados."
            : counts.available === 0
              ? `Hay ${drivers.length} repartidor${drivers.length !== 1 ? "es" : ""} registrado${drivers.length !== 1 ? "s" : ""}, pero ninguno puede recibir una orden ahora.`
              : `${counts.available} repartidor${counts.available !== 1 ? "es" : ""} puede${counts.available !== 1 ? "n" : ""} recibir una orden ahora`}
        </p>
      </div>

      {/* Modo asistido: recomendaciones para el pedido seleccionado */}
      {mode === "assisted" && (
        <div className="border-b border-slate-100 bg-emerald-50/40 px-3 py-2 dark:border-white/10 dark:bg-emerald-500/5">
          {!selectedOrder ? (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              Selecciona un pedido para ver el top de repartidores recomendados.
            </p>
          ) : recommendationsLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          ) : recommendations.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              Sin candidatos disponibles para #{shortOrderCode(selectedOrder.orderNumber)}.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              Top {recommendations.length} para #{shortOrderCode(selectedOrder.orderNumber)} — elige y confirma la asignación.
            </p>
          )}
        </div>
      )}

      {/* Mejor opción (cuando hay pedido seleccionado y candidatos reales) */}
      {selectedOrder && topRec && !recommendationsLoading && (
        <div className="mx-2.5 mt-2.5 rounded-xl border-2 border-emerald-400/80 bg-emerald-50/70 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Mejor opción para #{shortOrderCode(selectedOrder.orderNumber)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-xs font-bold text-white">
              {topRec.driver.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("") || "R"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[#09193B] dark:text-white">{topRec.driver.name}</p>
              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                {topRec.score}% recomendado · {formatDistanceEta(topRec)} · {topRec.load} pedido{topRec.load !== 1 ? "s" : ""} activo{topRec.load !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAssign(topRec.driver);
              }}
              className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Asignar
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {sorted.length === 0 ? (
          /* 0 repartidores reales: se comunica con claridad y se explica qué
             puede hacer el administrador. Nunca se inventan repartidores. */
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-white/5">
              <Truck className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#09193B] dark:text-white">No hay repartidores registrados</p>
              <p className="mx-auto mt-1 max-w-[270px] text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                Los pedidos por asignar permanecen en la cola. Cuando un repartidor real se registre y se
                conecte, aparecerá aquí automáticamente con sus datos reales.
              </p>
            </div>
            <div className="w-full max-w-[290px] rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-left dark:border-white/10 dark:bg-white/5">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <Info className="h-3 w-3" />
                Qué puede hacer el administrador
              </p>
              <ul className="mt-2 space-y-2 text-left text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                <li>
                  Registrar un repartidor (nombre y teléfono con código de país) en el{" "}
                  <Link
                    href="/admin/repartidores"
                    className="font-bold text-[#EB1902] underline-offset-2 transition hover:underline dark:text-red-400"
                  >
                    panel de Repartidores
                  </Link>{" "}
                  o en el Sanity Studio.
                </li>
                <li>El repartidor se conecta por WhatsApp y su disponibilidad se refleja aquí.</li>
                <li>Con repartidores disponibles podrás asignar pedidos de forma manual, asistida o automática.</li>
              </ul>
            </div>
          </div>
        ) : (
          sorted.map((driver) => (
            <DriverCard
              key={driver._id}
              driver={driver}
              selected={selectedDriverId === driver._id}
              selectedOrder={selectedOrder}
              recommendation={recByDriver.get(driver._id) ?? null}
              isTopRec={topRec?.driver._id === driver._id}
              onSelect={() => onSelectDriver(driver._id)}
              onAssign={() => onAssign(driver)}
              onDriverControl={(action) => onDriverControl(driver, action)}
              expanded={expandedId === driver._id}
              onToggleExpand={() => setExpandedId((id) => (id === driver._id ? null : driver._id))}
              isDropTarget={dropTargetId === driver._id}
              onDrop={() => {
                setDropTargetId(null);
                onAssign(driver);
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("application/x-elm-dispatch-order")) {
                  e.preventDefault();
                  setDropTargetId(driver._id);
                }
              }}
              onDragLeave={() => setDropTargetId((id) => (id === driver._id ? null : id))}
            />
          ))
        )}
      </div>
    </div>
  );
}
