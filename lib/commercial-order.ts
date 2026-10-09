import { backendClient } from "@/sanity/lib/backendClient";
import { calculateCappedCommission } from "./commercial-rules";

type CommercialOrder = {
  _id?: string;
  _type: string;
  orderNumber?: string;
  orderDate?: string;
  affiliateStore?: { _ref?: string };
  platformCommission?: number;
  commissionWaivedByCap?: number;
  storeNetTotal?: number;
  platformNetTotal?: number;
  commercialSnapshot?: {
    monthlyCommissionCap?: number;
    commissionCalculated?: number;
    commissionCharged?: number;
    commissionWaivedByCap?: number;
    accumulatedBeforeOrder?: number;
  };
  [key: string]: unknown;
};

const ledgerId = (storeId: string, orderDate: string) =>
  `commercial-commission-${storeId}-${orderDate.slice(0, 7)}`.replace(/[^a-zA-Z0-9._-]/g, "-");

export async function createOrderWithCommercialCap(input: CommercialOrder): Promise<CommercialOrder & { _id: string }> {
  const order = {
    ...input,
    _id: input._id || `order-${crypto.randomUUID()}`,
  };
  const cap = Number(order.commercialSnapshot?.monthlyCommissionCap || 0);
  const rawCommission = Number(
    order.commercialSnapshot?.commissionCalculated ?? order.platformCommission ?? 0
  );
  const storeId = order.affiliateStore?._ref;

  if (!storeId || cap <= 0 || rawCommission <= 0) {
    return (await (input._id
      ? backendClient.createIfNotExists(order)
      : backendClient.create(order))) as CommercialOrder & { _id: string };
  }

  const usageId = ledgerId(storeId, String(order.orderDate || new Date().toISOString()));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [existingOrder, usage] = await Promise.all([
      backendClient.getDocument(order._id),
      backendClient.getDocument<{ _id: string; _rev: string; charged?: number }>(usageId),
    ]);
    if (existingOrder) return existingOrder as CommercialOrder & { _id: string };

    const accumulated = Number(usage?.charged ?? order.commercialSnapshot?.accumulatedBeforeOrder ?? 0);
    const commission = calculateCappedCommission({
      productsSubtotal: Number(order.commercialSnapshot?.commissionCalculated || 0),
      commissionPercent: 100,
      monthlyCommissionCap: cap,
      accumulatedCommission: accumulated,
    });
    const charged = Math.min(rawCommission, commission.chargedCommission);
    const previousCharge = Number(order.platformCommission || 0);
    const adjustment = previousCharge - charged;
    const nextOrder = {
      ...order,
      platformCommission: charged,
      commissionWaivedByCap: Math.max(0, rawCommission - charged),
      storeNetTotal: Number(order.storeNetTotal || 0) + adjustment,
      platformNetTotal: Number(order.platformNetTotal || 0) - adjustment,
      commercialSnapshot: {
        ...order.commercialSnapshot,
        commissionCharged: charged,
        commissionWaivedByCap: Math.max(0, rawCommission - charged),
        accumulatedBeforeOrder: accumulated,
      },
    };
    const transaction = backendClient.transaction().create(nextOrder);
    if (usage) {
      transaction.patch(usageId, (patch) =>
        patch.ifRevisionId(usage._rev).set({ charged: accumulated + charged, updatedAt: new Date().toISOString() })
      );
    } else {
      transaction.create({
        _id: usageId,
        _type: "commercialCommissionUsage",
        store: { _type: "reference", _ref: storeId },
        period: String(order.orderDate || "").slice(0, 7),
        charged,
        updatedAt: new Date().toISOString(),
      });
    }

    try {
      await transaction.commit();
      return (await backendClient.getDocument(order._id)) as CommercialOrder & { _id: string };
    } catch (error) {
      if (
        attempt === 4 ||
        !(
          (error as { statusCode?: number }).statusCode === 409 ||
          (error instanceof Error && /conflict|revision|already exists/i.test(error.message))
        )
      ) {
        throw error;
      }
    }
  }

  throw new Error("No se pudo reservar la comisión mensual.");
}
