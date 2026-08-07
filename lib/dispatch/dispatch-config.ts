import { backendClient } from "@/sanity/lib/backendClient";

export const DISPATCH_CONFIG_ID = "dispatchConfig";

export type DispatchMode = "auto" | "manual" | "assisted";

export type DispatchConfig = {
  mode: DispatchMode;
  maxDistanceKm: number;
  searchRadiusKm: number;
  maxOrdersPerDriver: number;
  maxWaitMinutesBeforeEscalate: number;
  prioritizeMandados: boolean;
  prioritizeRestaurants: boolean;
  allowMultipleOrders: boolean;
  allowMixStores: boolean;
  allowMixMandados: boolean;
  allowMixRestaurantMandado: boolean;
};

export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  mode: "auto",
  maxDistanceKm: 8,
  searchRadiusKm: 6,
  maxOrdersPerDriver: 3,
  maxWaitMinutesBeforeEscalate: 20,
  prioritizeMandados: false,
  prioritizeRestaurants: false,
  allowMultipleOrders: true,
  allowMixStores: false,
  allowMixMandados: true,
  allowMixRestaurantMandado: false,
};

export function normalizeDispatchConfig(raw: unknown): DispatchConfig {
  const input = (raw ?? {}) as Partial<DispatchConfig>;
  return {
    mode: input.mode === "manual" || input.mode === "assisted" ? input.mode : "auto",
    maxDistanceKm: Number.isFinite(input.maxDistanceKm) ? Number(input.maxDistanceKm) : DEFAULT_DISPATCH_CONFIG.maxDistanceKm,
    searchRadiusKm: Number.isFinite(input.searchRadiusKm) ? Number(input.searchRadiusKm) : DEFAULT_DISPATCH_CONFIG.searchRadiusKm,
    maxOrdersPerDriver: Number.isFinite(input.maxOrdersPerDriver) ? Number(input.maxOrdersPerDriver) : DEFAULT_DISPATCH_CONFIG.maxOrdersPerDriver,
    maxWaitMinutesBeforeEscalate: Number.isFinite(input.maxWaitMinutesBeforeEscalate)
      ? Number(input.maxWaitMinutesBeforeEscalate)
      : DEFAULT_DISPATCH_CONFIG.maxWaitMinutesBeforeEscalate,
    prioritizeMandados: Boolean(input.prioritizeMandados),
    prioritizeRestaurants: Boolean(input.prioritizeRestaurants),
    allowMultipleOrders: Boolean(input.allowMultipleOrders),
    allowMixStores: Boolean(input.allowMixStores),
    allowMixMandados: Boolean(input.allowMixMandados),
    allowMixRestaurantMandado: Boolean(input.allowMixRestaurantMandado),
  };
}

export async function getDispatchConfig(): Promise<DispatchConfig> {
  const doc = await backendClient.fetch(
    `*[_type == "dispatchConfig" && _id == $id][0]`,
    { id: DISPATCH_CONFIG_ID }
  );
  return normalizeDispatchConfig(doc);
}

export async function saveDispatchConfig(
  config: DispatchConfig,
  actorUserId: string
): Promise<DispatchConfig> {
  const normalized = normalizeDispatchConfig(config);
  await backendClient.createOrReplace({
    _id: DISPATCH_CONFIG_ID,
    _type: "dispatchConfig",
    ...normalized,
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId,
  });
  return normalized;
}
