"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  LocateFixed,
  Loader2,
  MapPin,
  Merge,
  Navigation2,
  Undo2,
} from "lucide-react";
import {
  DRIVE_MOTION_DURATION,
  DRIVE_MOTION_EASE,
  DRIVE_ELEVATION,
  DRIVE_RADIUS,
} from "@/components/drive/motion";

export type DriveNavPhase = "to_pickup" | "at_pickup" | "to_delivery" | "at_delivery" | "done";

/**
 * Variante visual del panel (Fase 4). El componente elige la presentación;
 * la Fase 3 (rAF/heading) no interviene: los cambios de variante son
 * transiciones de etapa, eventos raros fuera del hot path.
 *
 * - MANEUVER: navegación activa → maniobra dominante (glance de ~1s).
 * - ARRIVING: a <150 m → identidad del destino dominante + cuenta regresiva.
 * - ACTION:   en el punto (at_pickup/at_delivery) → qué hacer aquí.
 */
export type DriveNavBarVariant = "maneuver" | "arriving" | "action";

type Accent = "orange" | "red" | "green" | "blue" | "gray";

const ACCENT_STYLES: Record<Accent, { iconWrap: string; title: string }> = {
  orange: { iconWrap: "bg-orange-500 text-white", title: "text-orange-400" },
  red: { iconWrap: "bg-red-500 text-white", title: "text-red-400" },
  green: { iconWrap: "bg-green-500 text-white", title: "text-green-400" },
  blue: { iconWrap: "bg-blue-500 text-white", title: "text-blue-400" },
  gray: { iconWrap: "bg-gray-500 text-white", title: "text-gray-400" },
};

const ACCENT_BAR: Record<Accent, string> = {
  orange: "bg-orange-500",
  red: "bg-red-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  gray: "bg-gray-500",
};

/** Icono vectorial de la maniobra actual (rotaciones según `maneuver`). */
function ManeuverIcon({ maneuver, className }: { maneuver: string | null; className: string }) {
  switch (maneuver) {
    case "straight":
    case "depart":
      return <ArrowUp className={className} />;
    case "turn-slight-left":
    case "ramp-left":
    case "fork-left":
    case "roundabout-left":
      return <ArrowUpLeft className={className} />;
    case "turn-slight-right":
    case "ramp-right":
    case "fork-right":
    case "roundabout-right":
      return <ArrowUpRight className={className} />;
    case "turn-left":
    case "turn-sharp-left":
      return <ArrowLeft className={className} />;
    case "turn-right":
    case "turn-sharp-right":
      return <ArrowRight className={className} />;
    case "keep-left":
      return <ArrowUpLeft className={className} />;
    case "keep-right":
      return <ArrowUpRight className={className} />;
    case "uturn":
      return <Undo2 className={className} />;
    case "merge":
      return <Merge className={className} />;
    case "arrive":
      return <MapPin className={className} />;
    default:
      return <Navigation2 className={className} />;
  }
}

/**
 * Panel de navegación tipo GPS (jerarquía: MAPA → MANIOBRA → ETAPA → ACCIÓN).
 * - Fila 1: etapa + folio + tiempo/distancia al destino.
 * - Fila 2: icono de maniobra + instrucción IMPERATIVA corta (Fase 4) con
 *   la vialidad como línea secundaria. En ARRIVING, la identidad del destino
 *   es la línea dominante y la distancia es la cuenta regresiva.
 * - Fila 3: progreso geométrico del tramo.
 */
