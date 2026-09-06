"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Loader2,
  MapPin,
  Merge,
  Navigation2,
  Undo2,
} from "lucide-react";

export type DriveNavPhase = "to_pickup" | "at_pickup" | "to_delivery" | "at_delivery" | "done";

type Accent = "orange" | "red" | "green" | "blue" | "gray";

const ACCENT_STYLES: Record<
  Accent,
  { iconWrap: string; title: string }
> = {
  orange: {
    iconWrap: "bg-orange-500 text-white",
    title: "text-orange-400",
  },
  red: {
    iconWrap: "bg-red-500 text-white",
    title: "text-red-400",
  },
  green: {
    iconWrap: "bg-green-500 text-white",
    title: "text-green-400",
  },
  blue: {
    iconWrap: "bg-blue-500 text-white",
    title: "text-blue-400",
  },
  gray: {
    iconWrap: "bg-gray-500 text-white",
    title: "text-gray-400",
  },
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
 * Panel de navegación tipo GPS que flota sobre el mapa en la parte superior.
 * Diseño oscuro de alto contraste inspirado en navegadores GPS:
 * - Fondo oscuro/redondeado
 * - Icono grande de maniobra
 * - Distancia grande y legible
 * - Vialidad claramente visible
 * - Tiempo y distancia al destino
 *
 * Lee de un vistazo mientras se maneja: "¿Qué hago ahora?".
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
  waitingForRoute,
  simulated,
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
  waitingForRoute?: boolean;
  simulated?: boolean;
}) {
  const maneuverValue = maneuver ?? null;
  const accentStyle = ACCENT_STYLES[accent];
  const hasProgress = typeof progress === "number" && progress >= 0;

  // Color de acento para el panel GPS (fondo oscuro con acento)
  const accentBarColors: Record<Accent, string> = {
    orange: "bg-orange-500",
    red: "bg-red-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    gray: "bg-gray-500",
  };
  const barColor = accentBarColors[accent];

  return (
    <div
      className="rounded-2xl bg-gray-950/95 px-3.5 py-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] ring-1 ring-white/10 backdrop-blur-md"
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

        {/* Tiempo • distancia al destino */}
        {(durationLabel || distanceLabel) && (
          <div className="flex items-center gap-2 text-xs font-black tabular-nums text-white/80">
            {durationLabel && <span>{durationLabel}</span>}
            {durationLabel && distanceLabel && <span className="text-white/40">•</span>}
            {distanceLabel && <span>{distanceLabel}</span>}
          </div>
        )}
      </div>

      {/* Fila 2 — icono grande de maniobra + instrucción dominante */}
      <div className="mt-2 flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
          <ManeuverIcon maneuver={maneuverValue} className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          {waitingForRoute ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-white/60">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              Calculando ruta…
            </p>
          ) : (
            <>
              <p className="text-xl font-extrabold leading-snug text-white">
                {mainText}
              </p>
              {subText && !waitingForRoute && (
                <p className="mt-0.5 truncate text-xs text-white/60">
                  {subText}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Fila 3 — progreso geométrico */}
      {hasProgress && (
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
  );
}
