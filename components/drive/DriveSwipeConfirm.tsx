"use client";

import { useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

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
 * - touchAction: pan-y: el scroll vertical del sheet sigue funcionando.
 * - Permite cancelar: si el dedo regresa antes del extremo, vuelve a idle.
 *
 * Visual: rectángulo (esquinas rectas), color principal de ElMenu para el
 * progreso y la flecha; alto contraste y lectura inmediata.
 */

const THUMB_WIDTH_PX = 48;
const TRACK_INSET_PX = 4;

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
}: {
  /** Acción asíncrona; true = confirmada, false = regresar a idle. */
  onComplete: () => Promise<boolean>;
  /** Texto inicial dentro del track. */
  label?: string;
  /** Texto tras completar (mientras el padre avanza de etapa). */
  successLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastTickRef = useRef(0);
  const [state, setState] = useState<SwipeState>("idle");

  const x = useMotionValue(0);

  /** Recorrido máximo del thumb (ancho del track − ancho del thumb − inset). */
  const maxSwipeX = (): number => {
    const track = trackRef.current;
    if (!track) return 1;
    return Math.max(1, track.clientWidth - THUMB_WIDTH_PX - TRACK_INSET_PX * 2);
  };

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
    buzz([15, 30, 15]);
    let ok = false;
    try {
      ok = await onComplete();
    } catch {
      ok = false;
    }
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
      className="relative h-14 select-none overflow-hidden bg-[#09193B]"
      style={{ touchAction: "pan-y" }}
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
        dragConstraints={trackRef}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, touchAction: "pan-y" }}
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
          if (x.get() >= maxSwipeX() - 4) {
            void runConfirm();
          } else {
            // Cancelación: el dedo regresó → el thumb vuelve al inicio.
            animate(x, 0, { type: "spring", stiffness: 400, damping: 35 });
          }
        }}
        onPointerDownCapture={(e) => e.stopPropagation()}
        className="absolute bottom-1 left-1 top-1 flex w-12 cursor-grab items-center justify-center bg-white shadow-md ring-1 ring-black/5 active:cursor-grabbing"
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
