"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Loader2, MapPin, Store } from "lucide-react";
import type { DriverOrder } from "@/hooks/useDriverState";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";

/**
 * Hoja inferior (bottom sheet) del viaje activo del repartidor.
 *
 * Flota sobre el mapa con manija deslizable y dos estados:
 * - COLAPSADA: manija + folio/tipo de pedido + BOTÓN DE ACCIÓN PRINCIPAL
 *   siempre visible (NAVEGAR A RECOLECCIÓN / YA RECOGÍ / NAVEGAR A ENTREGA /
 *   CONFIRMAR ENTREGA según la etapa real del pedido).
 * - EXPANDIDA: timeline vertical Recolección → Entrega marcando la etapa
 *   activa, distancia/tiempo/forma de pago/monto, notas del pedido y el botón
 *   de desconexión (secundario).
 *
 * El cuerpo reutiliza exactamente la lógica existente de la página
 * (getOrderAction → actionKind) y los datos del pedido; aquí solo cambia la
 * presentación. La hoja se arrastra hacia abajo para colapsar y hacia arriba
 * para expandir; también se alterna tocando la manija.
 */
export function DriveTripSheet({
  order,
  actionKind,
  actionLabel,
  actionIcon,
  loading,
  onAction,
  onDisconnect,
  disconnectLoading,
  simulated,
  children,
}: {
  order: DriverOrder;
  /** Acción resuelta de la etapa real (navigate_pickup / picked_up / navigate_delivery / delivered). */
  actionKind: string;
  actionLabel: string;
  actionIcon: ReactNode;
  loading: boolean;
  onAction: () => void;
  onDisconnect: () => void;
  disconnectLoading: boolean;
  simulated?: boolean;
  /** Contenido extra (p. ej. otros pedidos activos) dentro del cuerpo expandido. */
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded((v) => !v);

  // Etapa del timeline según la acción real del pedido.
  const pickupDone =
    actionKind === "picked_up" || actionKind === "navigate_delivery" || actionKind === "delivered";
  const pickupActive = actionKind === "navigate_pickup";
  const deliveryDone = actionKind === "delivered";
  const deliveryActive = actionKind === "navigate_delivery" || actionKind === "picked_up";

  const pickupLabel = order.mandadoOriginLabel ?? order.storeName;
  const deliveryLabel = order.mandadoDestinationLabel ?? order.destLabel;

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
      <div className="overflow-hidden rounded-t-3xl bg-white shadow-2xl safe-area-bottom">
        {/* Cuerpo expandible */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
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
          )}
        </AnimatePresence>

        {/* Barra fija: manija + folio + BOTÓN DE ACCIÓN SIEMPRE VISIBLE */}
        <div className="px-4 pt-2 pb-3">
          <button
            onClick={toggle}
            className="flex w-full flex-col items-center py-0.5"
            aria-expanded={expanded}
            aria-label={expanded ? "Ocultar detalles del pedido" : "Ver detalles del pedido"}
          >
            <span className="h-1 w-10 rounded-full bg-gray-300" />
            <span className="mt-1 flex w-full items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-bold text-[#09193B]">
                #{shortOrderCode(order.orderNumber)}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                  {order.serviceKind === "mandado" ? "Mandado" : "Restaurante"}
                </span>
                {simulated && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                    🧪 SIM
                  </span>
                )}
              </span>
              <span className="flex items-center gap-0.5 text-[11px] font-medium text-gray-400">
                {expanded ? "Ocultar" : "Detalles"}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </span>
            </span>
          </button>

          <button
            onClick={onAction}
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#EB1902] py-3.5 text-sm font-black text-white shadow-lg shadow-[#EB1902]/30 transition active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {actionIcon}
                {actionLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}