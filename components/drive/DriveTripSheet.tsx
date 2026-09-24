"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  type PanInfo,
} from "framer-motion";
import { ChevronDown, ChevronUp, MapPin, Route, Store } from "lucide-react";
import type { DriveNavPhase } from "@/components/drive/DriveNavBar";
import { DriveOrderDetails } from "@/components/drive/DriveOrderDetails";
import type { DriverOrder } from "@/hooks/useDriverState";
import {
  DRIVE_MOTION_DURATION,
  DRIVE_MOTION_EASE,
  DRIVE_ELEVATION,
} from "@/components/drive/motion";

/**
 * PANEL DE PEDIDO ACTIVO — panel inferior principal durante la conducción.
 *
 * Muestra SOLO el pedido en curso: qué recoger ("Recoge tu pedido"), el
 * producto, la dirección de la tienda, el pago/importe y el deslizador de
 * confirmación cuando corresponde (todo vive en DriveOrderDetails).
 *
 * NO contiene "Tu ruta", paradas, "Detener nuevos pedidos" ni controles de
 * disponibilidad: eso es la Hoja de ruta, un componente INDEPENDIENTE que se
 * abre con el botón "Ver ruta" de este encabezado y que se coloca por encima
 * de este panel (ver DriveRouteSheet). Nunca comparten superficie blanca.
 *
 * ARQUITECTURA DE ANCLAJE (corrige el bug de "despegue"):
 * - La hoja vive dentro de un contenedor `fixed` anclado al viewport
 *   (`bottom: 0`) que monta la página. Nunca sale del borde inferior.
 * - La hoja tiene SIEMPRE su altura completa de layout (cabecera + cuerpo).
 *   El gesto SOLO mueve `translateY` entre dos límites estrictos:
 *       minTranslateY = 0          → EXPANDED (todo visible)
 *       maxTranslateY = h - hCab   → COLLAPSED (solo la cabecera visible)
 *   Con `dragElastic={0}` el arrastre se topa en seco en ambos límites.
 *
 * GESTO: el drag se inicia SOLO desde la cabecera (handle). Así el cuerpo
 * (scroll interno) y la hoja no compiten por el mismo gesto vertical.
 *
 * VISUAL: rectángulo (esquinas rectas), borde superior limpio, sombra sutil,
 * jerarquía tipográfica fuerte y sin "tarjeta dentro de tarjeta".
 */
