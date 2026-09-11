"use client";

import { CustomerAddress } from "@/lib/customer-address";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useUserAddresses } from "@/hooks/useUserAddresses";
import { ChevronDown, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AddressForm } from "./AddressForm";

// Diálogo rápido del Header: seleccionar la dirección activa.
// La administración completa (crear/editar/eliminar) vive en /direcciones
// (AddressManager); aquí se reutiliza el mismo hook y el mismo formulario.
export function AddressPicker({ userId }: { userId: string }) {
  const { addresses, active, loading, error, choose, save, remove } = useUserAddresses(userId);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSave = async (address: CustomerAddress) => {
    setBusy(true);
    const saved = await save(address);
    setBusy(false);
    if (saved) setAdding(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="flex max-w-[190px] items-center gap-1 rounded-full px-1 py-0.5 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100 sm:max-w-[260px]"
          aria-label={active ? `Dirección actual: ${active.label}. Cambiar dirección` : "Agregar dirección"}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#eb1901]" />
          <span className="truncate">{active?.label ?? "Agregar dirección"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </DialogTrigger>

      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-xl overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Direcciones</DialogTitle>
        </DialogHeader>

        <div className="max-h-[calc(85vh-4rem)] min-w-0 space-y-5 overflow-x-hidden overflow-y-auto px-4 pb-5 sm:px-5">
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          {loading && addresses.length === 0 ? (
            <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-gray-400" />
          ) : (
            <>
              <button
                onClick={() => setAdding((open) => !open)}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 p-3 text-sm font-semibold hover:border-[#eb1901] hover:bg-rose-50"
              >
                <Plus className="h-5 w-5 text-[#eb1901]" />
                {adding ? "Cancelar" : "Agregar dirección"}
              </button>

              {adding && (
                <AddressForm onSave={(address) => void handleSave(address)} busy={busy} />
              )}

              <section>
                <h3 className="mb-2 text-sm font-bold text-gray-900">Dirección actual</h3>
                {active ? (
                  <AddressRow address={active} active onChoose={choose} onEdit={() => setAdding(true)} />
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-center text-xs text-gray-500">
                    Aún no has agregado una dirección.
                  </p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold text-gray-900">Direcciones guardadas</h3>
                <div className="divide-y rounded-xl border">
                  {addresses
                    .filter((address) => address.id !== active?.id)
                    .map((address) => (
                      <AddressRow
                        key={address.id}
                        address={address}
                        active={active?.id === address.id}
                        onChoose={choose}
                        onRemove={() => void remove(address.id)}
                      />
                    ))}
                  {addresses.every((address) => address.id === active?.id) && (
                    <p className="p-4 text-center text-xs text-gray-500">Agrega otra dirección para verla aquí.</p>
                  )}
                </div>
              </section>

              <Link
                href="/direcciones"
                className="block w-full rounded-xl border border-gray-200 bg-white p-3 text-center text-sm font-semibold text-[#eb1901] transition hover:border-[#eb1901] hover:bg-rose-50"
              >
                Ver todas mis direcciones
              </Link>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddressRow({
  address,
  active,
  onChoose,
  onEdit,
  onRemove,
}: {
  address: CustomerAddress;
  active: boolean;
  onChoose: (address: CustomerAddress) => void;
  onEdit?: () => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 ${active ? "bg-rose-50" : "bg-white"}`}>
      <MapPin className={`h-5 w-5 shrink-0 ${active ? "text-[#eb1901]" : "text-gray-400"}`} />
      <button className="min-w-0 flex-1 text-left" onClick={() => onChoose(address)}>
        <span className="block truncate text-sm font-semibold text-gray-900">{address.label}</span>
        <span className="block truncate text-xs text-gray-500">{address.formattedAddress}</span>
      </button>
      {onEdit && (
        <button
          onClick={onEdit}
          className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label={`Editar ${address.label}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {onRemove && (
        <button
          onClick={() => onRemove(address.id)}
          className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Eliminar ${address.label}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
