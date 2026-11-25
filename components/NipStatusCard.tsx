"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { NipSenderView } from "@/lib/nip-sender-view";

const statusStyles: Record<
  string,
  { border: string; bg: string; icon: string }
> = {
  pending: { border: "border-sky-200", bg: "bg-sky-50", icon: "text-sky-600" },
  sent: { border: "border-amber-200", bg: "bg-amber-50", icon: "text-amber-600" },
  delivered: { border: "border-emerald-200", bg: "bg-emerald-50", icon: "text-emerald-600" },
  failed: { border: "border-red-200", bg: "bg-red-50", icon: "text-red-600" },
  expired: { border: "border-orange-200", bg: "bg-orange-50", icon: "text-orange-600" },
  verified: { border: "border-emerald-200", bg: "bg-emerald-50", icon: "text-emerald-600" },
};

function StatusIcon({ status }: { status: string }) {
  if (status === "verified" || status === "delivered") {
    return <ShieldCheck className="h-4 w-4" />;
  }
  if (status === "failed" || status === "expired") {
    return <AlertTriangle className="h-4 w-4" />;
  }
  if (status === "pending") {
    return <Clock className="h-4 w-4" />;
  }
  return <Send className="h-4 w-4" />;
}

function formatCountdown(totalSeconds: number) {
  if (totalSeconds <= 0) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

export function NipStatusCard({
  orderId,
  view,
  pin,
}: {
  orderId: string;
  view: NipSenderView;
  /** NIP revelado SOLO cuando el view model lo permite (canal remitente). */
  pin?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"resend" | "regenerate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const style = statusStyles[view.status] ?? statusStyles.pending;

  const act = useCallback(
    async (action: "resend" | "regenerate") => {
      setBusy(action);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`/api/orders/${orderId}/resend-nip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // El servidor decide con la MISMA política del view model
          // (lib/nip-delivery.ts): reenvía el NIP vigente o regenera si expiró.
          // La regeneración forzada explícita es solo de operación (admin).
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok) {
          // Errores de cooldown/límite llegan con un mensaje humano del servidor.
          setError(data.error ?? "No se pudo completar la acción.");
          return;
        }
        const applied = data.action === "regenerate" ? "regenerate" : "resend";
        setSuccess(
          applied === "regenerate"
            ? "Nuevo código generado y enviado al canal configurado."
            : "Código reenviado al canal configurado."
        );
        router.refresh();
      } catch {
        setError("No se pudo completar la acción. Intenta de nuevo.");
      } finally {
        setBusy(null);
      }
    },
    [orderId, router]
  );

  return (
    <div className={`mb-4 rounded-lg border p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-start gap-2.5">
        <Lock className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-gray-900">{view.title}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.bg} ${style.icon}`}
            >
              <StatusIcon status={view.status} />
              {view.statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-700">{view.message}</p>

          {view.channel === "recipient" && view.recipientName && (
            <p className="mt-2 text-xs font-medium text-gray-600">
              Destinatario: {view.recipientName}
              {view.recipientPhoneMasked && (
                <span className="text-gray-500"> · WhatsApp terminado en {view.recipientPhoneMasked.slice(-4)}</span>
              )}
            </p>
          )}

          {view.senderResponsibilityNote && (
            <p className="mt-2 rounded-md bg-white/70 px-2.5 py-1.5 text-xs font-medium text-gray-700">
              {view.senderResponsibilityNote}
            </p>
          )}

          {view.fallbackToSender && (
            <p className="mt-1.5 text-xs text-gray-600">
              El destinatario no utiliza WhatsApp. Por eso recibirás tú el código y deberás
              proporcionárselo al destinatario.
            </p>
          )}

          {view.showPinToSender && pin && (
            <div className="mt-2.5 rounded-md bg-white p-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tu código de entrega</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-gray-950">{pin}</p>
              <p className="mt-1 text-[11px] text-gray-500">
                Compártelo únicamente cuando el repartidor esté en la entrega.
              </p>
            </div>
          )}

          {success && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {success}
            </p>
          )}

          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}

          {(view.canResend || view.canRegenerate) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {view.canResend && (
                <button
                  type="button"
                  onClick={() => act("resend")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === "resend" ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Reenviar código
                </button>
              )}
              {view.canRegenerate && (
                <button
                  type="button"
                  onClick={() => act("regenerate")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-50"
                >
                  {busy === "regenerate" ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Generar nuevo código
                </button>
              )}
            </div>
          )}

          {!view.canResend && view.resendCooldownSeconds > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              Podrás reenviar el código en {formatCountdown(view.resendCooldownSeconds)}.
            </p>
          )}
          {!view.canRegenerate && view.regenCooldownSeconds > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Podrás generar un nuevo código en {formatCountdown(view.regenCooldownSeconds)}.
            </p>
          )}
          {view.regenLimitReached && (
            <p className="mt-1 text-xs font-medium text-orange-700">
              Se alcanzó el límite de regeneraciones de este pedido (3). Contacta a soporte si el
              destinatario no recibió el código.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
