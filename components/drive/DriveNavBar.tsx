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
  { iconWrap: string; title: string; chip: string; bar: string }
> = {
  orange: {
    iconWrap: "bg-orange-100 text-orange-600",
    title: "text-orange-600",
    chip: "bg-orange-50 text-orange-700",
    bar: "bg-orange-500",
  },
  red: {
    iconWrap: "bg-red-100 text-red-600",
    title: "text-red-600",
    chip: "bg-red-50 text-red-700",
    bar: "bg-red-500",
  },
  green: {
    iconWrap: "bg-green-100 text-green-600",
    title: "text-green-700",
    chip: "bg-green-50 text-green-700",
    bar: "bg-green-500",
  },
  blue: {
    iconWrap: "bg-blue-100 text-blue-600",
    title: "text-blue-600",
    chip: "bg-blue-50 text-blue-700",
    bar: "bg-blue-500",
  },
  gray: {
    iconWrap: "bg-gray-100 text-gray-600",
    title: "text-gray-600",
    chip: "bg-gray-100 text-gray-600",
    bar: "bg-gray-400",
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
  const accentStyle = ACCENT_STYLES[accent];
  const hasProgress = typeof progress === "number" && progress >= 0;

  return (
    <div className="relative z-10 border-t border-gray-100 bg-white px-3 pt-1.5 pb-2 shadow-[0_-6px_18px_rgba(3,7,18,0.14)]">
      {/* Fila 1 — etapa · pedido · distancia restante */}
      <div className="flex items-center gap-1.5">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${accentStyle.iconWrap}`}
        >
          {icon}
        </span>
        <span
          className={`text-[10px] font-black uppercase tracking-wider ${accentStyle.title}`}
        >
          {title}
        </span>
        <span
          className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${accentStyle.chip}`}
        >
          Pedido #{orderCode}
        </span>
        {simulated && (
          <span className="rounded-full bg-purple-100 px-1.5 py-px text-[10px] font-bold text-purple-700">
            🧪 SIM
          </span>
        )}
        {distanceLabel && (
          <span className="ml-auto text-[11px] font-black tabular-nums text-[#09193B]">
            {distanceLabel}
          </span>
        )}
      </div>

      {/* Fila 2 — instrucción dominante (lo que debe hacer AHORA) */}
      <div className="mt-1 flex items-center gap-2">
        {maneuver ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <ManeuverIcon maneuver={maneuver} className="h-5 w-5" />
          </span>
        ) : (
          <span className="w-8 shrink-0" />
        )}
        {waitingForRoute ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            Calculando ruta…
          </p>
        ) : (
          <p className="line-clamp-2 flex-1 text-[15px] font-bold leading-snug text-[#0b1b3a]">
            {mainText}
          </p>
        )}
      </div>

      {/* Fila 3 — destino (terciario) */}
      {subText && !waitingForRoute && (
        <p className="mt-0.5 pl-10 truncate text-[11px] text-gray-500">{subText}</p>
      )}

      {/* Fila 4 — progreso geométrico + tiempo restante */}
      {(hasProgress || durationLabel) && (
        <div className="mt-1.5 flex items-center gap-2">
          {hasProgress ? (
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${accentStyle.bar}`}
                style={{ width: `${Math.min(100, Math.max(0, progress! * 100))}%` }}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {durationLabel && (
            <span className="text-[11px] font-black tabular-nums text-gray-700">
              {durationLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
