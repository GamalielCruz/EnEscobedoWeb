import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin";
import {
  COMMERCIAL_SETTINGS_ID,
  getCommercialAdminSnapshot,
} from "@/lib/commercial-config";
import {
  normalizeCommercialSettings,
  type CommercialPlanId,
} from "@/lib/commercial-rules";
import { backendClient } from "@/sanity/lib/backendClient";

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (!isAdminUser(userId)) return { error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }) };
  return { userId };
}

const audit = (input: {
  action: string;
  userId: string;
  previous: unknown;
  next: unknown;
  storeId?: string;
}) =>
  backendClient.create({
    _type: "commercialAudit",
    action: input.action,
    adminUserId: input.userId,
    changedAt: new Date().toISOString(),
    previousValue: JSON.stringify(input.previous),
    newValue: JSON.stringify(input.next),
    ...(input.storeId ? { store: { _type: "reference", _ref: input.storeId } } : {}),
  });

export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    return NextResponse.json(await getCommercialAdminSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[admin/commercial GET]", error);
    return NextResponse.json({ error: "No se pudo cargar la configuración comercial." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error || !admin.userId) return admin.error;

  try {
    const body = await request.json();
    const now = new Date().toISOString();

    if (body?.type === "settings") {
      const rawSettings = body.settings || {};
      const nonNegative = [
        rawSettings.serviceFeeNormal,
        rawSettings.serviceFeeReduced,
        rawSettings.plans?.community?.monthlyCommissionCap,
        rawSettings.plans?.premium?.monthlyCommissionCap,
        rawSettings.plans?.community?.deliveryDiscountAmount,
        rawSettings.plans?.premium?.deliveryDiscountAmount,
      ];
      const percentages = [
        rawSettings.plans?.community?.commissionPercent,
        rawSettings.plans?.premium?.commissionPercent,
      ];
      if (
        nonNegative.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0) ||
        percentages.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)
      ) {
        return NextResponse.json({ error: "No se permiten cantidades negativas ni porcentajes fuera de 0 a 100." }, { status: 400 });
      }      const previous = await backendClient.fetch(
        `*[_type == "commercialSettings" && _id == $id][0]`,
        { id: COMMERCIAL_SETTINGS_ID }
      );
      const settings = normalizeCommercialSettings(body.settings);
      await backendClient.createOrReplace({
        _id: COMMERCIAL_SETTINGS_ID,
        _type: "commercialSettings",
        ...settings,
        updatedAt: now,
        updatedBy: admin.userId,
      });
      await audit({
        action: "Configuración general y planes actualizados",
        userId: admin.userId,
        previous,
        next: settings,
      });
      return NextResponse.json({ success: true });
    }

    if (body?.type === "store") {
      const storeId = String(body.storeId || "");
      const planId = body.planId as CommercialPlanId;
      if (!storeId || !["community", "premium"].includes(planId)) {
        return NextResponse.json({ error: "Restaurante o plan inválido." }, { status: 400 });
      }
      const previous = await backendClient.fetch(
        `*[_type == "affiliateStore" && _id == $storeId][0]{
          commercialPlanId, commercialOverrides, commercialReviewRequired,
          commercialNotes, commercialPlanStartedAt
        }`,
        { storeId }
      );
      if (!previous) return NextResponse.json({ error: "El restaurante no existe." }, { status: 404 });

      const raw = body.overrides || {};
      const overrides = {
        commissionPercent: Number(raw.commissionPercent),
        monthlyCommissionCap: Number(raw.monthlyCommissionCap),
        serviceFeeMode: raw.serviceFeeMode,
        onlinePaymentsEnabled: Boolean(raw.onlinePaymentsEnabled),
        premiumBadgeEnabled: Boolean(raw.premiumBadgeEnabled),
        bannerEligible: Boolean(raw.bannerEligible),
        promotionalMessagesEnabled: Boolean(raw.promotionalMessagesEnabled),
        deliveryBenefitEnabled: Boolean(raw.deliveryBenefitEnabled),
        deliveryDiscountAmount: Number(raw.deliveryDiscountAmount),
        deliveryBenefitAbsorbedBy: raw.deliveryBenefitAbsorbedBy,
      };
      if (
        !Number.isFinite(overrides.commissionPercent) ||
        overrides.commissionPercent < 0 ||
        overrides.commissionPercent > 100 ||
        !Number.isFinite(overrides.monthlyCommissionCap) ||
        overrides.monthlyCommissionCap < 0 ||
        !Number.isFinite(overrides.deliveryDiscountAmount) ||
        overrides.deliveryDiscountAmount < 0 ||
        !["normal", "reduced", "free"].includes(overrides.serviceFeeMode) ||
        !["platform", "restaurant"].includes(overrides.deliveryBenefitAbsorbedBy)
      ) {
        return NextResponse.json({ error: "Las condiciones comerciales no son válidas." }, { status: 400 });
      }

      const next = {
        commercialPlanId: planId,
        commercialOverrides: overrides,
        commercialReviewRequired: false,
        commercialNotes: String(body.notes || "").trim().slice(0, 2000),
        commercialPlanStartedAt:
          previous.commercialPlanId === planId && previous.commercialPlanStartedAt
            ? previous.commercialPlanStartedAt
            : now,
        commercialUpdatedAt: now,
        commercialUpdatedBy: admin.userId,
      };
      await backendClient.patch(storeId).set(next).commit();
      await audit({
        action: "Plan y condiciones del restaurante actualizados",
        userId: admin.userId,
        previous,
        next,
        storeId,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Operación inválida." }, { status: 400 });
  } catch (error) {
    console.error("[admin/commercial PATCH]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar." },
      { status: 400 }
    );
  }
}
