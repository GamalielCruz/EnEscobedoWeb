"use client";

import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  MapPin,
  Package,
  Store,
} from "lucide-react";
import type { DriveNavPhase } from "@/components/drive/DriveNavBar";
import type { DriverOrder } from "@/hooks/useDriverState";
import { DriveSwipeConfirm } from "@/components/drive/DriveSwipeConfirm";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";

/**
 * Panel de DETALLES del pedido (TripDetails del DriveTripSheet expandido).
 *
 * UNA SOLA FUENTE DE CONTEXTO: destino, folio y paso pertenecen a la CABECERA
 * del contenedor (TripHeader del DriveTripSheet). Cuando este panel vive dentro
 * del sheet se le pasa `showContext={false}` y `headerDestination`: así el
 * cuerpo empieza directamente con la acción de la etapa ("Recoge tu pedido") y
 * nunca repite la dirección ni el número de pedido. Solo usado de forma
 * autonoma (panel de "entrega completada") pinta su propio contexto.
 *
 * Jerarquía de lectura: 1) destino (cabecera), 2) qué hacer, 3) producto,
 * 4) ubicación/referencia, 5) pago, 6) acción.
 *
 * Flujo de RECOLECCIÓN:
 * - Sin paso visual "Llegué al punto": la llegada se detecta sola (GPS).
 *   En el punto se muestra directamente QUÉ recoger y el deslizador
 *   (DriveSwipeConfirm) para confirmar.
 * - Al confirmar, el backend marca `picked_up` y el viaje avanza a entrega.
 *
 * Flujo de ENTREGA:
 * - Mismo patrón deslizable para confirmar la entrega; si el servidor exige
 *   NIP, se conserva el formulario de 6 dígitos como gate.
 *
 * VISUAL: sin "tarjeta dentro de tarjeta". Separadores y acentos en lugar de
 * contenedores redondeados; una sola acción principal por estado.
 */

const CTA_CLASS =
  "flex w-full items-center justify-center gap-2 bg-[#09193B] py-3.5 text-sm font-black text-white transition hover:bg-[#0d2347] active:scale-[0.99] disabled:opacity-50";

