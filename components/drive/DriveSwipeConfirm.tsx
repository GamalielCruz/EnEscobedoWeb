"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useDragControls, useMotionValue, useTransform } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import {
  classifySwipeEnd,
  swipeFillPct,
  swipeProgressPct,
  swipeTravelPx,
} from "@/lib/drive/swipe-gesture";
import { recordSwipeTrace, type SwipeTraceEntryType } from "@/lib/drive/swipe-trace";

/**
 * Control reutilizable de confirmación por DESLIZAMIENTO (swipe-to-confirm).
 *
 * Se usa para confirmar RECOLECCIÓN y ENTREGA (nunca para aceptar una oferta,
 * que se resuelve con ACEPTAR + X). Exige arrastrar el thumb hasta el extremo
 * derecho: evita activaciones accidentales (toques involuntarios, golpes en el
 * bolsillo, spam de toques) y pide una intención explícita.
 *
 * Estados: idle → confirming (carga) → done (feedback visual + háptico). Si la
 * acción falla, regresa a idle con háptico de error y el thumb vuelve con
 * animación de resorte.
 *
 * - Haptics: navigator.vibrate (ticks al cruzar tercios del recorrido, patrón
 *   al confirmar, patrón largo al fallar). Silencioso si no está disponible.
 * - dragMomentum={false} + dragElastic={0}: sin "fling" — solo el arrastre
 *   completo hasta el extremo confirma.
 * - dragConstraints (ref del track): el thumb nunca sale del carril.
 * - touch-action: none (NO pan-y): el navegador no puede reclamar este gesto
 *   como scroll vertical. Antes `pan-y` autorizaba a WebKit a quedarse el
 *   toque como paneo del cuerpo del sheet, lo que dispara `pointercancel` a
 *   mitad del deslizamiento y el control "volvía solo" sin confirmar. El
 *   scroll del cuerpo del sheet y el arrastre de su cabecera no cambian; lo
 *   único que se pierde es arrastrar el cuerpo empezando el dedo sobre la
 *   barra (56 px de alto).
 * - Cancelación: `pointercancel` / `touchcancel` NO son un release. Framer
 *   entrega ambos por `onDragEnd` (PanSession registra `pointercancel` en el
 *   mismo handler que `pointerup`), así que aquí una bandera propia
 *   (`cancelledRef`) los distingue y el control vuelve a 0 SIN confirmar
 *   aunque el thumb estuviera en el extremo: un gesto que el navegador se
 *   quedó no es intención completa del repartidor.
 * - Traza (staging): `mount`/`unmount`, pointer down/move/up/cancel,
 *   touchcancel, lostpointercapture, fin del drag con % y motivo, y resultado
 *   de la acción. Sin sumidero conectado no graba nada.
 *
 * Visual: rectángulo (esquinas rectas), color principal de ElMenu para el
 * progreso y la flecha; alto contraste y lectura inmediata.
 */

type SwipeState = "idle" | "confirming" | "done";

function buzz(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* sin vibración disponible: solo feedback visual */
  }
}

