"use client";

import * as React from "react";
import { CalendarClock, Clock3 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  FulfillmentSelection,
  FulfillmentSlot,
  StoreAvailability,
} from "@/lib/fulfillment-schedule";

type Props = {
  storeId: string;
  type: "delivery" | "pickup";
  address?: { latitude?: number; longitude?: number } | null;
  value?: FulfillmentSelection | null;
  onChange?: (selection: FulfillmentSelection | null) => void;
  variant?: "checkout" | "store-status";
};

function storageKey(storeId: string, type: string) {
  return `fulfillmentTiming:v1:${storeId}:${type}`;
}

function formatSlot(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatOpening(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function FulfillmentTimingPicker({
  storeId,
  type,
  address,
  value,
  onChange,
  variant = "checkout",
}: Props) {
  const [availability, setAvailability] = React.useState<StoreAvailability | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState("");
  const [draftSlot, setDraftSlot] = React.useState<FulfillmentSlot | null>(null);
  const [internalValue, setInternalValue] = React.useState<FulfillmentSelection | null>(value ?? null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const selection = value === undefined ? internalValue : value;
  const selectedTiming = selection?.timing;
  const selectedStart =
    selection?.timing === "scheduled" ? selection.scheduledSlot.startAt : undefined;
  const selectedEnd =
    selection?.timing === "scheduled" ? selection.scheduledSlot.endAt : undefined;

  const setSelection = React.useCallback(
    (next: FulfillmentSelection | null) => {
      setInternalValue(next);
      onChangeRef.current?.(next);
      try {
        if (next) localStorage.setItem(storageKey(storeId, type), JSON.stringify(next));
        else localStorage.removeItem(storageKey(storeId, type));
      } catch {}
    },
    [storeId, type]
  );

  React.useEffect(() => {
    if (value !== undefined || internalValue) return;
    try {
      const saved = localStorage.getItem(storageKey(storeId, type));
      if (saved) setSelection(JSON.parse(saved));
    } catch {}
  }, [internalValue, setSelection, storeId, type, value]);

  React.useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ storeId, type });
    if (typeof address?.latitude === "number") query.set("latitude", String(address.latitude));
    if (typeof address?.longitude === "number") query.set("longitude", String(address.longitude));
    setLoading(true);
    fetch(`/api/fulfillment/availability?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo consultar el horario.");
        return data as StoreAvailability;
      })
      .then((data) => {
        setAvailability(data);
        setSelectedDate(data.slots[0]?.date ?? "");
        if (!selectedTiming && data.asapAvailable) setSelection({ timing: "asap" });
        if (
          selectedTiming === "scheduled" &&
          !data.slots.some(
            (slot) =>
              slot.start === selectedStart &&
              slot.end === selectedEnd
          )
        ) {
          setSelection(null);
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setAvailability(null);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [
    address?.latitude,
    address?.longitude,
    selectedEnd,
    selectedStart,
    selectedTiming,
    setSelection,
    storeId,
    type,
  ]);

  const days = React.useMemo(
    () => [...new Map((availability?.slots ?? []).map((slot) => [slot.date, slot])).values()],
    [availability]
  );
  const slots = (availability?.slots ?? []).filter((slot) => slot.date === selectedDate);

  const modal = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bottom-0 top-auto grid max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.5rem)] grid-rows-[auto_minmax(0,1fr)_auto] translate-y-0 gap-0 overflow-hidden rounded-b-none rounded-t-3xl border-0 p-0 sm:bottom-auto sm:top-1/2 sm:max-h-[min(90dvh,48rem)] sm:max-w-lg sm:-translate-y-1/2 sm:rounded-2xl">
        <DialogHeader className="border-b px-5 pb-5 pt-6 text-left">
          <DialogTitle className="pr-8 text-xl leading-tight sm:text-2xl">
            Programa {type === "delivery" ? "una entrega" : "una recolección"}
          </DialogTitle>
          <DialogDescription>
            {availability?.nextOpeningAt
              ? `Disponible desde el ${formatOpening(availability.nextOpeningAt)}.`
              : "Elige un horario disponible del restaurante."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-hidden px-5 py-4">
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1" aria-label="Días disponibles">
            {days.map((slot) => (
              <button
                key={slot.date}
                type="button"
                onClick={() => {
                  setSelectedDate(slot.date);
                  setDraftSlot(null);
                }}
                className={`min-w-28 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors ${
                  selectedDate === slot.date
                    ? "border-black bg-black text-white"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                {formatDay(slot.start)}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain rounded-2xl border border-gray-200">
            {slots.map((slot) => (
              <label
                key={slot.start}
                className={`flex min-h-16 cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium transition-colors ${
                  draftSlot?.start === slot.start ? "bg-gray-50" : "bg-white hover:bg-gray-50"
                }`}
              >
                {formatSlot(slot.start, slot.end)}
                <input
                  type="radio"
                  name={`slot-${storeId}-${type}`}
                  checked={draftSlot?.start === slot.start}
                  onChange={() => setDraftSlot(slot)}
                  className="h-5 w-5 shrink-0 accent-black"
                />
              </label>
            ))}
            {!loading && slots.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">No hay intervalos disponibles.</p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="grid grid-cols-1 gap-2 border-t bg-white px-5 pb-[calc(1rem_+_env(safe-area-inset-bottom))] pt-4 sm:grid-cols-2 sm:pb-4">
          <button
            type="button"
            disabled={!draftSlot}
            onClick={() => {
              if (!draftSlot) return;
              setSelection({
                timing: "scheduled",
                scheduledSlot: {
                  startAt: draftSlot.start,
                  endAt: draftSlot.end,
                  timezone: draftSlot.timezone,
                },
              });
              setOpen(false);
            }}
            className="h-12 rounded-xl bg-black px-5 font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
          >
            Programar
          </button>
          <DialogClose className="h-12 rounded-xl bg-gray-100 px-5 font-semibold transition-colors hover:bg-gray-200">
            Cancelar
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (variant === "store-status") {
    if (
      loading ||
      !availability ||
      (availability.isStoreOpen && availability.asapAvailable)
    ) return null;
    const canSchedule = availability?.schedulingAvailable;
    const noDeliveryDrivers =
      type === "delivery" &&
      availability.isStoreOpen &&
      !availability.asapAvailable;
    return (
      <>
        <div className="flex items-center gap-2 whitespace-nowrap text-sm font-medium">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span>{noDeliveryDrivers ? "Sin repartidores disponibles" : "Cerrado"}</span>
          {canSchedule ? (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="font-semibold text-[#EB1901] underline-offset-4 hover:underline"
              >
                Programar pedido
              </button>
            </>
          ) : null}
        </div>
        {modal}
      </>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h5 className="flex items-center gap-2 text-sm font-semibold">
        <Clock3 className="h-4 w-4 text-[#EB1901]" />
        Horario de {type === "delivery" ? "entrega" : "recolección"}
      </h5>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!availability?.asapAvailable}
          onClick={() => setSelection({ timing: "asap" })}
          className={`rounded-xl border p-3 text-left ${
            selection?.timing === "asap" ? "border-2 border-black" : "border-gray-200"
          } disabled:bg-gray-50 disabled:text-gray-400`}
        >
          <span className="block text-sm font-semibold">Lo antes posible</span>
          {!availability?.asapAvailable ? (
            <span className="mt-1 block text-xs">No disponible en este momento</span>
          ) : null}
        </button>
        <button
          type="button"
          disabled={!availability?.schedulingAvailable}
          onClick={() => setOpen(true)}
          className={`rounded-xl border p-3 text-left ${
            selection?.timing === "scheduled" ? "border-2 border-black" : "border-gray-200"
          } disabled:bg-gray-50 disabled:text-gray-400`}
        >
          <span className="flex items-center gap-1 text-sm font-semibold">
            <CalendarClock className="h-4 w-4" />
            Programar
          </span>
          {selection?.timing === "scheduled" ? (
            <span className="mt-1 block text-xs">
              {formatDay(selection.scheduledSlot.startAt)},{" "}
              {formatSlot(selection.scheduledSlot.startAt, selection.scheduledSlot.endAt)}
            </span>
          ) : null}
        </button>
      </div>
      {availability?.reason && !availability.asapAvailable ? (
        <p className="mt-2 text-xs text-gray-600">{availability.reason}</p>
      ) : null}
      {modal}
    </section>
  );
}
