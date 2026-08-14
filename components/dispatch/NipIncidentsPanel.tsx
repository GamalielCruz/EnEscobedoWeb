"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";
import type { NipIncident } from "@/app/api/admin/dispatch/nip-incidents/route";

const POLL_INTERVAL_MS = 15_000;

function formatAgo(minutes: number | null | undefined) {
  if (minutes == null) return "—";
  if (minutes < 1) return "hace <1 min";
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h`;
}

export function NipIncidentsPanel({
  onSelectOrder,
  notify,
}: {
  onSelectOrder: (orderId: string) => void;
  notify: (kind: "success" | "error", message: string) => void;
}) {
  const [incidents, setIncidents] = useState<NipIncident[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dispatch/nip-incidents", { cache: "no-store" });
      if (!res.ok) throw new Error("Error de servidor");
      const data = (await res.json()) as { incidents: NipIncident[] };
      if (mounted.current) setIncidents(data.incidents ?? []);
    } catch {
      if (mounted.current) setIncidents([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchIncidents();
    const interval = window.setInterval(fetchIncidents, POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
    };
  }, [fetchIncidents]);

  async function act(incident: NipIncident, action: "resend" | "regenerate") {
    setBusyId(incident._id);
    try {
      const res = await fetch(`/api/orders/${incident._id}/resend-nip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: `dispatch-center:${action}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo completar la acción");
      notify(
        "success",
        `Pedido #${shortOrderCode(incident.orderNumber)}: código ${action === "resend" ? "reenviado" : "regenerado"} al canal.`
      );
      await fetchIncidents();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusyId(null);
    }
  }

  if (!loading && incidents.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-orange-200/70 bg-orange-50/60 shadow-[0_1px_3px_rgba(9,25,59,0.06)] dark:border-orange-500/25 dark:bg-orange-500/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-orange-50 dark:hover:bg-white/5"
      >
        <ShieldAlert className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        <span className="text-xs font-bold text-[#09193B] dark:text-white">Entregas protegidas con código no entregado</span>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
          {incidents.length}
        </span>
        <span className="ml-auto text-[10px] font-semibold text-orange-600/70 dark:text-orange-300/60">
          {open ? "Ocultar" : "Ver"}
        </span>
      </button>

      {open && (
        <div className="max-h-64 space-y-1.5 overflow-y-auto border-t border-orange-200/70 px-3 py-2.5 dark:border-orange-500/25">
          {loading && incidents.length === 0 ? (
            <p className="px-1 py-2 text-xs text-orange-700/70 dark:text-orange-300/60">Cargando incidencias…</p>
          ) : (
            incidents.map((incident) => (
              <div
                key={incident._id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-orange-200/70 bg-white px-2.5 py-2 dark:border-orange-500/25 dark:bg-[#0d1526]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#09193B] dark:text-white">
                      Pedido #{shortOrderCode(incident.orderNumber)}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                        incident.reason === "expired"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
                          : incident.reason === "no_whatsapp"
                            ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
                            : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                      }`}
                    >
                      {incident.reason === "expired"
                        ? "Código expirado"
                        : incident.reason === "no_whatsapp"
                          ? "Destinatario sin WhatsApp"
                          : "Código no entregado"}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Último intento: {formatAgo(incident.lastAttemptMinutesAgo)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Destinatario: {incident.recipientName ?? "—"}</span>
                    {incident.recipientPhoneMasked && (
                      <span className="font-mono">{incident.recipientPhoneMasked}</span>
                    )}
                    <span>Canal: {incident.channel === "recipient" ? "WhatsApp del destinatario" : "WhatsApp del remitente"}</span>
                    {incident.reason === "no_whatsapp" && (
                      <span className="font-medium text-sky-700 dark:text-sky-300">
                        El código fue enviado al remitente; confirma que se lo compartió al destinatario.
                      </span>
                    )}
                    {incident.driverName && <span>Repartidor: {incident.driverName}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px]"
                    onClick={() => act(incident, "resend")}
                    disabled={busyId === incident._id}
                    title={incident.resendCooldownSeconds > 0 ? `Cooldown: ${incident.resendCooldownSeconds}s` : "Reenviar código vigente"}
                  >
                    <Send className="h-3 w-3" />
                    Reenviar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px]"
                    onClick={() => act(incident, "regenerate")}
                    disabled={busyId === incident._id || !incident.canRegenerate}
                    title={
                      !incident.canRegenerate
                        ? incident.regenCooldownSeconds > 0
                          ? `Cooldown: ${incident.regenCooldownSeconds}s`
                          : "Límite de regeneraciones alcanzado (3)"
                        : "Regenerar código (nuevo NIP)"
                    }
                  >
                    <RefreshCw className={`h-3 w-3 ${busyId === incident._id ? "animate-spin" : ""}`} />
                    Regenerar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-[10px]"
                    onClick={() => onSelectOrder(incident._id)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver pedido
                  </Button>
                </div>
              </div>
            ))
          )}
          {!loading && incidents.length === 0 && (
            <p className="px-1 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              Sin incidencias: todas las entregas protegidas tienen su código entregado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
