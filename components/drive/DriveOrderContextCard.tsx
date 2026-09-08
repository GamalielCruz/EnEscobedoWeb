"use client";

import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  MapPin,
  Store,
  User,
} from "lucide-react";
import type { DriveNavPhase } from "@/components/drive/DriveNavBar";
import type { DriverOrder } from "@/hooks/useDriverState";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";

/**
 * Contexto del pedido para el repartidor durante la navegación.
 *
 * Sustituye las etiquetas técnicas (RECOLECCIÓN / ENTREGA) por el lenguaje
 * natural de la tarea: QUIÉN es el protagonista (restaurante antes de
 * recoger, destinatario después) y QUÉ hay que hacer ("Recoge el pedido
 * #576799", "Entrega el pedido #576799").
 *
 * Jerarquía visual: CONTEXTO (entidad) → INFORMACIÓN (acción/dirección) →
 * ACCIÓN (botón principal o formulario de NIP). El NIP SOLO aparece cuando
 * la entrega lo requiere y el repartidor ya llegó (requiresDeliveryPin lo
 * decide el gate del servidor; nunca se evalúa en el cliente).
 *
 * Reutiliza el lenguaje visual de la app de reparto: tarjeta blanca,
 * texto #09193B, chips tintados, botón navy #09193B (igual que OrderCard)
 * y radios/bordes de DriveTripSheet. Sin gradientes ni sombras nuevas.
 */

const PRIMARY_CTA_CLASS =
  "mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#09193B] py-3 text-sm font-black text-white shadow-lg transition hover:bg-[#0d2347] active:scale-95 disabled:opacity-50";

function EntityChip({ stage }: { stage: DriveNavPhase }) {
  const tone =
    stage === "to_pickup" || stage === "at_pickup"
      ? "bg-orange-50 text-orange-500"
      : stage === "done"
        ? "bg-green-50 text-green-500"
        : "bg-red-50 text-red-500";
  const icon =
    stage === "to_pickup" || stage === "at_pickup" ? (
      <Store className="h-4.5 w-4.5" />
    ) : stage === "done" ? (
      <CheckCircle2 className="h-4.5 w-4.5" />
    ) : (
      <User className="h-4.5 w-4.5" />
    );
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
      {icon}
    </span>
  );
}

export function DriveOrderContextCard({
  order,
  stage,
  loading,
  error,
  onPrimaryAction,
  onPinSubmit,
}: {
  order: DriverOrder;
  /** Etapa real de navegación (navPhase de la página; sin estados nuevos). */
  stage: DriveNavPhase;
  loading: boolean;
  /** Error de la última acción (p. ej. NIP incorrecto, bloqueado o expirado). */
  error: string | null;
  /** Acción backend de la etapa (picked_up / delivered) ya existente. */
  onPrimaryAction: () => void;
  /** Valida el NIP contra el servidor; false = no se pudo confirmar. */
  onPinSubmit: (pin: string) => Promise<boolean>;
}) {
  const [pin, setPin] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const orderCode = shortOrderCode(order.orderNumber);
  const pickupLabel = order.mandadoOriginLabel ?? order.storeName;
  const deliveryLabel = order.mandadoDestinationLabel ?? order.destLabel;
  // Destinatario SOLO con datos reales: si no hay nombre, la dirección es
  // el contexto (no se inventa un nombre).
  const recipientName = order.customerName;
  const entityLabel =
    stage === "to_pickup" || stage === "at_pickup"
      ? pickupLabel
      : recipientName ?? deliveryLabel;

  const isPickupStage = stage === "to_pickup" || stage === "at_pickup";
  const showPinForm = stage === "at_delivery" && order.requiresDeliveryPin;

  const submitPin = async (event: FormEvent) => {
    event.preventDefault();
    if (pinSubmitting) return;
    if (!/^\d{6}$/.test(pin)) {
      setPinError("Ingresa los 6 dígitos del código.");
      return;
    }
    setPinSubmitting(true);
    setPinError(null);
    const ok = await onPinSubmit(pin);
    setPinSubmitting(false);
    if (ok) setPin("");
  };

  return (
    <div>
      {/* CONTEXTO: entidad protagonista de la etapa */}
      <div className="flex items-center gap-2.5">
        <EntityChip stage={stage} />
        <p className="min-w-0 flex-1 truncate text-base font-bold text-[#09193B]">
          {entityLabel}
        </p>
      </div>

      {/* ACCIÓN en lenguaje natural; el folio nunca es el protagonista */}
      <p className="mt-1.5 text-sm font-semibold text-gray-500">
        {stage === "to_pickup" && `Recoge el pedido #${orderCode}`}
        {stage === "at_pickup" && `Pedido #${orderCode} listo para recoger`}
        {(stage === "to_delivery" || stage === "at_delivery") &&
          `Entrega${stage === "at_delivery" ? " del" : " el"} pedido #${orderCode}`}
        {stage === "done" && "Entrega completada"}
      </p>

      {/* INFORMACIÓN secundaria con datos reales del pedido */}
      {!isPickupStage && recipientName && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{deliveryLabel}</span>
        </p>
      )}
      {isPickupStage && order.serviceKind === "mandado" && order.mandadoDetails && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-400">{order.mandadoDetails}</p>
      )}

      {/* ACCIÓN principal según la etapa (botones/lógica existentes).
          La confirmación de recolección SOLO existe para mandados
          (picked_up); los restaurantes no tienen esa acción en la
          arquitectura actual, así que no se inventa. */}
      {stage === "at_pickup" && order.serviceKind === "mandado" && (
        <button
          onClick={onPrimaryAction}
          disabled={loading}
          className={PRIMARY_CTA_CLASS}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "YA RECOGÍ EL MANDADO"
          )}
        </button>
      )}

      {stage === "at_delivery" && !showPinForm && (
        <button
          onClick={onPrimaryAction}
          disabled={loading}
          className={PRIMARY_CTA_CLASS}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "CONFIRMAR ENTREGA"
          )}
        </button>
      )}

      {/* ESTADO 6: el NIP aparece SOLO al llegar, si la entrega lo requiere */}
      {showPinForm && (
        <form onSubmit={submitPin} className="mt-3">
          <label
            htmlFor="drive-delivery-pin"
            className="text-xs font-bold uppercase tracking-wide text-gray-500"
          >
            Código de entrega
          </label>
          <input
            id="drive-delivery-pin"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
              setPinError(null);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="······"
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-center text-lg font-black tracking-[0.4em] text-[#09193B] placeholder:text-gray-300 focus:border-[#09193B] focus:outline-none"
          />
          {(pinError || error) && (
            <p className="mt-1.5 text-xs font-medium text-red-500">{pinError ?? error}</p>
          )}
          <button type="submit" disabled={pinSubmitting || loading} className={PRIMARY_CTA_CLASS}>
            {pinSubmitting || loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                Confirmar entrega
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
