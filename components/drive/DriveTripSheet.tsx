"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Loader2, MapPin, Store } from "lucide-react";
import type { DriveNavPhase } from "@/components/drive/DriveNavBar";
import { DriveOrderContextCard } from "@/components/drive/DriveOrderContextCard";
import type { DriverOrder } from "@/hooks/useDriverState";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";
import {
  DRIVE_MOTION_DURATION,
  DRIVE_MOTION_EASE,
  DRIVE_ELEVATION,
  DRIVE_RADIUS,
} from "@/components/drive/motion";

/**
 * Hoja inferior (bottom sheet) del viaje activo del repartidor.
 *
 * Fase 4 — superficie física continua (sin remounts):
 * - COLAPSADA: manija + identidad del destino actual (entidad + distancia
 *   glanceable) + folio/tipo de pedido.
 * - EXPANDIDA: el MISMO cuerpo persiste y crece (height/opacity), con el
 *   timeline Recolección → Entrega, distancia/tiempo/pago/monto, notas y
 *   desconexión. Nunca se desmonta: la expansión se siente como crecimiento
 *   de la misma superficie, no como un componente nuevo.
 *
 * AUTO-EXPANSIÓN ÚNICA: al ENTRAR a at_pickup / at_delivery (o al activarse
 * "llegando" en un tramo), la hoja se expande una sola vez para exponer la
 * CTA. El colapso manual del repartidor se respeta hasta la SIGUIENTE
 * transición de etapa (sin bucles de re-expansión render-driven).
 *
 * La navegación GPS ya ocurre dentro de /drive; la animación vive en esta
 * capa de overlay, fuera del hot path rAF/heading (Fase 3 LOCKED).
 */