function EntityChip({ stage }: { stage: DriveNavPhase }) {
  const tone =
    stage === "to_pickup" || stage === "at_pickup"
      ? "bg-orange-50 text-orange-500"
      : stage === "done"
        ? "bg-green-50 text-green-600"
        : "bg-red-50 text-red-500";
  const icon =
    stage === "to_pickup" || stage === "at_pickup" ? (
      <Store className="h-4 w-4" />
    ) : stage === "done" ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : (
      <MapPin className="h-4 w-4" />
    );
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center ${tone}`}>
      {icon}
    </span>
  );
}

/**
 * Destacado de QUÉ RECOGER: el contenido del pedido en una sola lectura.
 * - Mandado: `mandadoDetails` (lo que pidió el cliente).
 * - Restaurante: los productos del pedido ("2× Coca-Cola 600 ml").
 * Sin duplicar tienda ni dirección: eso vive solo en la línea secundaria.
 */
function PickupHighlight({ order }: { order: DriverOrder }) {
  const lines: string[] = [];
  if (order.mandadoDetails) {
    lines.push(order.mandadoDetails);
  } else if (order.itemsSummary && order.itemsSummary.length > 0) {
    order.itemsSummary.forEach((name, index) => {
      const quantity = index === 0 && order.itemsQuantity && order.itemsQuantity > 1 ? order.itemsQuantity : null;
      lines.push(quantity ? `${quantity}× ${name}` : name);
    });
  }
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 border-l-4 border-orange-400 bg-orange-50/70 px-3 py-2">
      {lines.map((line) => (
        <p
          key={line}
          className="flex items-start gap-2 text-sm font-bold leading-snug text-[#09193B]"
        >
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * Ubicación secundaria del paso (pickup o entrega).
 *
 * La dirección del destino ya se lee en la cabecera contextual del sheet, así
 * que `hidden` la oculta y aquí solo queda lo que aporta información nueva
 * (una referencia, o la dirección de la tienda cuando la cabecera muestra
 * solo el nombre).
 */
function LocationLine({
  label,
  address,
  reference,
  hidden,
}: {
  label: string;
  address?: string | null;
  reference?: string | null;
  hidden?: boolean;
}) {
  // La dirección solo se agrega si es distinta del propio label (evita
  // duplicar el mandado: label == dirección del origen).
  const effectiveAddress = address && address !== label ? address : null;
  const parts = [
    hidden ? null : label,
    effectiveAddress,
    reference ? `Ref: ${reference}` : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-400">
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="leading-snug">{parts.join(" · ")}</span>
    </p>
  );
}

function MoneyRow({ order }: { order: DriverOrder }) {
  return (
    <div className="mt-3 flex items-center justify-between border-y border-gray-100 py-2 text-sm">
      <span className="font-semibold text-[#09193B]">{order.paymentLabel}</span>
      {order.totalPrice > 0 && (
        <span className="font-black tabular-nums text-[#09193B]">
          ${order.totalPrice.toFixed(2)}
        </span>
      )}
    </div>
  );
}

export function DriveOrderDetails({
  order,
  stage,
  loading,
  error,
  onPrimaryAction,
  onPinSubmit,
  showContext = true,
  headerDestination = null,
}: {
  order: DriverOrder;
  /** Etapa real de navegación (navPhase de la página; sin estados nuevos). */
  stage: DriveNavPhase;
  /** true mientras la acción de etapa (picked_up / delivered / NIP) está en curso. */
  loading: boolean;
  /** Error de la última acción (p. ej. NIP incorrecto, bloqueado o expirado). */
  error: string | null;
  /** Acción backend de la etapa (picked_up / delivered); true = confirmada. */
  onPrimaryAction: () => Promise<boolean>;
  /** Valida el NIP contra el servidor; false = no se pudo confirmar. */
  onPinSubmit: (pin: string) => Promise<boolean>;
  /** false = el contenedor (DriveTripSheet) ya pinta el contexto del viaje. */
  showContext?: boolean;
  /** Destino ya mostrado por la cabecera del contenedor (no repetirlo). */
  headerDestination?: string | null;
}) {
  const [pin, setPin] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const orderCode = shortOrderCode(order.orderNumber);
  const pickupLabel = order.mandadoOriginLabel ?? order.storeName;
  const deliveryLabel = order.mandadoDestinationLabel ?? order.destLabel;

  const isPickupStage = stage === "to_pickup" || stage === "at_pickup";
  const showPinForm = stage === "at_delivery" && order.requiresDeliveryPin;

  // Entidad protagonista de la etapa: punto de recogida antes, destinatario
  // después (SOLO con datos reales; si no hay nombre, la dirección es el
  // contexto y no se inventa un nombre).
  const entityLabel = isPickupStage
    ? pickupLabel
    : order.customerName ?? deliveryLabel;

  // Progreso de la tarea del viaje: recolección = paso 1, entrega = paso 2.
  // En "done" el viaje ya terminó: no hay paso que anunciar.
  const stepLabel =
    stage === "done" ? null : isPickupStage ? "Paso 1 de 2" : "Paso 2 de 2";

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
      {/* CONTEXTO (solo fuera del sheet y fuera de "done"): entidad de la
          etapa + folio + paso. En "done" NO hay barra de contexto: la
          confirmación limpia es la única superficie (folio una vez, secundario
          dentro del bloque verde). Dentro del sheet esto lo pinta la cabecera
          única, no se duplica. */}
      {showContext && stage !== "done" && (
        <div className="flex items-center gap-3">
          <EntityChip stage={stage} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-[#09193B]">
              {entityLabel}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              #{orderCode}
              {stepLabel ? ` · ${stepLabel}` : ""}
            </p>
          </div>
        </div>
      )}

      {/* FOLIO ÚNICO: el número de pedido aparece UNA sola vez en pantalla,
          como texto secundario del panel (la barra superior y la cabecera de
          la hoja ya no lo muestran). */}
      {stage !== "done" && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Pedido #{orderCode}
        </p>
      )}

      {/* 2 · QUÉ RECOGER (recolección) / 3 · ENTREGA */}
      {isPickupStage && (
        <>
          {/* Encabezado principal: qué hacer. Al llegar, el contenido
              destacado (QUÉ recoger) aparece inmediatamente debajo. */}
          <p className="mt-3 text-lg font-extrabold leading-snug text-[#09193B]">
            Recoge tu pedido
          </p>
          <PickupHighlight order={order} />
          {/* Tienda/dirección: información SECUNDARIA, una sola vez.
              Si la cabecera ya muestra el nombre, aquí solo queda la
              dirección (y la referencia si existe). */}
          <LocationLine
            label={pickupLabel}
            address={order.storeAddress}
            reference={order.mandadoOriginReference}
            hidden={pickupLabel === headerDestination}
          />

          <MoneyRow order={order} />

          {/* Confirmación por deslizaje: SOLO EN el punto. La llegada se
              detecta sola (GPS); sin paso visual "Llegué al punto". */}
          {stage === "at_pickup" && (
            <div className="mt-3">
              <DriveSwipeConfirm
                onComplete={onPrimaryAction}
                label="Desliza para confirmar recolección"
                successLabel="Recolección confirmada"
              />
            </div>
          )}
          {error && (
            <p className="mt-2 text-xs font-medium text-red-500">{error}</p>
          )}
        </>
      )}

      {(stage === "to_delivery" || stage === "at_delivery") && !showPinForm && (
        <>
          <p className="mt-3 text-lg font-extrabold leading-snug text-[#09193B]">
            Entrega tu pedido
          </p>
          <LocationLine
            label={deliveryLabel}
            reference={order.mandadoDestinationReference}
            hidden={deliveryLabel === headerDestination}
          />

          <MoneyRow order={order} />

          {/* Confirmación por deslizaje: SOLO EN el destino. */}
          {stage === "at_delivery" && (
            <div className="mt-3">
              <DriveSwipeConfirm
                onComplete={onPrimaryAction}
                label="Desliza para confirmar entrega"
                successLabel="Entrega confirmada"
              />
            </div>
          )}
          {error && (
            <p className="mt-2 text-xs font-medium text-red-500">{error}</p>
          )}
        </>
      )}

      {/* Entrega con NIP: aparece SOLO al llegar, si la entrega lo requiere */}
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
            className="mt-1 w-full border border-gray-200 bg-gray-50 px-3 py-2.5 text-center text-lg font-black tracking-[0.4em] text-[#09193B] placeholder:text-gray-300 focus:border-[#09193B] focus:outline-none"
          />
          {(pinError || error) && (
            <p className="mt-2 text-xs font-medium text-red-500">
              {pinError ?? error}
            </p>
          )}
          <button
            type="submit"
            disabled={pinSubmitting || loading}
            className={`mt-3 ${CTA_CLASS}`}
          >
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

      {/* COMPLETADO: confirmación limpia (resumen mínimo). Sin bloque de
          contexto: icono verde + "Entrega completada" + folio UNA vez como
          dato secundario + pago/ganancia. */}
      {stage === "done" && (
        <>
          <div className="mt-3 flex flex-col items-center bg-green-50 py-4 text-green-700">
            <CheckCircle2 className="h-8 w-8" />
            <p className="mt-1.5 text-base font-black">Entrega completada</p>
            <p className="mt-0.5 text-xs font-medium text-green-700/70">
              Pedido #{orderCode}
            </p>
          </div>
          <MoneyRow order={order} />
        </>
      )}
    </div>
  );
}
