"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { SIM_SPEEDS } from "@/hooks/useDriveSimulator";

/**
 * Panel de herramientas de DESARROLLO (solo dev local / preview/staging).
 * La página solo lo monta cuando el entorno NO es producción; aquí se
 * renderiza condicionalmente con `visible` para no interferir con la UI.
 * Se puede contraer a una píldora mínima para no tapar el mapa.
 *
 * Estilo: misma tarjeta flotante blanca que el banner de navegación y la
 * hoja del pedido (sombra profunda, ring sutil, backdrop-blur). El morado
 * queda como identidad del panel de desarrollo. SIN etiquetas "SIM" ni
 * "MODO SIMULACIÓN" en la UI del conductor: la simulación es invisible para
 * el usuario final y solo existe detrás de este panel dev
 * (DRIVE_SIM_ENABLED = entornos no producción). La funcionalidad es idéntica a la versión anterior: simular,
 * pausar/reanudar, reiniciar, detener y velocidades 1×/2×/5×/10×.
 */
export function DriveSimPanel({
  visible,
  canStart,
  active,
  running,
  finished,
  stageLabel,
  speed,
  waitingForRoute,
  onStart,
  onPause,
  onResume,
  onRestart,
  onStop,
  onSpeed,
}: {
  visible: boolean;
  canStart: boolean;
  active: boolean;
  running: boolean;
  finished: boolean;
  stageLabel: string;
  speed: number;
  waitingForRoute: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onStop: () => void;
  onSpeed: (speed: (typeof SIM_SPEEDS)[number]) => void;
}) {
  // Colapsado por defecto: el simulador es una herramienta de dev y nunca
  // debe tapar el flujo real del repartidor (píldora "SIM" discreta).
  const [expanded, setExpanded] = useState(false);
  if (!visible) return null;

  const mainLabel = !active
    ? "▶ SIMULAR VIAJE"
    : running
      ? "⏸ PAUSAR SIMULACIÓN"
      : finished
        ? "↻ REPETIR"
        : "▶ REANUDAR";

  const handleMain = () => {
    if (!active) onStart();
    else if (running) onPause();
    else if (finished) onRestart();
    else onResume();
  };

  // Minimizado: píldora compacta que vuelve a expandirse al tocarla.
  // SIN etiquetas "SIM" visibles como identidad: la simulación es invisible
  // para el usuario final; solo el icono de matraz (herramienta dev) la delata.
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="absolute left-3 top-[17.5rem] z-30 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-xs font-black text-purple-700 shadow-[0_10px_30px_rgba(3,7,18,0.28)] ring-1 ring-black/5 backdrop-blur transition active:scale-95"
        aria-label="Expandir panel de desarrollo"
        title="Panel de desarrollo"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        {active && <span className="h-2 w-2 rounded-full bg-purple-500" aria-hidden />}
        <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
      </button>
    );
  }

  return (
    <div className="absolute left-3 top-[17.5rem] z-30 w-[min(15.5rem,calc(100vw-1.5rem))] rounded-2xl bg-white/95 p-2.5 text-xs text-[#0b1b3a] shadow-[0_10px_30px_rgba(3,7,18,0.28)] ring-1 ring-black/5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-black uppercase tracking-wide text-purple-600">
          <FlaskConical className="h-3.5 w-3.5" />
          Dev
        </span>
        <button
          onClick={() => setExpanded(false)}
          className="flex h-5 w-5 items-center justify-center rounded-md bg-gray-100 text-gray-500 transition hover:bg-gray-200"
          aria-label="Minimizar panel de desarrollo"
          title="Minimizar"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-1.5">
        <button
          onClick={handleMain}
          disabled={!active && !canStart}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#EB1902] px-2 py-2 text-[11px] font-black text-white shadow-lg shadow-[#EB1902]/25 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          aria-label={mainLabel}
        >
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {mainLabel}
        </button>
        <button
          onClick={onRestart}
          disabled={!active}
          className="flex items-center justify-center rounded-xl bg-gray-100 px-2 py-2 text-[11px] font-bold text-gray-600 transition active:scale-95 disabled:opacity-30"
          title="Reiniciar simulación"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onStop}
          disabled={!active}
          className="flex items-center justify-center rounded-xl bg-gray-100 px-2 py-2 text-[11px] font-bold text-gray-600 transition active:scale-95 disabled:opacity-30"
          title="Detener simulación"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Velocidad
        </span>
        <div className="flex gap-1">
          {SIM_SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeed(s)}
              className={`rounded-lg px-2 py-1 text-[10px] font-black tabular-nums transition ${
                speed === s
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-500 active:bg-gray-200"
              }`}
              aria-label={`Velocidad ${s}x`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {active && (
        <p className="mt-1.5 truncate text-[10px] font-medium text-gray-500">
          Etapa: {stageLabel}
        </p>
      )}
      {waitingForRoute && (
        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          Esperando ruta de Google…
        </p>
      )}
      {!active && !canStart && (
        <p className="mt-1.5 text-[10px] leading-snug text-amber-600/80">
          Necesitas pedido activo con coordenadas y ubicación GPS para simular.
        </p>
      )}
    </div>
  );
}