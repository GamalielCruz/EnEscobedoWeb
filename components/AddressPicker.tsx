"use client";

import {
  ACTIVE_ADDRESS_KEY,
  CustomerAddress,
  DEFAULT_CUSTOMER_ADDRESS,
  normalizeCustomerAddress,
} from "@/lib/customer-address";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronDown, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export function AddressPicker() {
  const [active, setActive] = useState(DEFAULT_CUSTOMER_ADDRESS);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [draft, setDraft] = useState<CustomerAddress | null>(null);
  const [draftAddress, setDraftAddress] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activate = (address: CustomerAddress) => {
    setActive(address);
    localStorage.setItem(ACTIVE_ADDRESS_KEY, JSON.stringify(address));
    window.dispatchEvent(new CustomEvent("customerAddressChanged", { detail: address }));
  };

  useEffect(() => {
    setLoading(true);
    fetch("/api/user/addresses")
      .then((response) => response.json())
      .then((data) => {
        const saved = Array.isArray(data.addresses)
          ? data.addresses.map(normalizeCustomerAddress).filter(Boolean) as CustomerAddress[]
          : [];
        setAddresses(saved);
        const selected = saved.find((address) => address.id === data.activeAddressId);
        activate(selected ?? DEFAULT_CUSTOMER_ADDRESS);
      })
      .catch(() => setError("No pudimos cargar tus direcciones guardadas."))
      .finally(() => setLoading(false));
  }, []);

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
      setAddresses((current) => current.filter((address) => address.id !== id));
      if (active.id === id) activate(DEFAULT_CUSTOMER_ADDRESS);
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
          aria-label={`Dirección actual: ${active.label}. Cambiar dirección`}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#eb1901]" />
          <span className="truncate">{active.label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Direcciones</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-5 pb-5">
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
            <div className="space-y-3 rounded-xl bg-gray-50 p-3">
              {!draft?.id && (
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-gray-700">Dirección completa</span>
                  <div className="relative">
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
                      placeholder="Ej. 5 de febrero #64, Pedro Escobedo"
                      className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-[#eb1901] focus:ring-2 focus:ring-[#eb1901]/20"
                    />
                  </div>
                  <span className="block text-xs text-gray-500">
                    Incluye calle, número, colonia y municipio.
                  </span>
                </label>
              )}
              {draft?.id && (
                <p className="rounded-lg bg-white px-3 py-2 text-sm text-gray-600">
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
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#eb1901] focus:ring-2 focus:ring-[#eb1901]/20"
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
                className="w-full rounded-lg bg-[#eb1901] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300"
              >
                {draft?.id ? "Guardar cambios" : "Guardar dirección"}
              </button>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-sm font-bold text-gray-900">Dirección actual</h3>
            <AddressRow address={active} active onChoose={choose} onEdit={() => editAddress(active)} />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold text-gray-900">Direcciones guardadas</h3>
            {loading && addresses.length === 0 ? (
              <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <div className="divide-y rounded-xl border">
                {[DEFAULT_CUSTOMER_ADDRESS, ...addresses]
                  .filter((address, index, all) => all.findIndex((item) => item.id === address.id) === index)
                  .filter((address) => address.id !== active.id)
                  .map((address) => (
                    <AddressRow
                      key={address.id}
                      address={address}
                      active={active.id === address.id}
                      onChoose={choose}
                      onEdit={() => editAddress(address)}
                      onRemove={
                        address.id === DEFAULT_CUSTOMER_ADDRESS.id ? undefined : () => remove(address.id)
                      }
                    />
                  ))}
                {[DEFAULT_CUSTOMER_ADDRESS, ...addresses].every((address) => address.id === active.id) && (
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
