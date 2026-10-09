"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  Loader2,
  Map,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  DRIVE_MOTION_DURATION,
  DRIVE_MOTION_EASE,
} from "@/components/drive/motion";
import { DriveWallet } from "@/components/drive/DriveWallet";
import { DriveProfile } from "@/components/drive/DriveProfile";

/**
 * HOME DEL REPARTIDOR — pantalla de inicio (SOLO UI/UX, sin lógica).
 *
 * Es una capa independiente (`fixed inset-0 z-50`) que se abre desde el botón
 * "Inicio" del panel inferior; el repartidor llega aquí cuando está
 * desconectado o disponible (nunca con un viaje activo).
 *
 * Contenido:
 * - Encabezado con saludo y el estado de sesión actual.
 * - Acceso de regreso al mapa (y a conectarse, si está fuera de servicio).
 * - Sección "Mi perfil": promedio real de calificaciones recibidas
 *   (DriveProfile).
 * - Sección "Wallet": ganancias y saldo reales (DriveWallet).
 * - Sección "Notificaciones": PLACEHOLDER (subpantalla "Próximamente") hasta
 *   que exista su diseño arquitectónico.
 *
 * NAVEGACIÓN INTERNA: las secciones entran deslizándose desde la derecha y
 * siempre tienen "←" de regreso; al cerrar el Home todo vuelve al estado
 * inicial (nunca se recuerda la última sección).
 */

type HomeSection = "notifications" | "wallet" | "profile";

const SECTIONS: {
  id: HomeSection;
  title: string;
  description: string;
  placeholder: string;
  icon: LucideIcon;
}[] = [
  {
    id: "profile",
    title: "Mi perfil",
    description: "Tu promedio y evaluaciones",
    placeholder: "Aquí verás tu promedio de calificaciones.",
    icon: UserRound,
  },
  {
    id: "notifications",
    title: "Notificaciones",
    description: "Avisos de ElMenu",
    placeholder:
      "Aquí verás los avisos de ElMenu: incidentes, pagos, novedades y mensajes importantes.",
    icon: Bell,
  },
  {
    id: "wallet",
    title: "Wallet",
    description: "Ganancias y retiros",
    placeholder:
      "Aquí verás tus ganancias, retiros y el estado de tus pagos.",
    icon: Wallet,
  },
];

export function DriveHome({
  open,
  onClose,
  /** true ⇔ la sesión de disponibilidad está vigente (solo lectura). */
  connected,
  /** Conecta la sesión (mismo handler que "COMENZAR A RECIBIR" del mapa). */
  onConnect,
  /** true mientras la conexión está en curso (deshabilita el CTA). */
  connecting = false,
}: {
  open: boolean;
  onClose: () => void;
  connected: boolean;
  onConnect: () => void;
  connecting?: boolean;
}) {
  const [section, setSection] = useState<HomeSection | null>(null);

  // Al cerrar el Home, la navegación interna se descarta por completo.
  useEffect(() => {
    if (!open) setSection(null);
  }, [open]);

  const activeSection = SECTIONS.find((s) => s.id === section) ?? null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="drive-home"
          role="dialog"
          aria-modal="true"
          aria-label="Inicio del repartidor"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{
            duration: DRIVE_MOTION_DURATION.standard,
            ease: DRIVE_MOTION_EASE.enter,
          }}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white"
        >
          {/* ── ENCABEZADO: saludo + estado + acceso al mapa ─────────── */}
          <div className="shrink-0 bg-[#09193B] px-5 pb-7 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-white/60">
                  ElMenu Drive
                </p>
                <h1 className="mt-1 text-2xl font-black leading-tight">
                  Hola 👋
                </h1>
                <p className="mt-1 text-sm font-medium text-white/70">
                  Tu panel de inicio
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Volver al mapa"
                className="flex h-11 w-11 shrink-0 items-center justify-center text-white/70 transition active:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Estado actual + CTA de regreso al mapa / conexión. */}
            <div className="mt-6 border border-white/15 bg-white/5 p-4">
              {connected ? (
                <>
                  <span className="flex items-center gap-2 text-base font-bold">
                    <span
                      className="h-2 w-2 rounded-full bg-green-400"
                      aria-hidden
                    />
                    Disponible
                  </span>
                  <p className="mt-1 text-xs font-medium text-white/70">
                    Recibiendo pedidos en el mapa
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 flex w-full items-center justify-center gap-2 bg-white py-3.5 text-sm font-black uppercase tracking-wide text-[#09193B] transition active:scale-[0.99]"
                  >
                    <Map className="h-4 w-4" />
                    Volver al mapa
                  </button>
                </>
              ) : (
                <>
                  <span className="text-base font-bold">Fuera de servicio</span>
                  <p className="mt-1 text-xs font-medium text-white/70">
                    No recibirás nuevos pedidos hasta conectarte
                  </p>
                  <button
                    type="button"
                    onClick={onConnect}
                    disabled={connecting}
                    className="mt-4 flex w-full items-center justify-center gap-2 bg-[#EB1902] py-3.5 text-sm font-black uppercase tracking-wide text-white transition active:scale-[0.99] disabled:opacity-60"
                  >
                    {connecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Map className="h-4 w-4" />
                    )}
                    Comenzar a recibir
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── SECCIONES (placeholder, sin función todavía) ─────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-6">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Tus herramientas
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-label={`Abrir ${s.title}`}
                  className="flex flex-col items-start gap-3 border-2 border-gray-200 p-4 text-left transition active:bg-gray-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center bg-[#09193B] text-white">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-[#09193B]">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-gray-500">
                      {s.description}
                    </span>
                  </span>
                  {/* Solo las secciones sin función llevan el aviso. */}
                  {s.id === "notifications" && (
                    <span className="mt-auto border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-600">
                      Próximamente
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── SUBPANTALLA DE SECCIÓN (entra desde la derecha) ──────── */}
          <AnimatePresence>
            {activeSection && (
              <motion.div
                key={activeSection.id}
                role="dialog"
                aria-modal="true"
                aria-label={activeSection.title}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{
                  duration: DRIVE_MOTION_DURATION.standard,
                  ease: DRIVE_MOTION_EASE.enter,
                }}
                className="absolute inset-0 z-10 flex flex-col bg-white"
              >
                <div className="flex shrink-0 items-center gap-1 border-b border-gray-100 pb-2 pt-[max(1rem,env(safe-area-inset-top))] pl-2 pr-4">
                  <button
                    type="button"
                    onClick={() => setSection(null)}
                    aria-label="Volver al inicio"
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-[#09193B] transition active:bg-gray-100"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h2 className="min-w-0 flex-1 truncate text-base font-black text-[#09193B]">
                    {activeSection.title}
                  </h2>
                </div>

                {/* Contenido: Wallet y Mi perfil ya tienen función real; el
                    resto sigue como placeholder hasta tener su diseño. */}
                {activeSection.id === "wallet" ? (
                  <DriveWallet />
                ) : activeSection.id === "profile" ? (
                  <DriveProfile />
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
                    <span className="flex h-16 w-16 items-center justify-center bg-gray-100 text-gray-400">
                      <activeSection.icon className="h-7 w-7" />
                    </span>
                    <p className="mt-5 text-lg font-black text-[#09193B]">
                      Próximamente
                    </p>
                    <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-gray-500">
                      {activeSection.placeholder}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSection(null)}
                      className="mt-6 border-2 border-gray-200 px-6 py-3 text-sm font-black text-[#09193B] transition active:bg-gray-50"
                    >
                      Volver al inicio
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
