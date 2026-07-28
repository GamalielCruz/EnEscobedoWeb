"use client";

import {
  ACTIVE_ADDRESS_KEY,
  CustomerAddress,
  customerAddressStorageKey,
  normalizeCustomerAddress,
} from "@/lib/customer-address";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronDown, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export function AddressPicker({ userId }: { userId: string }) {
  const [active, setActive] = useState<CustomerAddress | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [draft, setDraft] = useState<CustomerAddress | null>(null);
  const [draftAddress, setDraftAddress] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activate = (address: CustomerAddress | null) => {
    setActive(address);
    if (address) {
      localStorage.setItem(customerAddressStorageKey(userId), JSON.stringify(address));
    } else {
      localStorage.removeItem(customerAddressStorageKey(userId));
    }
    window.dispatchEvent(new CustomEvent("customerAddressChanged", { detail: address }));
  };

  useEffect(() => {
    let cancelled = false;
    setActive(null);
    setAddresses([]);
    setError("");
    localStorage.removeItem(ACTIVE_ADDRESS_KEY);
    setLoading(true);
    fetch("/api/user/addresses")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const saved = Array.isArray(data.addresses)
          ? data.addresses.map(normalizeCustomerAddress).filter(Boolean) as CustomerAddress[]
          : [];
        setAddresses(saved);
        const selected = saved.find((address) => address.id === data.activeAddressId);
        activate(selected ?? saved[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar tus direcciones guardadas.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const choose = async (address: CustomerAddress) => {
    activate(address);
    try {
      const response = await fetch("/api/user/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error();
      setAddresses(data.addresses);
    } catch {
      setError("La dirección quedó activa en este dispositivo, pero no se pudo sincronizar.");
    }
  };

  const save = async () => {
    const label = draftLabel.trim();
    if (!draft || !label) return;
    const labeledAddress = { ...draft, label };
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/user/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: labeledAddress }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAddresses(data.addresses);
      activate(data.address);
      setAdding(false);
      setDraft(null);
      setDraftAddress("");
      setDraftLabel("");
    } catch {
      setError("No pudimos guardar la dirección. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const response = await fetch(`/api/user/addresses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const next = Array.isArray(data.addresses)
        ? data.addresses.map(normalizeCustomerAddress).filter(Boolean) as CustomerAddress[]
        : [];
      setAddresses(next);
      if (active?.id === id) activate(next[0] ?? null);
    } catch {
      setError("No pudimos eliminar la dirección.");
    }
  };

  const addAddress = () => {
    setDraft(null);
    setDraftAddress("");
    setDraftLabel("");
    setAdding(true);
  };

  const editAddress = (address: CustomerAddress) => {
    setDraft(address);
    setDraftAddress(address.formattedAddress);
    setDraftLabel(address.label);
    setAdding(true);
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
          <button
            onClick={adding ? () => setAdding(false) : addAddress}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 p-3 text-sm font-semibold hover:border-[#eb1901] hover:bg-rose-50"
          >
            <Plus className="h-5 w-5 text-[#eb1901]" />
            {adding ? "Cancelar" : "Agregar dirección"}
          </button>

          {adding && (
            <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-xl bg-gray-50 p-3">
              {!draft?.id && (
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-gray-700">Dirección completa</span>
                  <div className="relative min-w-0">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={draftAddress}
                      onChange={(event) => {
                        const value = event.target.value.slice(0, 240);
                        setDraftAddress(value);
                        setDraft(
                          normalizeCustomerAddress({
                            formattedAddress: value,
                            street: value,
                            country: "México",
                          })
                        );
                      }}
                      maxLength={240}
                      autoComplete="street-address"
                      placeholder="Ej. Calle, número, colonia y municipio"
                      className="box-border w-full min-w-0 max-w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-[#eb1901] focus:ring-2 focus:ring-[#eb1901]/20"
                    />
                  </div>
                  <span className="block text-xs text-gray-500">
                    Incluye calle, número, colonia y municipio.
                  </span>
                </label>
              )}
              {draft?.id && (
                <p className="break-words rounded-lg bg-white px-3 py-2 text-sm text-gray-600">
                  {draft.formattedAddress}
                </p>
              )}
              <div className="space-y-2">
                <label htmlFor="address-label" className="text-xs font-semibold text-gray-700">
                  Etiqueta
                </label>
                <div className="flex gap-2">
                  {["Casa", "Oficina"].map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setDraftLabel(label)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        draftLabel === label
                          ? "border-[#eb1901] bg-rose-50 text-[#eb1901]"
                          : "border-gray-200 bg-white text-gray-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  id="address-label"
                  list="address-label-options"
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value.slice(0, 60))}
                  maxLength={60}
                  placeholder="Casa, Oficina, Casa de mamá…"
                  className="box-border w-full min-w-0 max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#eb1901] focus:ring-2 focus:ring-[#eb1901]/20"
                />
                <datalist id="address-label-options">
                  <option value="Casa" />
                  <option value="Oficina" />
                  <option value="Casa de mamá" />
                  <option value="Otro" />
                </datalist>
              </div>
              <button
                onClick={save}
                disabled={!draft || !draftLabel.trim() || loading}
                className="box-border w-full min-w-0 max-w-full rounded-lg bg-[#eb1901] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300"
              >
                {draft?.id ? "Guardar cambios" : "Guardar dirección"}
              </button>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-sm font-bold text-gray-900">Dirección actual</h3>
            {active ? (
              <AddressRow address={active} active onChoose={choose} onEdit={() => editAddress(active)} />
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-center text-xs text-gray-500">
                Aún no has agregado una dirección.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold text-gray-900">Direcciones guardadas</h3>
            {loading && addresses.length === 0 ? (
              <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <div className="divide-y rounded-xl border">
                {addresses
                  .filter((address) => address.id !== active?.id)
                  .map((address) => (
                    <AddressRow
                      key={address.id}
                      address={address}
                      active={active?.id === address.id}
                      onChoose={choose}
                      onEdit={() => editAddress(address)}
                      onRemove={() => remove(address.id)}
                    />
                  ))}
                {addresses.every((address) => address.id === active?.id) && (
                  <p className="p-4 text-center text-xs text-gray-500">Agrega otra dirección para verla aquí.</p>
                )}
              </div>
            )}
          </section>
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
  onEdit: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 ${active ? "bg-rose-50" : "bg-white"}`}>
      <MapPin className={`h-5 w-5 shrink-0 ${active ? "text-[#eb1901]" : "text-gray-400"}`} />
      <button className="min-w-0 flex-1 text-left" onClick={() => onChoose(address)}>
        <span className="block truncate text-sm font-semibold text-gray-900">{address.label}</span>
        <span className="block truncate text-xs text-gray-500">{address.formattedAddress}</span>
      </button>
      <button
        onClick={onEdit}
        className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label={`Editar ${address.label}`}
      >
        <Pencil className="h-4 w-4" />
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Eliminar ${address.label}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
