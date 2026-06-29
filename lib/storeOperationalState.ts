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
  };
  manualOperationalStatus?: ManualOperationalStatus | null;
  isOpen?: boolean | null;
  highDemandMode?: boolean | null;
  serviceTypes?: {
    onDemand?: boolean;
    onDemandExtraMinutes?: number;
  };
};

export function getStoreOperationalState(store?: StoreOperationalStateInput | null) {
  const scheduleState = isStoreOpen(store?.operatingHours);
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

