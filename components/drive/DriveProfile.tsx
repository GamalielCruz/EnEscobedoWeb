"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, UserRound } from "lucide-react";
import { RatingSummaryCard } from "@/components/ratings/RatingSummaryCard";
import type { ReputationSummary } from "@/lib/order-ratings";

/**
 * MI PERFIL DEL REPARTIDOR — reputación anónima (solo lectura).
 *
 * Consume GET /api/driver/profile: promedio de las evaluaciones RECIBIDAS sobre
 * una ventana móvil de las últimas 50. No confunde este promedio con
 * `repartidor.calificacion`, que alimenta el ranking del despacho y no se toca
 * aquí.
 *
 * Fail-closed: si algo falla, no se muestran cifras inventadas.
 */

type Profile = {
  name: string;
  summary: ReputationSummary;
};

export function DriveProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/driver/profile", { signal, cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok || !body?.profile) {
        throw new Error(body?.error || "No pudimos cargar tu perfil.");
      }
      setProfile(body.profile as Profile);
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error && err.message ? err.message : "No pudimos cargar tu perfil.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  const run = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void load(controller.signal);
  }, [load]);

  useEffect(() => {
    run();
    return () => abortRef.current?.abort();
  }, [run]);

  if (loading && !profile) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando perfil" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center bg-red-50 text-red-400">
          <UserRound className="h-7 w-7" />
        </span>
        <p className="mt-5 text-base font-black text-[#09193B]">No pudimos cargar tu perfil</p>
        <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-gray-500">{error}</p>
        <button
          type="button"
          onClick={run}
          className="mt-6 flex items-center gap-2 border-2 border-gray-200 px-6 py-3 text-sm font-black text-[#09193B] transition active:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-6">
      <RatingSummaryCard
        name={profile.name}
        subtitle="Repartidor de ElMenu"
        summary={profile.summary}
      />
      <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
        Tu promedio se calcula solo con las últimas 50 entregas evaluadas. Las evaluaciones son
        anónimas: nadie puede saber quién te calificó ni de qué pedido viene.
      </p>
    </div>
  );
}