export function DriveNavBar({
  title,
  icon,
  accent,
  orderCode,
  mainText,
  subText,
  distanceLabel,
  durationLabel,
  progress,
  maneuver,
  maneuverDistance,
  recalculating,
  waitingForRoute,
  simulated,
  /** Variante visual (maneuver | arriving | action). */
  variant = "maneuver",
  /** true cuando el usuario está en modo exploración (mapa libre). */
  exploring = false,
  /** Regresa al modo navegación heading-up (solo usado en exploración). */
  onRecenter,
}: {
  title: string;
  icon: ReactNode;
  accent: Accent;
  orderCode: string;
  mainText: string;
  subText: string | null;
  /** Texto ya formateado, p. ej. "2.6 km restantes" o null. */
  distanceLabel: string | null;
  /** Texto ya formateado, p. ej. "8 min". */
  durationLabel: string | null;
  /** Fracción completada de la ruta geométrica (0..1) o null. */
  progress?: number | null;
  /** Maneuver de Google del step que se está mostrando (para su icono). */
  maneuver?: string | null;
  /** Distancia formateada a la maniobra (p. ej. "en 120 m") o null. */
  maneuverDistance?: string | null;
  /** true mientras se recalcula la ruta por un desvío (fuera de ruta). */
  recalculating?: boolean;
  waitingForRoute?: boolean;
  simulated?: boolean;
  variant?: DriveNavBarVariant;
  exploring?: boolean;
  onRecenter?: () => void;
}) {
  const maneuverValue = maneuver ?? null;
  const accentStyle = ACCENT_STYLES[accent];
  const barColor = ACCENT_BAR[accent];
  const hasProgress = typeof progress === "number" && progress >= 0;
  const isArriving = variant === "arriving";

  return (
    <div className="relative">
      {/* Píldora de exploración: el mapa está en vista libre. Transición
          transform/opacity de 120ms; tap = regreso a navegación. */}
      <AnimatePresence>
        {exploring && onRecenter && (
          <motion.button
            key="exploring-pill"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: DRIVE_MOTION_DURATION.fast, ease: DRIVE_MOTION_EASE.enter }}
            onClick={onRecenter}
            className="absolute -top-9 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gray-950/90 px-3 py-1.5 text-[11px] font-bold text-white/90 ring-1 ring-white/15 backdrop-blur-md active:scale-95"
            aria-label="Vista libre activa. Toca para recentrar la navegación."
          >
            <LocateFixed className="h-3.5 w-3.5 text-[#EB1902]" />
            Vista libre · tocar para recentrar
          </motion.button>
        )}
      </AnimatePresence>

      <div
        className={`${DRIVE_RADIUS.panel} ${DRIVE_ELEVATION.bar} bg-gray-950/95 px-3.5 py-2.5 ring-1 ring-white/10 backdrop-blur-md`}
      >
        {/* Fila 1 — etapa + tiempo/distancia al destino */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${accentStyle.iconWrap}`}
            >
              {icon}
            </span>
            <span
              className={`text-[11px] font-black uppercase tracking-wider ${accentStyle.title}`}
            >
              {title}
            </span>
            <span
              className="rounded-full bg-white/10 px-1.5 py-px text-[10px] font-bold text-white/70"
            >
              #{orderCode}
            </span>
            {simulated && (
              <span className="rounded-full bg-purple-900/50 px-1.5 py-px text-[10px] font-bold text-purple-300">
                🧪 SIM
              </span>
            )}
          </div>

          {/* Tiempo • distancia al destino. En ARRIVING la distancia es la
              cuenta regresiva dominante y vive en la fila 2. */}
          {(durationLabel || (distanceLabel && !isArriving)) && (
            <div className="flex items-center gap-2 text-xs font-black tabular-nums text-white/80">
              {durationLabel && <span>{durationLabel}</span>}
              {durationLabel && distanceLabel && !isArriving && <span className="text-white/40">•</span>}
              {distanceLabel && !isArriving && <span>{distanceLabel}</span>}
            </div>
          )}
        </div>

        {/* Fila 2 — maniobra dominante (MANEUVER) o identidad del destino
            dominante + cuenta regresiva (ARRIVING) o qué hacer aquí (ACTION). */}
        <div className="mt-2 flex items-start gap-3">
          <span
            className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              isArriving ? "bg-white text-gray-900" : "bg-white/10 text-white"
            }`}
          >
            <ManeuverIcon maneuver={maneuverValue} className="h-7 w-7" />
            {maneuverDistance && !waitingForRoute && !isArriving && (
              <span className="absolute -bottom-1.5 -right-2 rounded-md bg-white px-1 py-px text-[9px] font-black whitespace-nowrap text-gray-900 shadow-md ring-1 ring-black/10">
                {maneuverDistance}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            {waitingForRoute || recalculating ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-white/60">
                <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                {waitingForRoute ? "Calculando ruta…" : "Recalculando ruta…"}
              </p>
            ) : (
              <>
                {/* ARRIVING: identidad del destino dominante, cuenta regresiva
                    prominente al lado. MANEUVER/ACTION: instrucción principal. */}
                {isArriving ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-lg font-extrabold leading-snug text-white">
                      {mainText}
                    </p>
                    {distanceLabel && (
                      <span className="shrink-0 text-base font-black tabular-nums text-white">
                        {distanceLabel.replace(" restantes", "")}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xl font-extrabold leading-snug text-white">
                    {mainText}
                  </p>
                )}
                {subText && (
                  <p className="mt-0.5 truncate text-xs text-white/60">
                    {subText}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Fila 3 — progreso geométrico (oculto en ACTION: no hay tramo) */}
        {hasProgress && variant !== "action" && (
          <div className="mt-2">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${barColor}`}
                style={{ width: `${Math.min(100, Math.max(0, progress! * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
