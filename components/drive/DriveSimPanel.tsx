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
  const [expanded, setExpanded] = useState(true);
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
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="absolute left-3 top-20 z-30 flex items-center gap-1.5 rounded-full bg-[#0d1526]/95 px-3 py-2 text-xs font-black text-purple-300 shadow-xl ring-1 ring-white/10 backdrop-blur transition active:scale-95"
        aria-label="Expandir simulador"
        title="Expandir simulador de viaje"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        SIM
        {active && (
          <span className="ml-1 flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-200">
            🧪 MODO SIMULACIÓN
          </span>
        )}
        <ChevronUp className="h-3.5 w-3.5 text-white/50" />
      </button>
    );
  }

  return (
    <div className="absolute left-3 top-20 z-30 w-[min(15.5rem,calc(100vw-1.5rem))] rounded-2xl bg-[#0d1526]/95 p-2.5 text-xs text-white shadow-xl ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-black uppercase tracking-wide text-purple-300">
          <FlaskConical className="h-3.5 w-3.5" />
          Simulador
        </span>
        <div className="flex items-center gap-1.5">
          {active && (
            <span className="flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-200">
              🧪 MODO SIMULACIÓN
            </span>
          )}
          <button
            onClick={() => setExpanded(false)}
            className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-white/60 transition hover:bg-white/20"
            aria-label="Minimizar simulador"
            title="Minimizar simulador"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-1.5">
        <button
          onClick={handleMain}
          disabled={!active && !canStart}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#EB1902] px-2 py-2 text-[11px] font-black text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={mainLabel}
        >
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {mainLabel}
        </button>
        <button
          onClick={onRestart}
          disabled={!active}
          className="flex items-center justify-center rounded-xl bg-white/10 px-2 py-2 text-[11px] font-bold text-white/80 transition active:scale-95 disabled:opacity-30"
          title="Reiniciar simulación"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onStop}
          disabled={!active}
          className="flex items-center justify-center rounded-xl bg-white/10 px-2 py-2 text-[11px] font-bold text-white/80 transition active:scale-95 disabled:opacity-30"
          title="Detener simulación"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/50">
          Velocidad
        </span>
        <div className="flex gap-1">
          {SIM_SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeed(s)}
              className={`rounded-lg px-2 py-1 text-[10px] font-black tabular-nums transition ${
                speed === s
                  ? "bg-purple-500 text-white"
                  : "bg-white/10 text-white/60 active:bg-white/20"
              }`}
              aria-label={`Velocidad ${s}x`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {active && (
        <p className="mt-1.5 truncate text-[10px] font-medium text-white/50">
          Etapa: {stageLabel}
        </p>
      )}
      {waitingForRoute && (
        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          Esperando ruta de Google…
        </p>
      )}
      {!active && !canStart && (
        <p className="mt-1.5 text-[10px] leading-snug text-amber-300/80">
          Necesitas pedido activo con coordenadas y ubicación GPS para simular.
        </p>
      )}
    </div>
  );
}
