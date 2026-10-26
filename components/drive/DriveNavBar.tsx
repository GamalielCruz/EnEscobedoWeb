"use client";

import { Loader2, MapPin } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
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
 * SUPERFICIE ÚNICA DE NAVEGACIÓN — tarjeta de instrucciones giro por giro.
 *
 * La zona superior del mapa está reservada EXCLUSIVAMENTE para la navegación:
 * NO existe barra de estado ("En ruta a recolección", tiempos de etapa), ni
 * píldora de "vista libre", ni folio, ni chip de simulación. Esos datos viven
 * en el panel inferior (DriveTripSheet).
 *
 * La tarjeta muestra: icono de maniobra + instrucción imperativa + distancia
 * a la maniobra (chip) + progreso discreto de la ruta. En estado "action"
 * (en el punto) la tarjeta se omite: el flujo de acción vive en el panel
 * inferior y el mapa queda despejado.
 */
export function DriveNavBar({
  mainText,
  subText,
  progress,
  maneuver,
  maneuverDistance,
  recalculating,
  waitingForRoute,
  variant = "maneuver",
}: {
  mainText: string;
  subText: string | null;
  /** Fracción completada de la ruta geométrica (0..1) o null. */
  progress?: number | null;
  /** Maneuver de Google del step que se está mostrando (para su icono). */
  maneuver?: string | null;
  /** Distancia formateada a la maniobra (p. ej. "en 120 m") o null. */
  maneuverDistance?: string | null;
  /** true mientras se recalcula la ruta por un desvío (fuera de ruta). */
  recalculating?: boolean;
  waitingForRoute?: boolean;
  /** Variante visual (maneuver | arriving | action). */
  variant?: "maneuver" | "arriving" | "action";
}) {
  const maneuverValue = maneuver ?? null;
  const hasProgress = typeof progress === "number" && progress >= 0;
  const isArriving = variant === "arriving";
  const isAction = variant === "action";

  const waitingOrRecalculating = Boolean(waitingForRoute || recalculating);

  // En el punto (at_pickup / at_delivery / done) NO hay tarjeta: el mapa
  // queda libre y la acción se confirma desde el panel inferior.
  if (isAction) return null;

  return (
    <div
      className={`${DRIVE_RADIUS.panel} ${DRIVE_ELEVATION.bar} bg-gray-950/95 px-3.5 py-3 ring-1 ring-white/10 backdrop-blur-md`}
      style={{ transition: `opacity ${DRIVE_MOTION_DURATION.fast}ms ${DRIVE_MOTION_EASE.enter}` }}
    >
      <div className="flex items-start gap-3">
        <span
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
            isArriving ? "bg-white text-gray-900" : "bg-white/10 text-white"
          }`}
        >
          <ManeuverIcon maneuver={maneuverValue} className="h-8 w-8" />
          {maneuverDistance && !waitingOrRecalculating && (
            <span className="absolute -bottom-2 -right-2 rounded-md bg-white px-1 py-px text-[9px] font-black whitespace-nowrap text-gray-900 shadow-md ring-1 ring-black/10">
              {maneuverDistance}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          {waitingOrRecalculating ? (
            <p className="flex items-center gap-2 py-2 text-sm font-semibold text-white/60">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              {waitingForRoute ? "Calculando ruta…" : "Recalculando ruta…"}
            </p>
          ) : (
            <>
              {/* ARRIVING: identidad del destino dominante + cuenta
                  regresiva prominente. MANEUVER: instrucción imperativa. */}
              {isArriving ? (
                <p className="truncate text-lg font-extrabold leading-snug text-white">
                  {mainText}
                </p>
              ) : (
                <p className="text-xl font-extrabold leading-snug text-white">{mainText}</p>
              )}
              {subText && (
                <p className="mt-0.5 truncate text-xs text-white/60">{subText}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Barra de progreso de ruta discreta */}
      {hasProgress && !waitingOrRecalculating && (
        <div className="mt-2.5">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress! * 100))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

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
