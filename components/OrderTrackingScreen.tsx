"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Loader2,
  MapPin,
  Phone,
  Star,
  Store,
} from "lucide-react";
import { useOrderTracking } from "@/hooks/useOrderTracking";
import type { CustomerTrackingPhase } from "@/lib/order-tracking";

// ────────────────────────────────────────────────────────────────────
// Pantalla de seguimiento del pedido (experiencia del cliente, estilo Uber).
//
// Jerarquía: 1) estado principal (fase), 2) barra de espera, 3) repartidor
// una vez asignado, 4) card plegable de detalles, 5) acciones discretas.
// Sin cronómetros con números, sin estados técnicos, sin datos de
// repartidores aún no asignados. Mismo lenguaje visual que las cards del
// app del repartidor: superficies limpias, navy #09193B, un solo acento.
// ────────────────────────────────────────────────────────────────────

const NAVY = "#09193B";
const BRAND = "#eb1902";

/** Ciclos de sondeo lentos (~20 s) antes del aviso de espera prolongada. */
const PROLONGED_AFTER_CYCLES = 6;

function phaseTone(phase: CustomerTrackingPhase): "search" | "progress" | "done" | "cancelled" {
  if (phase === "searching") return "search";
  if (phase === "delivered") return "done";
  if (phase === "cancelled") return "cancelled";
  return "progress";
}

/** Barra de espera: decrece suave de izquierda a derecha; sin números. */
function WaitingBar({ active }: { active: boolean }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
      role="progressbar"
      aria-label="Esperando asignación"
    >
      <div className={active ? "tracking-search-bar" : "h-full w-full"} />
    </div>
  );
}

