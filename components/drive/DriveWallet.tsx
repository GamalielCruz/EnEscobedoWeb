"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/mexico-time";
import type { DriverWallet } from "@/lib/driver-wallet";

/**
 * WALLET DEL REPARTIDOR — ganancias y saldo (solo lectura).
 *
 * Consume GET /api/driver/wallet (server-driven, igual que el resto de
 * Drive): el servidor deriva el saldo de los pedidos ENTREGADOS, cada uno
 * con `driverPayout` (la parte del repartidor con el porcentaje de ElMenu
 * ya descontado al crearse el pedido).
 *
 * Estados: loading → error (reintentar) → datos. Fail-closed: si algo
 * falla no se muestran cifras parciales ni inventadas.
 */

const dateTimeFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function dateLabel(iso: string): string {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? dateTimeFmt.format(ms) : "—";
}

export function DriveWallet() {
  const [wallet, setWallet] = useState<DriverWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/driver/wallet", { signal, cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok || !body?.wallet) {
        throw new Error(body?.error || "No pudimos cargar tu wallet.");
      }
      setWallet(body.wallet as DriverWallet);
    } catch (err) {
      if (signal.aborted) return;
      setError(
        err instanceof Error && err.message
          ? err.message
          : "No pudimos cargar tu wallet."
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  // Un solo punto de entrada (montaje y "Reintentar"): aborta cualquier
  // petición anterior para que la última respuesta sea siempre la válida.
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

  // ── Cargando ────────────────────────────────────────────────────────
  if (loading && !wallet) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando wallet" />
      </div>
    );
  }

  // ── Error (fail-closed: sin cifras, con reintento) ──────────────────
  if (error && !wallet) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center bg-red-50 text-red-400">
          <Wallet className="h-7 w-7" />
        </span>
        <p className="mt-5 text-base font-black text-[#09193B]">
          No pudimos cargar tu wallet
        </p>
        <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-gray-500">
          {error}
        </p>
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

  if (!wallet) return null;

  const { summary, deliveries } = wallet;

  // ── Datos ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-6">
      {/* Billetera: disponible para retiro (total ganado − ya pagado). */}
      <div className="bg-[#09193B] p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-wide text-white/60">
          En tu billetera
        </p>
        <p className="mt-1 text-4xl font-black tabular-nums">
          {formatMoney(summary.available)}
        </p>
        <p className="mt-2 text-xs font-medium text-white/70">
          {formatMoney(summary.totalEarned)} ganados en total ·{" "}
          {formatMoney(summary.totalSettled)} ya pagados
        </p>
      </div>

      {/* Ganancias del día + semana (hora de México, server-driven). */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="border-2 border-[#09193B] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Hoy
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums text-[#09193B]">
            {formatMoney(summary.today)}
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500">
            {summary.todayCount === 1
              ? "1 servicio completado"
              : `${summary.todayCount} servicios completados`}
          </p>
        </div>
        <div className="border-2 border-gray-200 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Esta semana
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums text-[#09193B]">
            {formatMoney(summary.week)}
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500">Últimos 7 días</p>
        </div>
      </div>

      {/* Últimas entregas: la ganancia de cada servicio ya neta. */}
      <h3 className="mt-8 text-xs font-bold uppercase tracking-wide text-gray-500">
        Últimos servicios
      </h3>

      {deliveries.length === 0 ? (
        <div className="mt-3 border-2 border-dashed border-gray-200 p-6 text-center">
          <p className="text-sm font-bold text-[#09193B]">
            Aún no tienes servicios completados
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Cuando entregues tu primer pedido, tus ganancias aparecerán aquí.
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100 border border-gray-100">
          {deliveries.slice(0, 20).map((d) => (
            <li key={d.orderNumber} className="flex items-center justify-between gap-3 px-3 py-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-black text-[#09193B]">
                    #{d.folio}
                  </span>
                  {d.settled && (
                    <span className="border border-green-200 bg-green-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-green-700">
                      Pagado
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs font-semibold text-gray-500">
                  {d.serviceKind === "mandado" ? "Mandado · " : ""}
                  {d.placeLabel}
                </span>
                <span className="mt-0.5 block text-[11px] font-medium text-gray-400">
                  {dateLabel(d.deliveredAt)}
                </span>
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums text-[#09193B]">
                +{formatMoney(d.payout)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