export function DriveTripSheet({
  order,
  actionKind,
  actionLabel,
  actionIcon,
  stage,
  actionLoading,
  actionError,
  onStageAction,
  onPinSubmit,
  onDisconnect,
  disconnectLoading,
  simulated,
  /** true cuando el tramo activo está en modo "llegando" (<150 m). */
  arriving = false,
  /** Entidad protagonista de la etapa, p. ej. "Frida Café" o el cliente. */
  entityLabel,
  /** Etapa hacia dónde va la entidad (para el chip del estado colapsado). */
  entityKind,
  /** Distancia glanceable ya formateada ("450 m") o null. */
  glanceDistance,
  children,
}: {
  order: DriverOrder;
  /** Acción resuelta de la etapa real (picked_up / delivered). */
  actionKind: string;
  actionLabel: string;
  actionIcon: ReactNode;
  /** Etapa real de navegación (navPhase de la página). */
  stage: DriveNavPhase | null;
  /** true mientras la acción de etapa (recogí/entregué/NIP) está en curso. */
  actionLoading: boolean;
  /** Error de la última acción de etapa. */
  actionError: string | null;
  /** Ejecuta la acción backend de la etapa (lógica existente de la página). */
  onStageAction: () => void;
  /** Valida el NIP server-side; false = no se pudo confirmar. */
  onPinSubmit: (pin: string) => Promise<boolean>;
  onDisconnect: () => void;
  disconnectLoading: boolean;
  simulated?: boolean;
  arriving?: boolean;
  entityLabel?: string | null;
  entityKind?: "pickup" | "delivery" | null;
  glanceDistance?: string | null;
  /** Contenido extra (p. ej. otros pedidos activos) dentro del cuerpo expandido. */
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded((v) => !v);

  // ── AUTO-EXPAND-ONCE ─────────────────────────────────────────────
  // Solo en la TRANSICIÓN hacia una etapa de llegada/acción (o al activarse
  // "llegando"). Firma = etapa+llegando; si ya estaba expandida no se toca;
  // el colapso manual persiste hasta la próxima firma distinta.
  const arrivalSignature =
    stage === "at_pickup" || stage === "at_delivery"
      ? stage
      : arriving && (stage === "to_pickup" || stage === "to_delivery")
        ? `${stage}+arriving`
        : null;
  const prevArrivalSignature = useRef<string | null>(null);
  useEffect(() => {
    if (
      arrivalSignature &&
      arrivalSignature !== prevArrivalSignature.current
    ) {
      setExpanded(true);
    }
    prevArrivalSignature.current = arrivalSignature;
  }, [arrivalSignature]);

  // Etapa del timeline según la acción real del pedido.
  const pickupDone =
    actionKind === "picked_up" || actionKind === "navigate_delivery" || actionKind === "delivered";
  const pickupActive = actionKind === "navigate_pickup";
  const deliveryDone = actionKind === "delivered";
  const deliveryActive = actionKind === "navigate_delivery" || actionKind === "picked_up";

  const pickupLabel = order.mandadoOriginLabel ?? order.storeName;
  const deliveryLabel = order.mandadoDestinationLabel ?? order.destLabel;

  // Identidad colapsada: protagonista de la etapa (fallback al folio).
  const compactEntity = entityLabel ?? null;
  const compactKind = entityKind ?? (deliveryActive ? "delivery" : "pickup");

  // La hoja va en flujo normal dentro del overlay inferior (absolute inset-x-0
  // bottom-0): así los controles de cámara (-top-14) quedan justo encima de la
  // hoja, colapsada o no.
  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.08, bottom: 0.35 }}
      onDragEnd={(_, info) => {
        // Arrastre hacia abajo → colapsar; hacia arriba → expandir.
        if (info.offset.y > 60 || info.velocity.y > 400) setExpanded(false);
        else if (info.offset.y < -60 || info.velocity.y < -400) setExpanded(true);
      }}
      className="relative z-30"
    >
      <div className={`${DRIVE_RADIUS.sheet} ${DRIVE_ELEVATION.sheet} overflow-hidden bg-white safe-area-bottom`}>
        {/* Cuerpo PERSISTENTE: crece/encoge con height+opacity (sin remount,
            sin AnimatePresence). Continuidad espacial entre estados. */}
        <motion.div
          initial={false}
          animate={{
            height: expanded ? "auto" : 0,
            opacity: expanded ? 1 : 0,
          }}
          transition={{ duration: DRIVE_MOTION_DURATION.standard, ease: DRIVE_MOTION_EASE.enter }}
          className="overflow-hidden"
          aria-hidden={!expanded}
        >
          <div className="max-h-[46vh] overflow-y-auto px-4 pb-2 pt-3">
            {/* Timeline vertical Recolección → Entrega */}
            <div className="flex gap-3">
              {/* Línea + puntos */}
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ring-2 ${
                    pickupDone
                      ? "bg-green-500 ring-green-200"
                      : pickupActive
                        ? "bg-orange-500 ring-orange-200"
                        : "bg-gray-200 ring-gray-100"
                  }`}
                >
                  {pickupDone && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                </span>
                <span
                  className={`w-0.5 flex-1 min-h-6 ${
                    deliveryDone || deliveryActive ? "bg-green-300" : "bg-gray-200"
                  }`}
                />
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ring-2 ${
                    deliveryDone
                      ? "bg-green-500 ring-green-200"
                      : deliveryActive
                        ? "bg-red-500 ring-red-200"
                        : "bg-gray-200 ring-gray-100"
                  }`}
                >
                  {deliveryDone && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                </span>
              </div>

              {/* Etiquetas */}
              <div className="flex flex-1 flex-col gap-4 pb-1">
                <div>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      pickupActive
                        ? "text-orange-500"
                        : pickupDone
                          ? "text-green-600"
                          : "text-gray-400"
                    }`}
                  >
                    📍 Recolección{pickupActive && " · ahora"}
                  </p>
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-gray-800">
                    <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
                    <span className="leading-snug">{pickupLabel}</span>
                  </p>
                  {order.mandadoOriginReference && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      Ref: {order.mandadoOriginReference}
                    </p>
                  )}
                </div>
                <div>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      deliveryActive
                        ? "text-red-500"
                        : deliveryDone
                          ? "text-green-600"
                          : "text-gray-400"
                    }`}
                  >
                    📍 Entrega{deliveryActive && " · ahora"}
                  </p>
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-gray-800">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    <span className="leading-snug">{deliveryLabel}</span>
                  </p>
                  {order.mandadoDestinationReference && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      Ref: {order.mandadoDestinationReference}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Métricas del servicio */}
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              {order.routeKm != null && <span>{order.routeKm} km</span>}
              {order.etaMinutes != null && <span>{order.etaMinutes} min</span>}
              <span className="font-medium text-[#09193B]">{order.paymentLabel}</span>
              {order.totalPrice > 0 && (
                <span className="ml-auto font-bold text-[#09193B]">
                  ${order.totalPrice.toFixed(2)}
                </span>
              )}
            </div>

            {/* Notas del pedido (solo mandados) */}
            {order.mandadoDetails && (
              <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 line-clamp-3">
                📝 {order.mandadoDetails}
              </p>
            )}

            {/* Otros pedidos activos (raro; se conserva el comportamiento previo) */}
            {children}

            {/* Desconexión (secundaria, solo expandido) */}
            <button
              onClick={onDisconnect}
              disabled={disconnectLoading}
              className="mt-3 w-full rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-400 transition hover:bg-gray-50"
            >
              {disconnectLoading ? (
                <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
              ) : (
                "Desconectar"
              )}
            </button>
          </div>
        </motion.div>

        {/* Barra fija: manija + identidad del destino actual + folio +
            indicador de etapa actual de navegación. El toggle completo vive
            en la manija; la identidad es informativa (no botón) y la manija
            mantiene el área táctil grande. */}
        <div className="px-4 pt-2 pb-3">
          <div className="flex flex-col items-center">
            <button
              onClick={toggle}
              className="flex w-full flex-col items-center py-0.5"
              aria-expanded={expanded}
              aria-label={expanded ? "Ocultar detalles del pedido" : "Ver detalles del pedido"}
            >
              <span className="h-1 w-10 rounded-full bg-gray-300" />
            </button>

            {/* Identidad glanceable del estado colapsado: QUIÉN es el
                protagonista y a cuánto está (sin expandir). */}
            <div className="mt-1 flex w-full items-center justify-between gap-2">
              {compactEntity ? (
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                      compactKind === "pickup"
                        ? "bg-orange-50 text-orange-500"
                        : "bg-red-50 text-red-500"
                    }`}
                  >
                    {compactKind === "pickup" ? (
                      <Store className="h-3.5 w-3.5" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="truncate text-sm font-bold text-[#09193B]">
                    {compactEntity}
                  </span>
                </div>
              ) : (
                <span className="flex items-center gap-2 text-sm font-bold text-[#09193B]">
                  #{shortOrderCode(order.orderNumber)}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                    {order.serviceKind === "mandado" ? "Mandado" : "Restaurante"}
                  </span>
                </span>
              )}

              <span className="flex shrink-0 items-center gap-1.5">
                {glanceDistance && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-black tabular-nums text-[#09193B]">
                    {glanceDistance}
                  </span>
                )}
                {simulated && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                    🧪 SIM
                  </span>
                )}
                <button
                  onClick={toggle}
                  className="flex items-center gap-0.5 text-[11px] font-medium text-gray-400"
                  aria-label={expanded ? "Ocultar detalles del pedido" : "Ver detalles del pedido"}
                >
                  {expanded ? "Ocultar" : "Detalles"}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </span>
            </div>
          </div>

          {/* Contexto del pedido: entidad + acción natural + CTA (o NIP al
              llegar). Única tarjeta de contexto; sin etiquetas técnicas. */}
          {stage != null ? (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <DriveOrderContextCard
                order={order}
                stage={stage}
                loading={actionLoading}
                error={actionError}
                onPrimaryAction={onStageAction}
                onPinSubmit={onPinSubmit}
              />
            </div>
          ) : (
            /* Fallback técnico solo si la etapa no está representada. */
            <div className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-500">
              {actionIcon}
              {actionLabel}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