export function DriveTripSheet({
  order,
  stage,
  actionLoading,
  actionError,
  onStageAction,
  onPinSubmit,
  /** Abre la Hoja de ruta (capa independiente por encima de este panel). */
  onOpenRoute,
  /** true mientras la Hoja de ruta está abierta: este panel se colapsa para
   *  quedar oculto detrás de ella (y se restaura al cerrarse). */
  hidden = false,
  /** Token externo (tocar el mapa) que colapsa el panel. */
  collapseToken = 0,
  /** true cuando el tramo activo está en modo "llegando" (<150 m). */
  arriving = false,
  /** Entidad protagonista de la etapa, p. ej. "Frida Café" o el cliente. */
  entityLabel,
  /** Etapa hacia dónde va la entidad (para el icono del estado colapsado). */
  entityKind,
  /** Distancia glanceable ya formateada ("450 m") o null. */
  glanceDistance,
  /** Altura visible en COLLAPSED (px). La página la usa para anclar los
   *  controles de cámara justo encima de la hoja. */
  onCollapsedHeightChange,
  /** Notifica a la página si la hoja está EXPANDIDA (regla de distancia
   *  única: la barra oculta la distancia cuando el panel la muestra). */
  onExpandedChange,
  children,
}: {
  order: DriverOrder;
  /** Etapa real de navegación (navPhase de la página). */
  stage: DriveNavPhase | null;
  /** true mientras la acción de etapa (recogí/entregué/NIP) está en curso. */
  actionLoading: boolean;
  /** Error de la última acción de etapa. */
  actionError: string | null;
  /** Ejecuta la acción backend de la etapa; true = confirmada. */
  onStageAction: () => Promise<boolean>;
  /** Valida el NIP server-side; false = no se pudo confirmar. */
  onPinSubmit: (pin: string) => Promise<boolean>;
  onOpenRoute?: () => void;
  hidden?: boolean;
  collapseToken?: number;
  arriving?: boolean;
  entityLabel?: string | null;
  entityKind?: "pickup" | "delivery" | null;
  glanceDistance?: string | null;
  onCollapsedHeightChange?: (height: number) => void;
  onExpandedChange?: (expanded: boolean) => void;
  /** Contenido extra (p. ej. otros pedidos activos) dentro del cuerpo. */
  children?: ReactNode;
}) {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragControls = useDragControls();

  const y = useMotionValue(0);
  const maxYRef = useRef(0);

  const [expanded, setExpanded] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);

  const maxY = Math.max(0, sheetHeight - headerHeight);
  maxYRef.current = maxY;
  // Hasta medir, la hoja se oculta para no mostrar un frame en posición 0
  // (despegada visualmente). En cuanto hay límites, aparece anclada.
  const ready = sheetHeight > 0 && headerHeight > 0;

  // ── Snap limpio a un estado concreto (nunca intermedio) ──────────
  const animateTo = useCallback(
    (next: boolean) => {
      setExpanded(next);
      animate(y, next ? 0 : maxYRef.current, {
        duration: DRIVE_MOTION_DURATION.standard,
        ease: DRIVE_MOTION_EASE.enter,
      });
    },
    [y]
  );
  // Referencia estable para que la página reaccione a expandir/colapsar
  // (regla de distancia única en la barra superior).
  const onExpandedChangeRef = useRef(onExpandedChange);
  onExpandedChangeRef.current = onExpandedChange;

  // ── Medición de la hoja y de la cabecera (para los límites del drag) ──
  useEffect(() => {
    const sheet = sheetRef.current;
    const header = headerRef.current;
    if (!sheet || !header) return;

    const measure = () => {
      setSheetHeight(sheet.offsetHeight);
      setHeaderHeight(header.offsetHeight);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Reporta la altura colapsada a la página (controles de cámara encima).
  useEffect(() => {
    if (headerHeight > 0) onCollapsedHeightChange?.(headerHeight);
  }, [headerHeight, onCollapsedHeightChange]);

  // Notifica el estado expandido (regla de distancia única en la barra).
  useEffect(() => {
    onExpandedChangeRef.current?.(expanded);
  }, [expanded]);

  // Al cambiar los límites (medición inicial, resize, cambio de contenido)
  // la hoja se recoloca SIEMPRE anclada. La primera medición es instantánea;
  // los cambios por expandir/colapsar sí animan, para que la transición se
  // lea como una expansión del MISMO componente.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (maxY <= 0) return;
    const target = expanded ? 0 : maxY;
    if (!initializedRef.current) {
      initializedRef.current = true;
      y.set(target);
      return;
    }
    animate(y, target, {
      duration: DRIVE_MOTION_DURATION.standard,
      ease: DRIVE_MOTION_EASE.enter,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxY]);

  // ── OCULTAMIENTO POR LA HOJA DE RUTA ────────────────────────────
  // Al abrirse la capa superior, este panel se colapsa para quedar cubierto
  // por completo; al cerrarse, se RESTAURA exactamente el estado que tenía
  // (colapsado o expandido).
  const prevHiddenRef = useRef(false);
  const expandedBeforeHiddenRef = useRef(false);
  useEffect(() => {
    const wasHidden = prevHiddenRef.current;
    prevHiddenRef.current = hidden;
    if (hidden && !wasHidden) {
      expandedBeforeHiddenRef.current = expanded;
      if (expanded) animateTo(false);
    } else if (!hidden && wasHidden) {
      if (expandedBeforeHiddenRef.current) animateTo(true);
      expandedBeforeHiddenRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, animateTo]);

  // ── CIERRE POR TOQUE EN EL MAPA ─────────────────────────────────
  // La página incrementa `collapseToken` cuando el usuario toca el mapa. El
  // panel colapsa de inmediato; no hay ninguna capa que capture esos toques.
  const collapseTokenRef = useRef(collapseToken);
  useEffect(() => {
    if (collapseTokenRef.current === collapseToken) return;
    collapseTokenRef.current = collapseToken;
    if (expanded) animateTo(false);
  }, [collapseToken, expanded, animateTo]);

  // ── AUTO-EXPAND-ONCE ─────────────────────────────────────────────
  // Solo en la TRANSICIÓN hacia una etapa de llegada/acción (o al activarse
  // "llegando", o al completarse el viaje). El colapso manual persiste hasta
  // la próxima firma distinta.
  const arrivalSignature =
    stage === "at_pickup" || stage === "at_delivery" || stage === "done"
      ? stage
      : arriving && (stage === "to_pickup" || stage === "to_delivery")
        ? `${stage}+arriving`
        : null;
  const prevArrivalSignature = useRef<string | null>(null);
  useEffect(() => {
    if (arrivalSignature && arrivalSignature !== prevArrivalSignature.current) {
      animateTo(true);
    }
    prevArrivalSignature.current = arrivalSignature;
  }, [arrivalSignature, animateTo]);

  const isPickupStage = stage === "to_pickup" || stage === "at_pickup";
  const pickupLabel = order.mandadoOriginLabel ?? order.storeName;
  const deliveryLabel = order.mandadoDestinationLabel ?? order.destLabel;

  const compactEntity = entityLabel ?? (isPickupStage ? pickupLabel : deliveryLabel);
  const compactKind = entityKind ?? (isPickupStage ? "pickup" : "delivery");
  const compactDistance =
    stage === "to_pickup" || stage === "to_delivery" ? glanceDistance ?? null : null;

  const stageLabel: string | null =
    stage === "to_pickup"
      ? "Recolección"
      : stage === "at_pickup"
        ? "En el punto de recogida"
        : stage === "to_delivery"
          ? "Entrega"
          : stage === "at_delivery"
            ? "En el destino"
            : null;

  return (
    <motion.div
      ref={sheetRef}
      className={`${DRIVE_ELEVATION.sheet} absolute inset-x-0 bottom-0 z-20 flex max-h-[64dvh] flex-col border-t border-black/[0.06] bg-white safe-area-bottom will-change-transform ${
        ready ? "" : "invisible"
      }`}
      style={{ y }}
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: maxY }}
      dragElastic={0}
      dragMomentum={false}
      onDragEnd={(_: unknown, info: PanInfo) => {
        const wantsCollapse = info.offset.y > 48 || info.velocity.y > 320;
        const wantsExpand = info.offset.y < -48 || info.velocity.y < -320;
        if (wantsCollapse) animateTo(false);
        else if (wantsExpand) animateTo(true);
        else animateTo(expanded); // sin intención clara → regresa a su estado
      }}
    >
      {/* ── CABECERA: handle + "Ver ruta" + lectura del pedido. Es también la
          zona de drag: solo desde aquí se mueve la hoja. ──────────────── */}
      <div
        ref={headerRef}
        onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
          dragControls.start(e);
        }}
        className="shrink-0 touch-none select-none border-b border-gray-100 bg-white"
      >
        {/* Fila del handle con "Ver ruta" a la derecha (grid de 3 columnas para
            mantener el handle perfectamente centrado). */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center pb-1 pl-4 pr-3 pt-2">
          <span aria-hidden />
          <span className="h-1 w-10 justify-self-center bg-gray-300" aria-hidden />
          {stage !== "done" && onOpenRoute ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onOpenRoute}
              aria-label="Ver ruta"
              aria-haspopup="dialog"
              className="flex h-9 items-center gap-1.5 justify-self-end border border-gray-200 px-2.5 text-xs font-black text-[#09193B] transition active:scale-95"
            >
              <Route className="h-3.5 w-3.5" />
              Ver ruta
            </button>
          ) : (
            <span aria-hidden />
          )}
        </div>

        {stage !== "done" && (
          <button
            type="button"
            onClick={() => animateTo(!expanded)}
            className="flex w-full items-center gap-3 px-4 pb-2.5 pt-1 text-left"
            aria-expanded={expanded}
            aria-label={
              expanded ? "Ocultar el pedido" : "Ver el pedido"
            }
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center ${
                compactKind === "pickup"
                  ? "bg-orange-50 text-orange-500"
                  : "bg-red-50 text-red-500"
              }`}
            >
              {compactKind === "pickup" ? (
                <Store className="h-4 w-4" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold leading-tight text-[#09193B]">
                {compactEntity}
              </span>
              <span className="mt-0.5 block truncate text-xs font-medium text-gray-500">
                {stageLabel ?? ""}
              </span>
            </span>

            {/* REGLA DE DISTANCIA ÚNICA: aquí vive la distancia mientras el
                panel está visible (la barra superior la omite). */}
            {compactDistance && (
              <span className="shrink-0 text-base font-black tabular-nums text-[#09193B]">
                {compactDistance}
              </span>
            )}
            {expanded ? (
              <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
            ) : (
              <ChevronUp className="h-5 w-5 shrink-0 text-gray-400" />
            )}
          </button>
        )}
      </div>

      {/* ── CUERPO: SOLO el pedido activo (qué recoger, producto, dirección,
          pago y deslizador). La ruta vive en su propia hoja. ─────────── */}
      <div
        className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-3 pt-3"
        aria-hidden={!expanded}
      >
        {stage != null ? (
          <DriveOrderDetails
            order={order}
            stage={stage}
            loading={actionLoading}
            error={actionError}
            onPrimaryAction={onStageAction}
            onPinSubmit={onPinSubmit}
            /* El encabezado del panel ya es el contexto del viaje. */
            showContext={false}
            headerDestination={compactEntity}
          />
        ) : (
          /* Fallback técnico solo si la etapa no está representada. */
          <p className="py-2 text-center text-xs font-bold text-gray-400">
            Pedido #{order.orderNumber}
          </p>
        )}

        {/* Otros pedidos activos (raro; se conserva el comportamiento previo) */}
        {children}
      </div>
    </motion.div>
  );
}
