"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  type PanInfo,
} from "framer-motion";
import { CircleSlash, MoreVertical, X, XCircle } from "lucide-react";
import {
  DRIVE_MOTION_DURATION,
  DRIVE_MOTION_EASE,
  DRIVE_ELEVATION,
} from "@/components/drive/motion";

/**
 * HOJA DE RUTA — modal independiente del panel de pedido.
 *
 * Es una CAPA aparte (no comparte superficie con "Recoge tu pedido"):
 * - Solo se abre con "Ver ruta" del panel de pedido.
 * - Se coloca POR ENCIMA del panel y lo oculta por completo (`coverHeight`
 *   garantiza cubrir al menos la altura visible del panel).
 * - Termina después de su propio contenido: título + parada actual +
 *   tarjeta "Detener nuevos pedidos" (si está configurada). Nunca producto,
 *   pago, folio ni CTA de recolección.
 *
 * CIERRE (tres formas, ninguna capa bloqueante sobre el mapa):
 * - "×" arriba a la derecha (área táctil 44 px).
 * - Swipe down desde el handle.
 * - Tocar el mapa fuera de la hoja (lo detecta la página en el propio mapa).
 *
 * MENÚ ⋮ (acciones del viaje en curso): vive en la parada ACTUAL ("Ahora"), no
 * en el panel de pedido, porque es el tramo que el repartidor está realizando.
 * Su panel desplegable se ancla al propio botón midiendo el rectángulo (el
 * cuerpo de la hoja tiene scroll, así que un desplegable en flujo se recortaría).
 *
 * SEGURIDAD AL CONDUCIR: con el vehículo en movimiento (≥ 2 m/s ≈ 7 km/h) la
 * consulta sigue permitida, pero los cambios de disponibilidad se deshabilitan
 * con el aviso mínimo "Cambia esta opción al detenerte".
 */

/** Velocidad mínima (m/s) a partir de la cual se considera "en movimiento". */
export const MOVING_SPEED_MPS = 2;

export type RouteStop = {
  kind: "pickup" | "delivery";
  /** Etiqueta de la parada: "Recoger" / "Entregar" / "Siguiente servicio". */
  label: string;
  /** Dirección CORTA (ya recortada por la página; nunca la completa). */
  shortAddress: string;
  /** Estado de la parada: "Ahora" / "Después". */
  status: string;
};

