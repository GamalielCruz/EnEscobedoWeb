"use client";

// Página /direcciones: sección de cuenta del usuario para administrar su
// libreta de direcciones. Usa exactamente el mismo sistema que el diálogo del
// Header (AddressManager + hook useUserAddresses + /api/user/addresses).
// No hay una segunda implementación.

import { useUser } from "@clerk/nextjs";
import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { AddressManager } from "@/components/AddressManager";
import { useHydration } from "@/hooks/useHydration";

export default function DireccionesPage() {
  const { user, isLoaded } = useUser();
  const isHydrated = useHydration();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-200"
          aria-label="Volver al inicio"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-gray-900">Mis direcciones</h1>
          <p className="text-xs text-gray-500">Guarda y administra las direcciones que usas en ElMenú.</p>
        </div>
      </div>

      {!isHydrated || !isLoaded ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400">Cargando…</p>
      ) : !user ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <MapPin className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">Inicia sesión para administrar tus direcciones.</p>
          <Link
            href="/"
            className="rounded-full bg-[#eb1901] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c91602]"
          >
            Ir al inicio
          </Link>
        </div>
      ) : (
        <AddressManager userId={user.id} />
      )}
    </div>
  );
}
