"use client";

// Hook compartido de la libreta de direcciones del usuario.
//
// Centraliza:
//  - cargar direcciones (GET /api/user/addresses → Clerk privateMetadata)
//  - conocer/activar la dirección activa
//  - persistir (POST /api/user/addresses) y eliminar (DELETE /api/user/addresses)
//  - sincronizar localStorage (`activeCustomerAddress:{userId}`)
//  - escuchar el evento `customerAddressChanged` (Header → basket, etc.)
//
// Clerk privateMetadata es la única fuente de verdad; localStorage es una
// caché por dispositivo que mantiene el comportamiento actual.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CustomerAddress,
  customerAddressStorageKey,
  dedupeCustomerAddresses,
  normalizeCustomerAddress,
  parseCustomerAddress,
  selectActiveAddress,
} from "@/lib/customer-address";

export type UseUserAddressesOptions = {
  /** Si es true, no escribe en localStorage ni dispara el evento global. */
  silent?: boolean;
};

export function useUserAddresses(userId: string | undefined | null, options: UseUserAddressesOptions = {}) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [active, setActive] = useState<CustomerAddress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  // Escribe la dirección activa en localStorage y avisa al resto de la app
  // mediante el evento global `customerAddressChanged` (mismo contrato que el
  // AddressPicker anterior).
  const persistActive = useCallback(
    (address: CustomerAddress | null) => {
      if (options.silent || !userId) return;
      try {
        if (address) {
          localStorage.setItem(customerAddressStorageKey(userId), JSON.stringify(address));
        } else {
          localStorage.removeItem(customerAddressStorageKey(userId));
        }
      } catch {
        // localStorage puede no estar disponible (SSR/privacy mode); no bloquea.
      }
      window.dispatchEvent(new CustomEvent("customerAddressChanged", { detail: address }));
    },
    [userId, options.silent]
  );

  // Activar una dirección SOLO localmente: actualiza el estado, localStorage
  // y el evento global. NO escribe en Clerk: eso lo hace `choose` (seleccionar
  // una guardada) o `save` (crear/editar).
  const activate = useCallback(
    (address: CustomerAddress | null) => {
      setActive(address);
      persistActive(address);
    },
    [persistActive]
  );

  // Carga inicial desde Clerk (fuente de verdad) con fallback a localStorage.
  const load = useCallback(async () => {
    if (!userId) {
      setAddresses([]);
      setActive(null);
      return;
    }
    setLoading(true);
    setError("");
    const local = parseCustomerAddress(localStorage.getItem(customerAddressStorageKey(userId)));
    try {
      const response = await fetch("/api/user/addresses");
      if (!response.ok) throw new Error("load");
      const data = await response.json();
      if (!mounted.current) return;
      const saved = dedupeCustomerAddresses(
        Array.isArray(data.addresses)
          ? (data.addresses.map(normalizeCustomerAddress).filter(Boolean) as CustomerAddress[])
          : []
      );
      setAddresses(saved);
      const selected = selectActiveAddress(saved, data.activeAddressId, local?.id);
      setActive(selected);
      if (selected && !options.silent) persistActive(selected);
    } catch {
      if (!mounted.current) return;
      setError("No pudimos cargar tus direcciones guardadas.");
      setAddresses(local ? [local] : []);
      setActive(local);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [userId, options.silent, persistActive]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // Escucha cambios externos (otro componente activó una dirección).
  // El dedupe se hace DENTRO del updater funcional para no depender del
  // closure de `addresses` (que quedaría obsoleto): si el evento llega con
  // una dirección que ya está en la lista, no se agrega una copia. Esto
  // evita que el propio hook (que dispara el evento en persistActive) se
  // duplique a sí mismo en cada load/activate.
  useEffect(() => {
    if (options.silent) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CustomerAddress | null>).detail;
      setActive(detail);
      if (detail) {
        setAddresses((prev) =>
          prev.some((item) => item.id === detail.id) ? prev : [detail, ...prev]
        );
      }
    };
    window.addEventListener("customerAddressChanged", handler);
    return () => window.removeEventListener("customerAddressChanged", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.silent]);

  // Seleccionar una dirección guardada como activa: actualiza localmente
  // (activate) y persiste `activeAddressId` en Clerk vía la API existente.
  // Es la única operación que escribe al seleccionar; `activate` solo es local.
  const choose = useCallback(
    async (address: CustomerAddress) => {
      activate(address);
      try {
        const response = await fetch("/api/user/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error();
        if (!mounted.current) return;
        setAddresses(
          dedupeCustomerAddresses(
            Array.isArray(data.addresses)
              ? (data.addresses.map(normalizeCustomerAddress).filter(Boolean) as CustomerAddress[])
              : []
          )
        );
        return null;
      } catch {
        setError("La dirección quedó activa en este dispositivo, pero no se pudo sincronizar.");
        return "sync";
      }
    },
    [activate]
  );

  // Guardar una dirección (nueva o editada). Queda como activa.
  const save = useCallback(
    async (address: CustomerAddress) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/user/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "save");
        if (!mounted.current) return null;
        const saved = normalizeCustomerAddress(data.address);
        const next = dedupeCustomerAddresses(
          Array.isArray(data.addresses)
            ? (data.addresses.map(normalizeCustomerAddress).filter(Boolean) as CustomerAddress[])
            : []
        );
        setAddresses(next);
        if (saved) activate(saved);
        return saved;
      } catch (saveError) {
        setError("No pudimos guardar la dirección. Inténtalo de nuevo.");
        return null;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [activate]
  );

  const remove = useCallback(
    async (id: string) => {
      setError("");
      try {
        const response = await fetch(`/api/user/addresses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!mounted.current) return;
        const next = dedupeCustomerAddresses(
          Array.isArray(data.addresses)
            ? (data.addresses.map(normalizeCustomerAddress).filter(Boolean) as CustomerAddress[])
            : []
        );
        setAddresses(next);
        if (active?.id === id) {
          const fallback = next.find((item) => item.id === data.activeAddressId) ?? next[0] ?? null;
          activate(fallback);
        }
      } catch {
        setError("No pudimos eliminar la dirección.");
      }
    },
    [active?.id, activate]
  );

  return { addresses, active, loading, error, load, activate, choose, save, remove };
}
