import "server-only";

import {
  DEFAULT_DELIVERY_SCHEDULE,
  type DeliveryScheduleConfig,
  normalizeDeliveryScheduleConfig,
} from "@/lib/fulfillment-schedule";
import { backendClient } from "@/sanity/lib/backendClient";

export const DELIVERY_SCHEDULE_CONFIG_ID = "deliveryScheduleConfig";

export async function getDeliveryScheduleConfig() {
  const config = await backendClient.fetch<Partial<DeliveryScheduleConfig> | null>(
    `*[_type == "deliveryScheduleConfig" && _id == $id][0]`,
    { id: DELIVERY_SCHEDULE_CONFIG_ID }
  );
  return normalizeDeliveryScheduleConfig(config ?? DEFAULT_DELIVERY_SCHEDULE);
}