function DriverAvatar({ foto, nombre }: { foto: unknown; nombre: string | null }) {
  const src =
    typeof foto === "object" && foto !== null && "asset" in foto
      ? (foto as { asset?: { url?: string } }).asset?.url
      : null;
  if (src) {
    return (
      <Image
        src={src}
        alt={nombre ? `Foto de ${nombre}` : "Repartidor"}
        width={56}
        height={56}
        className="h-14 w-14 rounded-full object-cover"
      />
    );
  }
  const initial = (nombre ?? "R").trim().charAt(0).toUpperCase();
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-black text-white"
      style={{ backgroundColor: NAVY }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

export default function OrderTrackingScreen({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const { state, fetchState, notFound } = useOrderTracking(orderNumber);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelledDone, setCancelledDone] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const slowCyclesRef = useRef(0);
  const previousPhaseRef = useRef<CustomerTrackingPhase | null>(null);

  // Contador de ciclos lentos para el aviso de espera prolongada. Solo aplica
  // mientras phase === "searching"; cualquier asignación lo reinicia.
  useEffect(() => {
    if (state?.phase === "searching") {
      slowCyclesRef.current += 1;
    } else {
      slowCyclesRef.current = 0;
    }
  }, [state?.phase, state?.updatedAt]);

  // Anuncio accesible SOLO al cambiar de fase (texto vivo pequeño; la
  // animación de la barra nunca es el único canal de información).
  useEffect(() => {
    const previous = previousPhaseRef.current;
    const current = state?.phase ?? null;
    if (current && current !== previous) {
      previousPhaseRef.current = current;
      if (previous !== null) {
        setAnnouncement(state?.phaseLabel ?? "");
      }
    }
  }, [state?.phase, state?.phaseLabel]);

  const phase = state?.phase ?? "searching";
  const tone = phaseTone(phase);
  const isSearch = phase === "searching";
  const showProlonged = isSearch && slowCyclesRef.current >= PROLONGED_AFTER_CYCLES;
  const prolongedCopy = showProlonged
    ? state?.prolonged ?? {
        message: "La búsqueda está tardando más de lo normal",
        hint: "Seguimos buscando por ti. También puedes cancelar tu pedido si prefieres.",
      }
    : null;

  const details = useMemo(() => {
    const summary = state?.summary;
    const lines: string[] = [];
    if (summary?.items?.length) {
      for (const item of summary.items) {
        lines.push(`${item.quantity}× ${item.name}`);
      }
    }
    return lines;
  }, [state?.summary]);

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "customer_cancelled_from_tracking" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "No pudimos cancelar tu pedido.");
      }
      setConfirmCancel(false);
      setCancelledDone(true);
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "No pudimos cancelar tu pedido.");
    } finally {
      setCancelling(false);
    }
  };

  // ── Estados sin datos ──────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <MapPin className="mx-auto h-10 w-10 text-gray-300" />
          <h1 className="mt-4 text-xl font-bold" style={{ color: NAVY }}>
            Pedido no encontrado
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Verifica el enlace o consulta tus pedidos desde tu cuenta.
          </p>
          <button
            onClick={() => router.push("/orders")}
            className="mt-6 w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:brightness-95"
            style={{ backgroundColor: BRAND }}
          >
            Ver mis pedidos
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (cancelledDone || phase === "cancelled") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="ui-enter w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <CheckCircle2 className="h-7 w-7 text-gray-500" />
          </div>
          <h1 className="mt-4 text-xl font-bold" style={{ color: NAVY }}>
            Pedido cancelado
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {state.paymentStatus === "requires_refund"
              ? "Tu pago fue registrado y el reembolso se procesará automáticamente."
              : "Tu pedido fue cancelado. Puedes volver a pedir cuando quieras."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:brightness-95"
            style={{ backgroundColor: BRAND }}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const paymentIcon = state.paymentMethod === "cash_on_delivery" ? (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
      <Banknote className="h-4 w-4" /> Efectivo al recibir
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
      <CreditCard className="h-4 w-4" /> Pago con tarjeta
    </span>
  );

  return (
    <div className="min-h-screen bg-gray-50 px-4 pb-10 pt-8">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className="mx-auto w-full max-w-md space-y-4">
        {/* ── Estado principal ── */}
        <div
          key={phase}
          className={`ui-enter rounded-2xl border bg-white p-6 shadow-sm transition-colors ${
            tone === "cancelled" ? "border-gray-200" : "border-gray-200"
          }`}
        >
          <div className="flex items-center justify-center">
            {tone === "done" ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            ) : isSearch ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${NAVY}0d` }}>
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: NAVY }} />
              </div>
            ) : null}
          </div>

          <h1 className="mt-4 text-center text-xl font-extrabold leading-snug" style={{ color: NAVY }}>
            {state.phaseLabel}
          </h1>
          {state.phaseHint && (
            <p className="mt-1.5 text-center text-sm text-gray-500">{state.phaseHint}</p>
          )}

          {/* Barra de espera: solo mientras se busca repartidor */}
          {isSearch && (
            <div className="mt-5">
              <WaitingBar active />
              <p className="sr-only" role="status">
                Buscando repartidor
              </p>
            </div>
          )}

          {/* Aviso de espera prolongada / sin repartidores: humano y breve */}
          {prolongedCopy && (
            <div className="ui-enter mt-5 rounded-xl bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-900">{prolongedCopy.message}</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">{prolongedCopy.hint}</p>
            </div>
          )}

          {/* Reconexión temporal: nunca parece un fallo del pedido */}
          {fetchState === "reconnecting" && (
            <p className="mt-4 text-center text-xs font-medium text-gray-400">
              Reconectando…
            </p>
          )}
        </div>

        {/* ── Repartidor (solo cuando ya existe) ── */}
        {state.driver && (
          <div className="ui-enter rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <DriverAvatar foto={state.driver.foto} nombre={state.driver.nombre} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold" style={{ color: NAVY }}>
                  {state.driver.nombre ?? "Tu repartidor"}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-gray-500">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {state.driver.calificacion != null
                    ? state.driver.calificacion.toFixed(1)
                    : "Repartidor verificado"}
                </p>
              </div>
            </div>
            {details.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Tu pedido
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-800">
                  {details.slice(0, 3).join(" · ")}
                  {details.length > 3 ? ` · +${details.length - 3}` : ""}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Card plegable de detalles ── */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between px-5 py-4"
          >
            <span className="text-sm font-bold" style={{ color: NAVY }}>
              Detalles del pedido
            </span>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                detailsOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {detailsOpen && (
            <div className="ui-enter space-y-4 border-t border-gray-100 px-5 pb-5 pt-4">
              <div className="flex items-start gap-3">
                <Store className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{state.summary.storeName}</p>
                  {state.summary.storeAddress && (
                    <p className="mt-0.5 text-xs text-gray-500">{state.summary.storeAddress}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{state.summary.destination || "Tu dirección"}</p>
                  {state.summary.destinationReference && (
                    <p className="mt-0.5 text-xs text-gray-500">Ref: {state.summary.destinationReference}</p>
                  )}
                </div>
              </div>

              {details.length > 0 && (
                <ul className="space-y-1.5 border-t border-gray-100 pt-3">
                  {details.map((line) => (
                    <li key={line} className="text-sm text-gray-700">
                      {line}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                {paymentIcon}
                <span className="text-base font-black" style={{ color: NAVY }}>
                  {state.summary.total != null
                    ? `$${state.summary.total.toFixed(2)} ${state.summary.currency}`
                    : ""}
                </span>
              </div>

              <p className="text-center text-[11px] font-mono text-gray-400">
                #{state.orderNumber}
              </p>
            </div>
          )}
        </div>

        {/* ── Acciones discretas ── */}
        <div className="space-y-2">
          {confirmCancel ? (
            <div className="ui-enter rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold" style={{ color: NAVY }}>
                ¿Seguro que quieres cancelar tu pedido?
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {state.paymentStatus === "paid"
                  ? "El pago será reembolsado automáticamente."
                  : "Esta acción no se puede deshacer."}
              </p>
              {cancelError && (
                <p className="mt-2 text-xs font-medium text-red-600">{cancelError}</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  disabled={cancelling}
                  className="rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  Seguir esperando
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="rounded-xl py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {cancelling ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Sí, cancelar"}
                </button>
              </div>
            </div>
          ) : state.canCancel ? (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="w-full rounded-2xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-500 shadow-sm transition hover:text-gray-700"
            >
              Cancelar pedido
            </button>
          ) : null}

          <p className="text-center text-xs text-gray-400">
            ¿Necesitas ayuda?{" "}
            <a href="#" className="font-semibold underline underline-offset-2" style={{ color: BRAND }} onClick={(event) => {
              event.preventDefault();
              // El launcher de soporte vive en el layout global; abrirlo si existe.
              const w = window as unknown as { $chatwoot?: { toggle: (state?: "open" | "close") => void } };
              if (w.$chatwoot) w.$chatwoot.toggle("open");
              else router.push("/orders");
            }}>
              Contacta soporte
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
