"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";
import type { NipIncident } from "@/app/api/admin/dispatch/nip-incidents/route";

const POLL_INTERVAL_MS = 15_000;

function formatAgo(minutes: number | null | undefined) {
  if (minutes == null) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h`;
}

export function NipIncidentsPanel({ onSelectOrder, notify }: { onSelectOrder: (orderId: string) => void; notify: (kind: "success" | "error", message: string) => void }) {
  const [incidents, setIncidents] = useState<NipIncident[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dispatch/nip-incidents", { cache: "no-store" });
      if (!res.ok) throw new Error("Error");
      const data = (await res.json()) as { incidents: NipIncident[] };
      if (mounted.current) setIncidents(data.incidents ?? []);
    } catch { if (mounted.current) setIncidents([]); }
    finally { if (mounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchIncidents();
    const interval = window.setInterval(fetchIncidents, POLL_INTERVAL_MS);
    return () => { mounted.current = false; window.clearInterval(interval); };
  }, [fetchIncidents]);

  async function act(incident: NipIncident, action: "resend" | "regenerate") {
    setBusyId(incident._id);
    try {
      const res = await fetch(`/api/orders/${incident._id}/resend-nip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: `dispatch-center:${action}` }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      notify("success", `#${shortOrderCode(incident.orderNumber)}: código ${action === "resend" ? "reenviado" : "regenerado"}.`);
      await fetchIncidents();
    } catch (err) { notify("error", err instanceof Error ? err.message : "Error"); }
    finally { setBusyId(null); }
  }

  if (!loading && incidents.length === 0) return null;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300">
        <ShieldAlert className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Códigos</span>
        <span className="rounded-full bg-orange-200 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-500/30 dark:text-orange-300">{incidents.length}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-[60vh] w-[min(90vw,480px)] overflow-y-auto rounded-xl border border-orange-200 bg-white p-3 shadow-xl dark:border-orange-500/25 dark:bg-[#0d1526]">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-bold text-[#09193B] dark:text-white">Códigos no entregados</span>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-xs text-slate-400 hover:text-slate-600">✕</button>
          </div>
          {loading && incidents.length === 0 ? <p className="py-2 text-xs text-orange-700/70">Cargando…</p> : (
            <div className="space-y-2">
              {incidents.map((incident) => (
                <div key={incident._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-orange-200/70 bg-orange-50/50 px-3 py-2 dark:border-orange-500/25 dark:bg-orange-500/5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#09193B] dark:text-white">#{shortOrderCode(incident.orderNumber)}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${incident.reason === "expired" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"}`}>
                        {incident.reason === "expired" ? "Expirado" : incident.reason === "no_whatsapp" ? "Sin WhatsApp" : "No entregado"}
                      </span>
                      <span className="text-[10px] text-slate-400">hace {formatAgo(incident.lastAttemptMinutesAgo)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{incident.recipientName ?? "—"}</span>
                      {incident.recipientPhoneMasked && <span className="font-mono">{incident.recipientPhoneMasked}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px]" onClick={() => act(incident, "resend")} disabled={busyId === incident._id}><Send className="h-3 w-3" />Reenviar</Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px]" onClick={() => act(incident, "regenerate")} disabled={busyId === incident._id || !incident.canRegenerate}><RefreshCw className={`h-3 w-3 ${busyId === incident._id ? "animate-spin" : ""}`} />Regenerar</Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[10px]" onClick={() => onSelectOrder(incident._id)}><ExternalLink className="h-3 w-3" />Ver</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
