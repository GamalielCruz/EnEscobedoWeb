"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Bike, RefreshCw } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";

type AvailabilityData = {
  availableCount: number;
  busyCount: number;
  activeCount: number;
  connectedCount: number;
  estimatedWait: { minMinutes: number; maxMinutes: number } | null;
  lastUpdatedAt: string;
};

type AvailabilityStatus = "searching" | "available" | "busy" | "offline" | "error";

const POLL_INTERVAL_MS = 30_000;
const MINIMUM_SEARCH_TIME_MS = 2_000;
const RELIABLE_ETA_RETENTION_MS = 2 * 60_000;

function deriveStatus(data: AvailabilityData): AvailabilityStatus {
  if (data.connectedCount === 0) return "offline";
  if (data.availableCount > 0) return "available";
  if (data.busyCount > 0) return "busy";
  return "offline";
}

export default function MandadoDriverAvailability() {
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [status, setStatus] = useState<AvailabilityStatus>("searching");
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataRef = useRef<AvailabilityData | null>(null);
  const reliableEtaRef = useRef<{ estimatedWait: AvailabilityData["estimatedWait"]; receivedAt: number } | null>(null);

  const fetchAvailability = useCallback(async (isInitialFetch = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const minimumSearchTime = isInitialFetch
      ? new Promise<void>((resolve) => setTimeout(resolve, MINIMUM_SEARCH_TIME_MS))
      : Promise.resolve();

    try {
      const response = await fetch("/api/mandado/availability", {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("No se pudo consultar la disponibilidad.");
      }

      const result: AvailabilityData = await response.json();
      await minimumSearchTime;
      const now = Date.now();
      if (result.estimatedWait) {
        reliableEtaRef.current = { estimatedWait: result.estimatedWait, receivedAt: now };
      } else if (
        reliableEtaRef.current &&
        now - reliableEtaRef.current.receivedAt <= RELIABLE_ETA_RETENTION_MS
      ) {
        result.estimatedWait = reliableEtaRef.current.estimatedWait;
      }
      dataRef.current = result;
      setData(result);
      setStatus(deriveStatus(result));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      await minimumSearchTime;
      console.error("[MandadoDriverAvailability]", err);
      if (!dataRef.current) {
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    fetchAvailability(true);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchAvailability();
      }
    };

    intervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchAvailability();
      }
    }, POLL_INTERVAL_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchAvailability]);

  // ── Searching ──
  if (status === "searching") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
            <ThinkingOrb
              state="searching"
              size={64}
              theme="light"
              aria-label="Buscando un repartidor"
              style={{ width: 40, height: 40 }}
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Disponibilidad de reparto
            </p>
            <p className="mt-1 text-base font-semibold text-gray-900">
              Buscando un repartidor
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              Estamos comprobando quién puede recoger tu mandado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (status === "error") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
              <Bike className="h-4 w-4 text-gray-400" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Disponibilidad de reparto
              </p>
              <p className="mt-1 text-sm font-medium text-gray-500">
                No pudimos consultar la disponibilidad
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchAvailability()}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ── Sin repartidores conectados ──
  if (status === "offline") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm animate-in fade-in duration-300">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
            <Bike className="h-4 w-4 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Disponibilidad de reparto
            </p>
            <p className="mt-1.5 text-base font-semibold text-gray-900">
              Sin repartidores disponibles
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              En este momento no hay repartidores conectados.
            </p>
            <p className="mt-1.5 text-xs text-gray-400">
              Puedes continuar. Buscaremos un repartidor automáticamente cuando haya disponibilidad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Disponible (1 o más) ──
  if (status === "available") {
    const count = data?.availableCount ?? 0;
    const busyCount = data?.busyCount ?? 0;

    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm animate-in fade-in duration-300">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
            <Bike className="h-4 w-4 text-[#eb1902]" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Disponibilidad de reparto
            </p>
            <p className="mt-1.5 text-base font-semibold text-gray-900">
              {count === 1 ? "1 repartidor disponible" : `${count} repartidores disponibles`}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              {count === 1
                ? "Puede recoger tu mandado ahora."
                : "Puedes continuar de inmediato."}
            </p>
            {busyCount > 0 && (
              <p className="mt-1.5 text-xs text-gray-400">
                {busyCount === 1
                  ? "1 repartidor ocupado"
                  : `${busyCount} repartidores ocupados`}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Ocupados ──
  if (status === "busy") {
    const busyCount = data?.busyCount ?? 0;

    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm animate-in fade-in duration-300">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
            <Bike className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Disponibilidad de reparto
            </p>
            <p className="mt-1.5 text-base font-semibold text-gray-900">
              Repartidores ocupados
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              {busyCount === 1
                ? "1 repartidor está atendiendo otro pedido"
                : `${busyCount} repartidores están atendiendo otros pedidos`}
            </p>
            {data?.estimatedWait && (
              <p className="mt-1.5 text-sm font-semibold text-gray-900">
                Tiempo estimado de espera: {data.estimatedWait.minMinutes}–{data.estimatedWait.maxMinutes} min
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-400">
              Te asignaremos uno cuando quede disponible.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
