import { isStoreOpen } from "./storeHours";

export type ManualOperationalStatus = "open" | "closed" | "auto";

export type StoreOperationalStateInput = {
  operatingHours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  } | null;
  manualOperationalStatus?: ManualOperationalStatus | null;
  isOpen?: boolean | null;
  highDemandMode?: boolean | null;
  serviceTypes?: {
    onDemand?: boolean;
    onDemandExtraMinutes?: number;
  } | null;
  deliveryTimeMin?: number | null;
  deliveryTimeMax?: number | null;
  averageDeliveryTime?: number | null;
};

export function getStoreOperationalState(store?: StoreOperationalStateInput | null) {
  const scheduleState = isStoreOpen(store?.operatingHours ?? undefined);
  const manualOperationalStatus = store?.manualOperationalStatus ?? null;
  const legacyClosed = store?.isOpen === false;

  const effectiveIsOpen =
    manualOperationalStatus === "open"
      ? true
      : manualOperationalStatus === "closed"
        ? false
        : legacyClosed
          ? false
          : scheduleState.isOpen;

  const highDemandMode = Boolean(
    store?.highDemandMode ?? store?.serviceTypes?.onDemand ?? false
  );
  const acceptingOrders = Boolean(effectiveIsOpen && store?.isOpen !== false);

  return {
    manualOperationalStatus,
    scheduleState,
    effectiveIsOpen,
    highDemandMode,
    canAcceptOrders: acceptingOrders,
  };
}

export function getStoreServiceTiming(store?: StoreOperationalStateInput | null, fallbackMin?: number) {
  const { highDemandMode } = getStoreOperationalState(store);
  const extra = highDemandMode ? Number(store?.serviceTypes?.onDemandExtraMinutes ?? 15) || 15 : 0;
  const minRaw = store?.deliveryTimeMin ?? fallbackMin;
  const maxRaw = store?.deliveryTimeMax ?? minRaw;

  if (minRaw != null) {
    const min = Number(minRaw) || Number(fallbackMin ?? 10);
    const max = Math.max(Number(maxRaw) || min, min);
    const estimatedMin = min + extra;
    const estimatedMax = max + extra;

    return {
      highDemandMode,
      label: estimatedMin === estimatedMax ? `${estimatedMin} min` : `${estimatedMin}-${estimatedMax} min`,
    };
  }

  return {
    highDemandMode,
    label: store?.averageDeliveryTime ? `${store.averageDeliveryTime} dias` : "",
  };
}
