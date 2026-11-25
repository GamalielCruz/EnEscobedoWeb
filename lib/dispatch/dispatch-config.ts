import { backendClient } from "@/sanity/lib/backendClient";
import {
  DEFAULT_DISPATCH_CONFIG,
  normalizeDispatchConfig,
  type DispatchConfig,
  type DispatchMode,
} from "./dispatch-config-values";

export const DISPATCH_CONFIG_ID = "dispatchConfig";

export { DEFAULT_DISPATCH_CONFIG, normalizeDispatchConfig } from "./dispatch-config-values";
export type { DispatchConfig, DispatchMode } from "./dispatch-config-values";

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