export function DriveSwipeConfirm({
  onComplete,
  label = "Desliza para confirmar",
  successLabel = "Confirmado",
  stage = null,
  serviceKind = null,
}: {
  /** Acción asíncrona; true = confirmada, false = regresar a idle. */
  onComplete: () => Promise<boolean>;
  /** Texto inicial dentro del track. */
  label?: string;
  /** Texto tras completar (mientras el padre avanza de etapa). */
  successLabel?: string;
  /** Etapa del pedido al momento del gesto (solo traza). */
  stage?: string | null;
  /** Tipo de pedido: la recolección de restaurante no tiene acción de servidor. */
  serviceKind?: "restaurant" | "mandado" | null;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastTickRef = useRef(0);
  const [state, setState] = useState<SwipeState>("idle");
  /**
   * true ⇔ el gesto murió por `pointercancel`/`touchcancel`. Se reinicia en
   * cada `pointerdown`. Es la única forma de distinguir "el navegador se quedó
   * el gesto" de "el repartidor soltó el dedo", porque framer los entrega por
   * el mismo `onDragEnd`.
   */
  const cancelledRef = useRef(false);
  /** Último progreso registrado (throttle de la traza de movimiento). */
  const lastMoveTraceRef = useRef({ at: 0, pct: -1 });

  // El arrastre se inicia desde TODA la barra (no solo el thumb): el gesto
  // natural es deslizar sobre el control, no apuntar a los 48 px del thumb.
  const dragControls = useDragControls();

  const x = useMotionValue(0);

  /** Recorrido máximo del thumb (ancho del track − ancho del thumb − inset). */
  const maxSwipeX = (): number => swipeTravelPx(trackRef.current?.clientWidth ?? 0);

  /** Ancho del track (solo para el % del relleno en la traza). */
  const trackWidth = (): number => trackRef.current?.clientWidth ?? 0;

  /** Traza: una sola puerta para no repetir etapa/tipo en cada llamada. */
  const traceSwipe = (
    type: SwipeTraceEntryType,
    extra: {
      x?: number | null;
      max?: number | null;
      pct?: number | null;
      fillPct?: number | null;
      reason?: string | null;
      result?: string | null;
      pointerType?: string | null;
    } = {}
  ): void => {
    recordSwipeTrace({ type, stage, serviceKind, ...extra });
  };

  // Remontaje vs cancelación: si el control desaparece a mitad del gesto, la
  // traza lo muestra como unmount (Fase 10: la etapa viene del GPS).
  useEffect(() => {
    traceSwipe("mount", { result: `stage=${stage ?? "-"}` });
    return () => {
      traceSwipe("unmount");
    };
    // Solo montaje/desmontaje: no se re-registra cuando cambian las props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Relleno del track y desvanecido del texto según el avance del thumb.
  const fillWidth = useTransform(x, (v) => {
    const maxX = maxSwipeX();
    return `${Math.max(0, Math.min(100, (v / maxX) * 100))}%`;
  });
  const labelOpacity = useTransform(x, (v) => {
    const maxX = maxSwipeX();
    return Math.max(0, Math.min(1, 1 - (v / maxX) * 1.6));
  });

  const runConfirm = async () => {
    if (state !== "idle") return;
    setState("confirming");
    traceSwipe("confirm", {
      x: x.get(),
      max: maxSwipeX(),
      pct: swipeProgressPct(x.get(), maxSwipeX()),
      fillPct: swipeFillPct(x.get(), trackWidth()),
      reason: "start",
    });
    buzz([15, 30, 15]);
    let ok = false;
    try {
      ok = await onComplete();
    } catch {
      ok = false;
      traceSwipe("confirm", { reason: "throw" });
    }
    traceSwipe("confirm", {
      reason: "result",
      result: ok ? "ok" : "false",
      pct: swipeProgressPct(x.get(), maxSwipeX()),
      fillPct: swipeFillPct(x.get(), trackWidth()),
    });
    if (ok) {
      // El thumb queda al fondo a la derecha con check verde: feedback visual
      // de éxito mientras el padre avanza a la siguiente etapa.
      setState("done");
      buzz([40, 60, 40]);
    } else {
      setState("idle");
      buzz(80);
      animate(x, 0, { type: "spring", stiffness: 400, damping: 35 });
    }
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={(event) => {
        // Sin dragListener en el thumb: el pointerdown de CUALQUIER punto de la
        // barra arranca el arrastre (comportamiento estándar de swipe-to-confirm).
        cancelledRef.current = false;
        traceSwipe("pointer-down", {
          pointerType: event.pointerType,
          reason: state === "idle" ? "drag-start" : `ignored:${state}`,
        });
        if (state === "idle") dragControls.start(event);
      }}
      onPointerMove={(event) => {
        // Progreso para la traza (no una fila por frame: ≥100 ms y ≥3 puntos).
        const maxX = maxSwipeX();
        const pct = swipeProgressPct(x.get(), maxX);
        const now = Date.now();
        const last = lastMoveTraceRef.current;
        if (now - last.at < 100 && Math.abs(pct - last.pct) < 3) return;
        lastMoveTraceRef.current = { at: now, pct };
        traceSwipe("pointer-move", {
          x: x.get(),
          max: maxX,
          pct,
          fillPct: swipeFillPct(x.get(), trackWidth()),
          pointerType: event.pointerType,
        });
      }}
      onPointerUp={(event) => {
        // Mejor esfuerzo: en táctil el pointerup llega al track por captura
        // implícita; el cierre autoritativo del gesto es `onDragEnd`.
        const maxX = maxSwipeX();
        traceSwipe("pointer-up", {
          x: x.get(),
          max: maxX,
          pct: swipeProgressPct(x.get(), maxX),
          fillPct: swipeFillPct(x.get(), trackWidth()),
          pointerType: event.pointerType,
        });
      }}
      onPointerCancel={(event) => {
        cancelledRef.current = true;
        const maxX = maxSwipeX();
        traceSwipe("pointer-cancel", {
          x: x.get(),
          max: maxX,
          pct: swipeProgressPct(x.get(), maxX),
          fillPct: swipeFillPct(x.get(), trackWidth()),
          pointerType: event.pointerType,
          reason: "browser-took-gesture",
        });
      }}
      onTouchCancel={() => {
        cancelledRef.current = true;
        const maxX = maxSwipeX();
        traceSwipe("touch-cancel", {
          x: x.get(),
          max: maxX,
          pct: swipeProgressPct(x.get(), maxX),
          fillPct: swipeFillPct(x.get(), trackWidth()),
          reason: "touch-cancelled",
        });
      }}
      onLostPointerCapture={(event) => {
        // Informativo: llega DESPUÉS del up/cancel (captura implícita del toque).
        traceSwipe("lost-pointer-capture", {
          pointerType: event.pointerType,
          reason: cancelledRef.current ? "after-cancel" : "after-release",
        });
      }}
      className="relative h-14 cursor-grab select-none overflow-hidden bg-[#09193B] active:cursor-grabbing"
      style={{ touchAction: "none" }}
    >
      {/* Relleno de progreso: color principal de ElMenu */}
      <motion.div
        className="absolute inset-y-0 left-0 bg-[#EB1902]"
        style={{ width: fillWidth }}
        aria-hidden
      />

      {/* Etiqueta central; se desvanece al arrastrar */}
      <motion.p
        style={{ opacity: labelOpacity }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center px-14 text-center text-sm font-black uppercase tracking-wide text-white/90"
        aria-hidden={state !== "idle"}
      >
        {state === "done" ? successLabel : label}
      </motion.p>

      {/* Thumb arrastrable (framer actualiza x durante el drag; las
          constraints del track limitan el recorrido a [0, maxX]) */}
      <motion.div
        drag={state === "idle" ? "x" : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={trackRef}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, touchAction: "none" }}
        onDrag={() => {
          // Háptico corto al cruzar cada tercio (guía táctil sin mirar).
          const maxX = maxSwipeX();
          const tick = Math.floor(x.get() / (maxX / 3));
          if (tick > lastTickRef.current && x.get() < maxX - 4) {
            lastTickRef.current = tick;
            buzz(8);
          }
        }}
        onDragEnd={() => {
          lastTickRef.current = 0;
          const maxX = maxSwipeX();
          const value = x.get();
          // Cancelado ≠ soltado: un gesto que el navegador se quedó vuelve a 0
          // SIEMPRE (nunca confirma, ni siquiera con el thumb en el extremo).
          const reason = classifySwipeEnd({ x: value, maxX, cancelled: cancelledRef.current });
          traceSwipe("drag-end", {
            x: value,
            max: maxX,
            pct: swipeProgressPct(value, maxX),
            fillPct: swipeFillPct(value, trackWidth()),
            reason,
            result: reason === "threshold" ? "confirm" : "reset",
          });
          if (reason === "threshold") {
            void runConfirm();
          } else {
            // Release antes del umbral o cancelación: el thumb vuelve al inicio.
            animate(x, 0, { type: "spring", stiffness: 400, damping: 35 });
          }
        }}
        className="pointer-events-none absolute bottom-1 left-1 top-1 flex w-12 items-center justify-center bg-white shadow-md ring-1 ring-black/5"
        role="button"
        tabIndex={0}
        aria-label={state === "done" ? successLabel : label}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void runConfirm();
          }
        }}
      >
        {state === "confirming" ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#EB1902]" />
        ) : state === "done" ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <ArrowRight className="h-5 w-5 text-[#EB1902]" />
        )}
      </motion.div>
    </div>
  );
}
