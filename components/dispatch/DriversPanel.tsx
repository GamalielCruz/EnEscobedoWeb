"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Award,
  Ban,
  ChevronDown,
  Hand,
  MoreHorizontal,
  Package,
  PauseCircle,
  PlayCircle,
  Sparkles,
  Star,
  Truck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactDuration, shortOrderCode } from "@/lib/dispatch/dispatch-format";
import type { DispatchMode } from "@/lib/dispatch/dispatch-config";
import type { DispatchDriverCard, DispatchOrderCard, DriverRecommendation } from "@/lib/dispatch/dispatch-core";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DISPATCH_GHOST_BTN,
  DISPATCH_LABEL,
  DISPATCH_MUTED,
  DISPATCH_PRIMARY_BTN,
  DISPATCH_TEXT,
  DispatchEmptyState,
  DispatchPanelHeader,
  DispatchSurface,
} from "@/components/dispatch/DispatchCard";

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
  /** Limpia el pedido seleccionado y vuelve al listado genérico. */
  onClearSelection?: () => void;
};

const estadoMeta: Record<DispatchDriverCard["estado"], { label: string; dot: string; chip: string }> = {
  available: { label: "Disponible", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  busy: { label: "En servicio", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  offer_pending: { label: "Oferta pendiente", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  paused: { label: "Pausado", dot: "bg-slate-500", chip: "bg-slate-100 text-slate-600 dark:bg-white/15 dark:text-slate-200" },
  offline: { label: "Fuera de servicio", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400" },
  blocked: { label: "Bloqueado", dot: "bg-red-500", chip: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300" },
};

function initialsOf(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

/** ETA/distancia reales al origen del pedido; "Sin estimar" si no hay datos. */
function distanceEta(rec: DriverRecommendation | null | undefined): string {
  if (!rec) return "Sin estimar";
  const distance = rec.distanceKm != null ? `${rec.distanceKm} km` : null;
  const eta = rec.estimatedMinutes != null ? `${rec.estimatedMinutes} min` : null;
  if (distance && eta) return `${distance} · ${eta}`;
  if (distance) return distance;
  if (eta) return eta;
  return "Sin estimar";
}

function DriverRow({
  driver,
  selected,
  recommendation,
  isTop,
  hasOrder,
  mandado,
  onSelect,
  onAssign,
  onDriverControl,
  expanded,
  onToggleExpand,
}: {
  driver: DispatchDriverCard;
  selected: boolean;
  recommendation?: DriverRecommendation | null;
  isTop: boolean;
  hasOrder: boolean;
  mandado: boolean;
  onSelect: () => void;
  onAssign: () => void;
  onDriverControl: (action: "block" | "unblock" | "pause" | "resume") => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const meta = estadoMeta[driver.estado];
  const isPaused = driver.estado === "paused";

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer rounded-xl border bg-white p-3 transition-shadow duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EB1902]/40 dark:bg-white/[0.02]",
        selected
          ? "border-[#EB1902] ring-2 ring-[#EB1902]/20"
          : isTop
            ? "border-emerald-300/80 dark:border-emerald-500/40"
            : "border-slate-200/80 dark:border-white/10",
        driver.bloqueado && "opacity-70"
      )}
    >
      <div className="flex items-center gap-3">
        {driver.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={driver.fotoUrl} alt={driver.name} className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-white/10" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#EB1902] to-[#850C22] text-xs font-bold text-white">
            {initialsOf(driver.name) || "R"}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={cn("truncate text-sm font-black", DISPATCH_TEXT)}>{driver.name}</p>
            {driver.prioridad > 0 && <Award className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            {driver.rating != null && (
              <span className={cn("flex shrink-0 items-center gap-0.5 text-[11px] font-bold", DISPATCH_MUTED)}>
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {driver.rating.toFixed(1)}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold", meta.chip)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </span>
            <span className={cn("flex items-center gap-1 text-[10px] font-semibold", DISPATCH_MUTED)}>
              <Package className="h-3 w-3 text-slate-400" />
              {driver.activeOrders.length} pedido{driver.activeOrders.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {hasOrder && recommendation && (
          <div className="flex shrink-0 flex-col items-center">
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{recommendation.score}%</span>
            <span className={DISPATCH_LABEL}>Match</span>
          </div>
        )}
      </div>

      {/* Recomendación: criterio breve, distancia/ETA y contexto útil. */}
      {hasOrder && recommendation && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {isTop && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
              Mejor opción
            </span>
          )}
          <span className={cn("rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold dark:bg-white/10", DISPATCH_MUTED)}>
            {distanceEta(recommendation)} al origen
          </span>
          {recommendation.reasons.slice(0, 2).map((reason) => (
            <span key={reason} className={cn("rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold dark:bg-white/10", DISPATCH_MUTED)}>
              {reason}
            </span>
          ))}
        </div>
      )}

      {/* Acción principal de la card: asignar. Los controles de gestión van al
          menú contextual para no competir visualmente. */}
      <div className="mt-2.5 flex items-center gap-1.5">
        {hasOrder && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAssign();
            }}
            disabled={driver.bloqueado || !driver.activo}
            className={cn(DISPATCH_PRIMARY_BTN, "flex-1")}
          >
            <Hand className="h-3.5 w-3.5" />
            {mandado ? "Ofertar" : "Asignar"}
          </button>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Acciones de ${driver.name}`}
              className={cn(DISPATCH_GHOST_BTN, "px-1.5", !hasOrder && "ml-auto")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1 dark:border-white/10 dark:bg-[#0d1526]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5 -rotate-90" />}
              {expanded ? "Ocultar detalles" : "Ver detalles"}
            </button>
            {driver.bloqueado ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDriverControl("unblock");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Desbloquear
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDriverControl(isPaused ? "resume" : "pause");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  {isPaused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
                  {isPaused ? "Reanudar" : "Pausar"}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDriverControl("block");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Ban className="h-3.5 w-3.5" />
                  Bloquear
                </button>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {expanded && (
        <div className={cn("mt-2 space-y-1 border-t border-slate-100 pt-2 text-[11px] dark:border-white/5", DISPATCH_MUTED)}>
          <p>Teléfono: {driver.phone}</p>
          <p>Conectado: {formatCompactDuration(driver.connectedMinutes)}</p>
          <p>Ubicación: {driver.lastLocation?.lat != null ? "reportada" : "no disponible"}</p>
          <p>Efectivo pendiente: ${driver.pendingCash.toFixed(2)}</p>
          {driver.activeOrders.length > 0 && (
            <p className={cn("font-semibold", DISPATCH_TEXT)}>
              En servicio: {driver.activeOrders.map((o) => `#${shortOrderCode(o.orderNumber)}`).join(", ")}
            </p>
          )}
        </div>
      )}
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
  onClearSelection,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const recByDriver = useMemo(() => new Map(recommendations.map((r) => [r.driver._id, r])), [recommendations]);
  const topRec = recommendations[0] ?? null;

  const counts = useMemo(() => {
    const available = drivers.filter((d) => d.activo && !d.bloqueado && d.estado === "available").length;
    const busy = drivers.filter((d) => d.estado === "busy").length;
    const connected = drivers.filter((d) => d.activo && !d.bloqueado && ["available", "busy", "offer_pending"].includes(d.estado)).length;
    return { available, busy, connected };
  }, [drivers]);

  const sorted = useMemo(() => {
    const order: Record<DispatchDriverCard["estado"], number> = { available: 0, offer_pending: 1, busy: 2, paused: 3, offline: 4, blocked: 5 };
    return [...drivers].sort((a, b) => {
      const ra = recByDriver.get(a._id)?.score ?? -1;
      const rb = recByDriver.get(b._id)?.score ?? -1;
      if (ra !== rb) return rb - ra;
      return order[a.estado] - order[b.estado];
    });
  }, [drivers, recByDriver]);

  const hasOrder = Boolean(selectedOrder);
  const mandado = selectedOrder?.serviceKind === "mandado";
  const list = hasOrder && recommendations.length > 0 && !recommendationsLoading ? recommendations.map((r) => r.driver) : sorted;

  function renderDriver(driver: DispatchDriverCard) {
    const rec = recByDriver.get(driver._id) ?? null;
    return (
      <DriverRow
        key={driver._id}
        driver={driver}
        selected={selectedDriverId === driver._id}
        recommendation={hasOrder ? rec : null}
        isTop={hasOrder && topRec?.driver._id === driver._id}
        hasOrder={hasOrder}
        mandado={Boolean(mandado)}
        onSelect={() => onSelectDriver(driver._id)}
        onAssign={() => onAssign(driver)}
        onDriverControl={(a) => onDriverControl(driver, a)}
        expanded={expandedId === driver._id}
        onToggleExpand={() => setExpandedId((id) => (id === driver._id ? null : id))}
      />
    );
  }

  return (
    <DispatchSurface>
      {hasOrder ? (
        <DispatchPanelHeader
          icon={Sparkles}
          title="Mejores opciones para este pedido"
          subtitle={
            recommendationsLoading
              ? `Calculando candidatos para #${shortOrderCode(selectedOrder!.orderNumber)}…`
              : `#${shortOrderCode(selectedOrder!.orderNumber)} · ${selectedOrder!.serviceKind === "mandado" ? "Mandado" : selectedOrder!.storeName}`
          }
          action={
            onClearSelection ? (
              <button
                type="button"
                onClick={onClearSelection}
                aria-label="Cerrar selección"
                className={cn(DISPATCH_GHOST_BTN, "px-1.5")}
              >
                <X className="h-4 w-4" />
              </button>
            ) : undefined
          }
        />
      ) : (
        <DispatchPanelHeader
          icon={Truck}
          title="Repartidores"
          count={drivers.length}
          subtitle={`${counts.available} disponibles · ${counts.busy} en servicio · ${counts.connected} conectados`}
        />
      )}

      {mode === "assisted" && !hasOrder && (
        <p className={cn("flex items-center gap-1.5 px-3.5 pb-1 text-[11px]", DISPATCH_MUTED)}>
          <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
          Selecciona un pedido para ver recomendaciones.
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 pb-3 pt-1">
        {hasOrder && recommendationsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : hasOrder && recommendations.length === 0 ? (
          <DispatchEmptyState
            icon={Sparkles}
            title="Sin candidatos recomendados"
            description={`No hay repartidores compatibles para #${shortOrderCode(selectedOrder!.orderNumber)} ahora mismo. Revisa los disponibles abajo.`}
          />
        ) : list.length === 0 ? (
          <DispatchEmptyState
            icon={Truck}
            title="No hay repartidores registrados"
            description="Los pedidos permanecen en la cola hasta que un repartidor se conecte."
            action={
              <Link
                href="/admin/repartidores"
                className="text-xs font-bold text-[#EB1902] transition hover:underline dark:text-red-400"
              >
                Registrar repartidor
              </Link>
            }
          />
        ) : (
          <>
            {list.map(renderDriver)}
            {hasOrder && sorted.length > recommendations.length && (
              <div className="pt-1">
                <p className={cn("px-1 pb-1", DISPATCH_LABEL)}>
                  Otros repartidores ({sorted.length - recommendations.length})
                </p>
                <div className="space-y-2">
                  {sorted.filter((d) => !recByDriver.has(d._id)).map(renderDriver)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DispatchSurface>
  );
}
