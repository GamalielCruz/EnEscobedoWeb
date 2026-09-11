"use client";

// AddressManager: gestor completo de la libreta de direcciones.
//
// Responsabilidad: listar, crear, editar, eliminar, activar y visualizar
// direcciones. Usado por la página /direcciones y por el diálogo del Header
// (AddressPicker). No duplica la lógica: ambos usan el hook useUserAddresses.

import { CustomerAddress } from "@/lib/customer-address";
import { useUserAddresses } from "@/hooks/useUserAddresses";
import { Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AddressForm } from "./AddressForm";

export function AddressManager({ userId }: { userId: string }) {
  const { addresses, active, loading, error, choose, save, remove, activate } = useUserAddresses(userId);
  const [editing, setEditing] = useState<CustomerAddress | null | "new">(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async (address: CustomerAddress) => {
    setBusy(true);
    const saved = await save(address);
    setBusy(false);
    if (saved) setEditing(null);
  };

  const handleChoose = async (address: CustomerAddress) => {
    await choose(address);
    setEditing(null);
  };

  const handleRemove = async (address: CustomerAddress) => {
    if (!window.confirm(`¿Eliminar "${address.label}"?`)) return;
    await remove(address.id);
    if (editing === address) setEditing(null);
  };

  const renderList = () => (
    <div className="divide-y rounded-xl border">
      {addresses.map((address) => {
        const isActive = active?.id === address.id;
        return (
          <div key={address.id} className={`flex items-center gap-3 p-3 ${isActive ? "bg-rose-50" : "bg-white"}`}>
            <MapPin className={`h-5 w-5 shrink-0 ${isActive ? "text-[#eb1901]" : "text-gray-400"}`} />
            <button className="min-w-0 flex-1 text-left" onClick={() => void handleChoose(address)}>
              <span className="block truncate text-sm font-semibold text-gray-900">
                {address.label}
                {isActive && <span className="ml-2 text-[10px] font-bold uppercase text-[#eb1901]">Actual</span>}
              </span>
              <span className="block truncate text-xs text-gray-500">{address.formattedAddress}</span>
            </button>
            <button
              type="button"
              onClick={() => setEditing(address)}
              className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label={`Editar ${address.label}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleRemove(address)}
              className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
              aria-label={`Eliminar ${address.label}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setEditing(editing === "new" ? null : "new")}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 p-3 text-sm font-semibold transition hover:border-[#eb1901] hover:bg-rose-50"
      >
        <Plus className="h-5 w-5 text-[#eb1901]" />
        {editing === "new" ? "Cancelar" : "Agregar dirección"}
      </button>

      {editing === "new" && (
        <AddressForm onSave={(address) => void handleSave(address)} busy={busy} />
      )}
      {editing && editing !== "new" && (
        <AddressForm initial={editing} onSave={(address) => void handleSave(address)} busy={busy} />
      )}

      {loading && addresses.length === 0 ? (
        <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-gray-400" />
      ) : (
        <section>
          <h3 className="mb-2 text-sm font-bold text-gray-900">Mis direcciones</h3>
          {addresses.length > 0 ? (
            renderList()
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-center text-xs text-gray-500">
              Aún no has agregado una dirección.
            </p>
          )}
          {addresses.length > 0 && (
            <p className="mt-2 text-center text-[11px] text-gray-400">
              Toca una dirección para usarla como tu dirección actual.
            </p>
          )}
        </section>
      )}

      {active && !addresses.some((item) => item.id === active.id) && (
        <button
          type="button"
          onClick={() => activate(active)}
          className="w-full rounded-xl border border-[#eb1901]/30 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-[#eb1901]"
        >
          Usar “{active.label}” como dirección actual
        </button>
      )}
    </div>
  );
}
