"use client";

// AddressSelector: componente de selección de dirección reutilizable.
//
// Responsabilidad: mostrar direcciones guardadas, seleccionar una y
// crear/usar una nueva. No administra (editar/eliminar/activar) — eso es
// responsabilidad de AddressManager (/direcciones).
//
// Usa el hook compartido useUserAddresses (Clerk privateMetadata + la API
// existente /api/user/addresses). No crea una segunda fuente de verdad.

import { CustomerAddress } from "@/lib/customer-address";
import { useUserAddresses } from "@/hooks/useUserAddresses";
import { Loader2, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { AddressForm } from "./AddressForm";

export function AddressSelector({
  userId,
  onSelect,
  title,
  submitting,
}: {
  userId: string;
  /** Se invoca al elegir una dirección guardada o recién creada. */
  onSelect: (address: CustomerAddress) => void;
  title?: string;
  /** Muestra "Usar esta dirección" en vez de "Guardar dirección". */
  submitting?: boolean;
}) {
  const { addresses, active, loading, error, choose, save, load } = useUserAddresses(userId);
  const [adding, setAdding] = useState(false);
  const [savingNew, setSavingNew] = useState(false);

  const handleSave = async (address: CustomerAddress) => {
    setSavingNew(true);
    const saved = await save(address);
    setSavingNew(false);
    if (saved) {
      setAdding(false);
      onSelect(saved);
    }
  };

  const handleChoose = async (address: CustomerAddress) => {
    await choose(address);
    onSelect(address);
  };

  return (
    <div className="space-y-3">
      {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      {loading && addresses.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando direcciones…
        </div>
      ) : addresses.length > 0 ? (
        <div className="divide-y rounded-xl border">
          {addresses.map((address) => {
            const isActive = active?.id === address.id;
            return (
              <button
                key={address.id}
                type="button"
                onClick={() => void handleChoose(address)}
                className={`flex w-full items-center gap-3 p-3 text-left transition hover:bg-rose-50 ${
                  isActive ? "bg-rose-50" : "bg-white"
                }`}
              >
                <MapPin className={`h-5 w-5 shrink-0 ${isActive ? "text-[#eb1901]" : "text-gray-400"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{address.label}</span>
                  <span className="block truncate text-xs text-gray-500">{address.formattedAddress}</span>
                </span>
                {isActive && <span className="shrink-0 text-[11px] font-bold uppercase text-[#eb1901]">Actual</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-center text-xs text-gray-500">
          Aún no tienes direcciones guardadas.
        </p>
      )}

      {adding ? (
        <div className="space-y-2">
          <AddressForm onSave={(address) => void handleSave(address)} busy={savingNew} />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="w-full text-center text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 p-3 text-sm font-semibold text-[#eb1901] transition hover:border-[#eb1901] hover:bg-rose-50"
        >
          <Plus className="h-5 w-5" /> Agregar dirección
        </button>
      )}

      {submitting && addresses.length === 0 && !adding && (
        <button
          type="button"
          onClick={() => void load()}
          className="w-full text-center text-xs font-semibold text-gray-400 underline-offset-2 hover:underline"
        >
          Reintentar carga
        </button>
      )}
    </div>
  );
}
