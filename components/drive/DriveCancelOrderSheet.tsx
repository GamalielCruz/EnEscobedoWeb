"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  type PanInfo,
} from "framer-motion";
import { Loader2, X } from "lucide-react";
import {
  DRIVER_CANCELLATION_REASONS,
  CANCELLATION_NOTE_MAX_LENGTH,
} from "@/lib/order-cancellation";
import {
  DRIVE_MOTION_DURATION,
  DRIVE_MOTION_EASE,
  DRIVE_ELEVATION,
} from "@/components/drive/motion";

/**
 * HOJA DE CANCELACIÓN — segundo nivel del menú ⋮ de la Hoja de ruta.
 *
 * Se abre al elegir "Cancelar pedido" en el menú ⋮ del tramo ACTUAL en "Tu
 * ruta" y es una CAPA aparte (misma mecánica que la Hoja de ruta): queda por
 * encima de ambas, así que nunca comparten superficie.
 *
 * Contenido: motivo obligatorio (catálogo único en lib/order-cancellation.ts)
 * + detalles libres opcionales. La confirmación es explícita (botón rojo), no
 * automática al tocar un motivo. El motivo se persiste en la orden
 * (`order.cancellation`) vía /api/driver/action con action "cancel_order".
 */
export function DriveCancelOrderSheet({
  open,
  onClose,
  /** Folio del pedido que se cancela (contexto para el repartidor). */
  orderNumber,
  /** Ejecuta la cancelación; `ok: false` mantiene la hoja abierta. */
  onConfirm,
  /** Altura visible del panel de pedido: la hoja nunca puede ser más baja
   *  (garantiza que el panel colapsado detrás quede cubierto por completo). */
  coverHeight,
}: {
  open: boolean;
  onClose: () => void;
  orderNumber?: string | null;
  onConfirm: (input: {
    reason: string;
    note: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  coverHeight?: number | null;
}) {
  const dragControls = useDragControls();

  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada apertura empieza limpia (nunca arrastra la selección anterior).
  useEffect(() => {
    if (open) {
      setReason(null);
      setNote("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onConfirm({ reason, note: note.trim() });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo cancelar el pedido.");
      return;
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cancel-order-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Cancelar pedido"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{
            duration: DRIVE_MOTION_DURATION.standard,
            ease: DRIVE_MOTION_EASE.enter,
          }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 1 }}
          dragSnapToOrigin
          onDragEnd={(_: unknown, info: PanInfo) => {
            if (info.offset.y > 80 || info.velocity.y > 500) onClose();
          }}
          className={`${DRIVE_ELEVATION.sheet} fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col border-t border-black/[0.06] bg-white safe-area-bottom`}
          style={{ minHeight: coverHeight ?? undefined }}
        >
          <div
            onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
              dragControls.start(e);
            }}
            className="shrink-0 touch-none select-none"
          >
            <div className="flex justify-center pb-1 pt-2">
              <span className="h-1 w-10 bg-gray-300" aria-hidden />
            </div>

            <div className="flex items-center gap-1 pb-1 pl-4 pr-2">
              <h2 className="min-w-0 flex-1 text-base font-black text-[#09193B]">
                Cancelar pedido
              </h2>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                disabled={submitting}
                aria-label="Cerrar Cancelar pedido"
                className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 transition active:text-[#09193B] disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="px-4 pb-3 text-xs font-medium text-gray-500">
              {orderNumber ? `Pedido #${orderNumber}. ` : ""}
              Elige el motivo de la cancelación; quedará registrado en el
              pedido.
            </p>
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-5">
            <ul role="radiogroup" aria-label="Motivo de cancelación">
              {DRIVER_CANCELLATION_REASONS.map((option) => {
                const selected = reason === option.code;
                return (
                  <li key={option.code}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setReason(option.code);
                        setError(null);
                      }}
                      className={`flex w-full items-center gap-3 border-b border-gray-100 py-3 text-left transition active:bg-gray-50 ${
                        selected ? "text-[#09193B]" : "text-gray-700"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          selected ? "border-[#EB1902]" : "border-gray-300"
                        }`}
                        aria-hidden
                      >
                        {selected && (
                          <span className="h-2.5 w-2.5 rounded-full bg-[#EB1902]" />
                        )}
                      </span>
                      <span
                        className={`min-w-0 flex-1 text-sm leading-tight ${
                          selected ? "font-black" : "font-semibold"
                        }`}
                      >
                        {option.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <label className="mt-4 block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Detalles (opcional)
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={CANCELLATION_NOTE_MAX_LENGTH}
                rows={3}
                placeholder="Explica brevemente qué pasó"
                className="mt-1.5 w-full border-2 border-gray-200 p-3 text-sm font-medium text-[#09193B] outline-none transition focus:border-[#09193B]"
              />
            </label>

            {error && (
              <p className="mt-3 border-l-4 border-[#EB1902] bg-red-50 px-3 py-2 text-xs font-bold text-[#850C22]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!reason || submitting}
              className="mt-4 flex w-full items-center justify-center gap-2 bg-[#EB1902] py-4 text-base font-black uppercase tracking-wide text-white transition active:scale-[0.99] disabled:bg-gray-200 disabled:text-gray-500"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Cancelando…
                </>
              ) : (
                "Cancelar pedido"
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="mt-2 w-full py-3 text-sm font-bold text-gray-500 transition active:text-[#09193B] disabled:opacity-40"
            >
              Conservar el pedido
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