export function DriveRouteSheet({
  open,
  onClose,
  /** Máx. 2 paradas (la página recorta). */
  stops,
  /** true = el conductor decidió NO recibir más pedidos (intención vigente). */
  stopped,
  /** Activa "Detener nuevos pedidos" (agrega la tarjeta, sin confirmación). */
  onStopOffers,
  /** La "×" de la tarjeta: vuelve a quedar disponible de inmediato. */
  onResumeOffers,
  /** true cuando el vehículo está en movimiento (≥ MOVING_SPEED_MPS). */
  moving = false,
  /** Altura visible del panel de pedido: la hoja nunca puede ser más baja. */
  coverHeight,
  /** Abre el flujo de cancelación del viaje en curso (hoja de motivos).
   *  Sin handler, el menú ⋮ no se muestra. */
  onRequestCancel,
}: {
  open: boolean;
  onClose: () => void;
  stops: RouteStop[];
  stopped: boolean;
  onStopOffers: () => void;
  onResumeOffers: () => void;
  moving?: boolean;
  coverHeight?: number | null;
  onRequestCancel?: () => void;
}) {
  const dragControls = useDragControls();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  /** Posición del desplegable, RELATIVA a la hoja (px). null = cerrado. */
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  // El desplegable se ancla midiendo el botón: el cuerpo de la hoja scrollea y
  // recortaría cualquier panel que viviera dentro de él.
  const openMenu = () => {
    const button = menuButtonRef.current;
    const sheet = sheetRef.current;
    if (!button || !sheet) return;
    const buttonRect = button.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    setMenuPos({
      top: buttonRect.bottom - sheetRect.top + 6,
      right: Math.max(8, sheetRect.right - buttonRect.right),
    });
  };

  // Cierra al tocar fuera, con Escape o al redimensionar (la posición dejaría
  // de ser válida). Quedan excluidos el botón (para permitir el toggle) y el
  // propio panel: si se desmontara al pointerdown, el click del item se
  // perdería y "Cancelar pedido" no abriría la hoja de motivos.
  useEffect(() => {
    if (!menuPos) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target) return;
      if (menuButtonRef.current?.contains(target)) return;
      if (menuPanelRef.current?.contains(target)) return;
      setMenuPos(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuPos(null);
    };
    const onResize = () => setMenuPos(null);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [menuPos]);

  // Al cerrarse la hoja (o al cambiar de viaje) el menú no sobrevive.
  useEffect(() => {
    if (!open) setMenuPos(null);
  }, [open]);

  // La tarjeta de fin de ruta solo cabe si no hay siguiente servicio (que
  // tiene prioridad sobre la tarjeta).
  const showStopCard = stopped && stops.length === 1;
  const showStopButton = !stopped && stops.length === 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={sheetRef}
          key="route-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Tu ruta"
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
          className={`${DRIVE_ELEVATION.sheet} fixed inset-x-0 bottom-0 z-40 flex max-h-[45dvh] flex-col border-t border-black/[0.06] bg-white safe-area-bottom`}
          style={{ minHeight: coverHeight ?? undefined }}
        >
          <div
            onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
              dragControls.start(e);
            }}
            className="shrink-0 touch-none select-none"
          >
            {/* Handle (zona de swipe down) */}
            <div className="flex justify-center pb-1 pt-2">
              <span className="h-1 w-10 bg-gray-300" aria-hidden />
            </div>

            {/* Título + "×" de cierre (esquina superior derecha, 44 px). */}
            <div className="flex items-center gap-1 pl-4 pr-2 pb-1">
              <h2 className="min-w-0 flex-1 text-base font-black text-[#09193B]">
                Tu ruta
              </h2>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                aria-label="Cerrar Tu ruta"
                className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 transition active:text-[#09193B]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div
            className="min-h-0 overflow-y-auto px-5 pb-5"
            onScroll={() => setMenuPos(null)}
          >
            {/* Línea vertical simple: punto → línea → punto / tarjeta. */}
            <div>
              {stops.map((stop, index) => {
                const isLast = index === stops.length - 1 && !showStopCard;
                // La parada ACTUAL es la que el repartidor está realizando: ahí
                // viven las acciones del viaje (⋮), no en el panel de pedido.
                const isCurrent = stop.status === "Ahora";
                return (
                  <div key={`${stop.label}-${index}`} className="flex gap-3.5">
                    <div className="flex w-5 shrink-0 flex-col items-center">
                      <span
                        className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                          stop.status === "Ahora"
                            ? "border-[#EB1902] bg-[#EB1902]"
                            : "border-gray-300 bg-white"
                        }`}
                      />
                      {!isLast && <span className="w-0.5 flex-1 bg-gray-200" />}
                    </div>

                    <div className={`min-w-0 flex-1 ${isLast ? "pb-1" : "pb-4"}`}>
                      <p className="text-base font-black leading-tight text-[#09193B]">
                        {stop.label}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-medium text-gray-500">
                        {stop.shortAddress}
                      </p>
                      <p
                        className={`mt-0.5 text-xs font-bold uppercase tracking-wide ${
                          stop.status === "Ahora" ? "text-[#EB1902]" : "text-gray-400"
                        }`}
                      >
                        {stop.status}
                      </p>
                    </div>

                    {/* ── MENÚ ⋮ DEL VIAJE EN CURSO ──────────────────────
                        Solo en la parada actual. Su desplegable se dibuja en la
                        raíz de la hoja (ver más abajo) para no quedar recortado
                        por el scroll del cuerpo. */}
                    {isCurrent && onRequestCancel && (
                      <div className="shrink-0">
                        <button
                          ref={menuButtonRef}
                          type="button"
                          onClick={() => (menuPos ? setMenuPos(null) : openMenu())}
                          aria-label="Más opciones del viaje"
                          aria-haspopup="menu"
                          aria-expanded={menuPos != null}
                          className="-mr-3 -mt-1 flex h-11 w-11 items-center justify-center text-gray-400 transition active:text-[#09193B]"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* FIN DE RUTA: tarjeta conectada a la línea. */}
              {showStopCard && (
                <div className="flex gap-3.5">
                  <div className="flex w-5 shrink-0 flex-col items-center">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#09193B]">
                      <CircleSlash className="h-3.5 w-3.5 text-white" strokeWidth={2.75} />
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 items-start gap-2 border-2 border-gray-200 p-2.5 pl-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black leading-tight text-[#09193B]">
                        Detener nuevos pedidos
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-gray-500">
                        Este será tu último pedido
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={moving ? undefined : onResumeOffers}
                      disabled={moving}
                      aria-label="Seguir recibiendo pedidos"
                      className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center text-[#09193B] transition active:bg-gray-100 disabled:opacity-40"
                    >
                      <X className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sin tarjeta: acción única, grande, al final de la ruta. */}
            {showStopButton && (
              <>
                <button
                  type="button"
                  onClick={moving ? undefined : onStopOffers}
                  disabled={moving}
                  className="mt-3 flex w-full items-center justify-center gap-2.5 border-2 border-gray-200 py-3.5 text-sm font-black text-[#09193B] transition active:scale-[0.99] disabled:opacity-40"
                >
                  <CircleSlash className="h-4 w-4" strokeWidth={2.5} />
                  Detener nuevos pedidos
                </button>
                {moving && (
                  <p className="mt-2 text-center text-xs font-semibold text-gray-500">
                    Cambia esta opción al detenerte
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── DESPLEGABLE DEL ⋮ ──────────────────────────────────────
              Anclado al botón de la parada actual (coordenadas medidas), por
              fuera del cuerpo con scroll para que nunca se recorte. */}
          <AnimatePresence>
            {menuPos && onRequestCancel && (
              <motion.div
                ref={menuPanelRef}
                role="menu"
                aria-label="Opciones del viaje"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{
                  duration: DRIVE_MOTION_DURATION.fast,
                  ease: DRIVE_MOTION_EASE.enter,
                }}
                style={{ top: menuPos.top, right: menuPos.right }}
                className="absolute z-50 w-56 border border-gray-200 bg-white py-1 shadow-2xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuPos(null);
                    onRequestCancel();
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-bold text-[#EB1902] transition active:bg-gray-50"
                >
                  <XCircle className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                  Cancelar pedido
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
