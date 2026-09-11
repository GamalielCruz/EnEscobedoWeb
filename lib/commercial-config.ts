import { backendClient } from "@/sanity/lib/backendClient";
import { getMexicoDateKey } from "./mexico-time";
import {
  DEFAULT_COMMERCIAL_SETTINGS,
  normalizeCommercialSettings,
  resolveEffectiveCommercialConditions,
  type CommercialSettings,
  type StoreCommercialFields,
} from "./commercial-rules";

export const COMMERCIAL_SETTINGS_ID = "commercial-settings";

export type CommercialStoreRecord = StoreCommercialFields & {
  _id: string;
  name?: string;
};

const STORE_COMMERCIAL_FIELDS = `
  _id,
  name,
  commercialPlanId,
  commercialOverrides,
  commercialReviewRequired,
  commercialNotes,
  commercialPlanStartedAt,
  platformCommissionPercent
`;

export async function getCommercialSettings() {
  const settings = await backendClient.fetch<Partial<CommercialSettings> | null>(
    `*[_type == "commercialSettings" && _id == $id][0]`,
    { id: COMMERCIAL_SETTINGS_ID }
  );
  return normalizeCommercialSettings(settings || DEFAULT_COMMERCIAL_SETTINGS);
}

export async function getStoreCommercialConditions(storeId: string) {
  const [settings, store] = await Promise.all([
    getCommercialSettings(),
    backendClient.fetch<CommercialStoreRecord | null>(
      `*[_type == "affiliateStore" && _id == $storeId][0]{${STORE_COMMERCIAL_FIELDS}}`,
      { storeId }
    ),
  ]);
  if (!store) throw new Error("El restaurante no existe.");
  return { store, settings, effective: resolveEffectiveCommercialConditions(store, settings) };
}

export async function getMonthlyCommissionAccumulated(storeId: string, now = new Date()) {
  const [year, month] = getMexicoDateKey(now).split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const start = `${year}-${String(month).padStart(2, "0")}-01T00:00:00-06:00`;
  const end = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01T00:00:00-06:00`;
  const usageId = `commercial-commission-${storeId}-${year}-${String(month).padStart(2, "0")}`.replace(/[^a-zA-Z0-9._-]/g, "-");
  const usage = await backendClient.getDocument<{ charged?: number }>(usageId);
  if (usage) return Number(usage.charged || 0);

  return Number(
    (await backendClient.fetch<number | null>(
      `math::sum(*[
        _type == "order"
        && affiliateStore._ref == $storeId
        && orderDate >= $start
        && orderDate < $end
        && orderStatus != "cancelled"
        && paymentStatus != "refunded"
      ].platformCommission)`,
      { storeId, start, end }
    )) || 0
  );
}

export async function getCommercialAdminSnapshot() {
  const [settings, stores] = await Promise.all([
    getCommercialSettings(),
    backendClient.fetch<CommercialStoreRecord[]>(
      `*[_type == "affiliateStore"] | order(name asc){${STORE_COMMERCIAL_FIELDS}}`
    ),
  ]);
  const accumulated = await Promise.all(
    stores.map((store) => getMonthlyCommissionAccumulated(store._id))
  );

  return {
    settings,
    stores: stores.map((store, index) => ({
      ...store,
      effective: resolveEffectiveCommercialConditions(store, settings),
      accumulatedCommission: Math.round(accumulated[index] * 100) / 100,
    })),
  };
}
