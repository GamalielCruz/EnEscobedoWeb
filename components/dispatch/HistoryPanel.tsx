"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  Ban,
  Clock,
  Hand,
  History,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Settings2,
  Star,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditEntry } from "@/lib/dispatch/dispatch-core";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";

const actionMeta: Record<string, { label: string; icon: typeof Hand; chip: string }> = {
  assign: { label: "Asignación", icon: UserPlus, chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  reassign: { label: "Reasignación", icon: ArrowRightLeft, chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300" },
  unassign: { label: "Liberación", icon: Hand, chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  block: { label: "Bloqueo", icon: Ban, chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
  unblock: { label: "Desbloqueo", icon: PlayCircle, chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  pause: { label: "Pausa", icon: PauseCircle, chip: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300" },
  resume: { label: "Reanudación", icon: PlayCircle, chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  priority: { label: "Prioridad", icon: Star, chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  config: { label: "Configuración", icon: Settings2, chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" },
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function HistoryPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dispatch/history", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar historial");
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar historial");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <div className="flex w-full min-h-0 flex-col rounded-xl border border-black/6 bg-white shadow-[0_1px_3px_rgba(9,25,59,0.06)] dark:border-white/10 dark:bg-[#0d1526]">
      <div className="flex items-center gap-2 border-b border-black/6 px-4 py-2.5 dark:border-white/10">
        <History className="h-4 w-4 text-[#EB1902]" />
        <span className="text-xs font-bold text-[#09193B] dark:text-white">Historial de operaciones</span>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
          {entries.length}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={fetchHistory} disabled={loading} className="h-7 w-7 p-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && entries.length === 0 ? (
          <div className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-14 text-center">
            <History className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Aún no hay operaciones registradas.</p>
            <p className="max-w-[240px] text-[11px] text-slate-400/80 dark:text-slate-600">
              Cada asignación, bloqueo y cambio de configuración quedará registrado aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const meta = actionMeta[entry.action] ?? {
                label: entry.action,
                icon: Clock,
                chip: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
              };
              const Icon = meta.icon;
              return (
                <div
                  key={entry._id}
                  className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-slate-200 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                >
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.chip}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#09193B] dark:text-white">{meta.label}</span>
                      {entry.orderNumber && (
                        <span className="text-[11px] font-bold text-[#EB1902]">#{shortOrderCode(entry.orderNumber)}</span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                        <Clock className="h-3 w-3" />
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                      {entry.mode && (
                        <span className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold uppercase text-slate-500 dark:bg-white/10 dark:text-slate-400">
                          {entry.mode === "auto" ? "auto" : entry.mode === "manual" ? "manual" : "asistido"}
                        </span>
                      )}
                      {entry.actorName ?? "Operador"}
                      {entry.newDriverName ? ` → ${entry.newDriverName}` : entry.driverName ? ` · ${entry.driverName}` : ""}
                      {entry.previousDriverName && entry.newDriverName
                        ? ` (de ${entry.previousDriverName})`
                        : ""}
                      {entry.reason ? ` · ${entry.reason}` : ""}
                    </p>
                    {entry.responseTimeSeconds != null && (
                      <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                        Tiempo de respuesta: {Math.round(entry.responseTimeSeconds / 60)} min
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
