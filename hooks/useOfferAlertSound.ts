"use client";

import { useCallback, useEffect, useRef } from "react";

// ── Singleton global ───────────────────────────────────────────────
// Evita múltiples instancias simultáneas. Un solo ciclo de audio
// está activo en todo momento en toda la aplicación.

let globalAudio: HTMLAudioElement | null = null;
let globalIntervalId: ReturnType<typeof setInterval> | null = null;
let globalTimeoutId: ReturnType<typeof setTimeout> | null = null;
let activeOfferKey: string | null = null;

const MAX_ALERT_DURATION_MS = 15_000;
const CYCLE_MS = 3_000; // ~2s play + ~1s pause

function getAudio(): HTMLAudioElement {
  if (!globalAudio) {
    globalAudio = new Audio("/sounds/audio.mp3");
    globalAudio.volume = 0.7;
  }
  return globalAudio;
}

function stopAlert() {
  if (globalIntervalId !== null) {
    clearInterval(globalIntervalId);
    globalIntervalId = null;
  }
  if (globalTimeoutId !== null) {
    clearTimeout(globalTimeoutId);
    globalTimeoutId = null;
  }
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.currentTime = 0;
  }
  activeOfferKey = null;
}

function playOnce() {
  const audio = getAudio();
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Autoplay bloqueado — no es error fatal
  });
}

function startAlertLoop(offerKey: string) {
  // Si ya está sonando para ESTA oferta, no reiniciar
  if (activeOfferKey === offerKey) return;

  // Si hay otra alerta activa, detenerla primero
  stopAlert();

  activeOfferKey = offerKey;
  const startTime = Date.now();

  // Reproducir inmediatamente
  playOnce();

  // Programar repeticiones cada ~3s (2s play + 1s pause)
  globalIntervalId = setInterval(() => {
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_ALERT_DURATION_MS) {
      stopAlert();
      return;
    }
    playOnce();
  }, CYCLE_MS);

  // Safety net absoluto: parar después de 15.5s
  globalTimeoutId = setTimeout(() => {
    stopAlert();
  }, MAX_ALERT_DURATION_MS + 500);
}

// ── Hook ───────────────────────────────────────────────────────────

/**
 * Utilidad reutilizable de alerta sonora para ofertas de mandados.
 *
 * Identidad de oferta: se usa `orderNumber + "|" + offerExpiresAt`
 * como composite key para distinguir:
 *   - misma oferta + mismo expiration → no volver a sonar
 *   - misma orden + nueva oferta + nuevo expiration → sí sonar
 *   - orden diferente → sí sonar
 */
export function useOfferAlertSound() {
  const lastKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const warmedUpRef = useRef(false);
  const pendingActionRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lastKeyRef.current = null;
      warmedUpRef.current = false;
      pendingActionRef.current = false;
    };
  }, []);

  /**
   * Llamar cuando el estado de oferta cambia.
   * Si hay una oferta nueva → iniciar alerta.
   * Si la oferta desapareció → detener alerta.
   *
   * FIX-2: En la primera llamada (warm-up), se registra la oferta
   * existente SIN reproducir sonido. Esto evita que al abrir Drive
   * con una oferta ya activa suene el audio.
   *
   * FIX-3: Si pendingActionRef está activo (aceptar/rechazo en curso),
   * no se inicia ningún sonido nuevo para la misma oferta.
   */
  const notifyOfferChange = useCallback(
    (orderNumber: string | null, offerExpiresAt: string | null) => {
      if (!mountedRef.current) return;

      if (!orderNumber || !offerExpiresAt) {
        // No hay oferta activa → detener si estaba sonando
        if (
          activeOfferKey !== null &&
          lastKeyRef.current !== null &&
          lastKeyRef.current === activeOfferKey
        ) {
          stopAlert();
        }
        lastKeyRef.current = null;
        warmedUpRef.current = true;
        return;
      }

      const key = `${orderNumber}|${offerExpiresAt}`;
      const isFirstCall = !warmedUpRef.current;

      // Marcar como initialized después de la primera llamada
      warmedUpRef.current = true;

      // FIX-3: Durante una acción (aceptar/rechazo), no iniciar nuevo sonido
      if (pendingActionRef.current) return;

      // Es la misma oferta que ya estamos rastreando → no hacer nada
      if (key === lastKeyRef.current) return;

      // FIX-2: Primera llamada → warm-up: registrar sin sonar
      if (isFirstCall) {
        lastKeyRef.current = key;
        return;
      }

      // Nueva oferta diferente → iniciar alerta
      lastKeyRef.current = key;
      startAlertLoop(key);
    },
    []
  );

  /**
   * Detener inmediatamente la alerta y suprimir re-activación
   * mientras la acción (aceptar/rechazo) se procesa.
   *
   * FIX-3: Se establece pendingActionRef = true para que
   * notifyOfferChange no reinicie el sonido si el polling
   * devuelve la misma oferta antes de que el backend la procese.
   */
  const stopAlertImmediate = useCallback(() => {
    pendingActionRef.current = true;
    stopAlert();
    // NO limpiar lastKeyRef: mantener la key para que si el polling
    // devuelve la misma oferta, se reconozca como "misma oferta"
    // y no intente reproducir de nuevo.
  }, []);

  /**
   * Restablecer la supresión después de que la acción completó.
   * Llamar después de refetch() en handleOffer.
   */
  const resetAction = useCallback(() => {
    pendingActionRef.current = false;
  }, []);

  return { notifyOfferChange, stopAlertImmediate, resetAction };
}
