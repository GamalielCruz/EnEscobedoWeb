import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dispatch/dispatch-core";
import { maskPhone } from "@/lib/nip-sender-view";
import {
  deriveNipIncidentType,
  effectiveNipStatus,
  type NipIncidentType,
} from "@/lib/nip-delivery";
import { backendClient } from "@/sanity/lib/backendClient";

export const dynamic = "force-dynamic";

// Órdenes activas de mandado con Entrega segura cuyo código NO fue entregado al
// canal configurado (o expiró). Es la fuente de la bandeja de incidencias de NIP
// del Dispatch Center. Sin teléfonos completos: solo últimos 4 dígitos.
const NIP_INCIDENTS_QUERY = `*[_type == "order" &&
  !(_id in path("drafts.**")) &&
  serviceKind == "mandado" &&
  mandadoEntregaSegura == true &&
  status != "cancelled" && status != "delivered" && status != "refunded" &&
  orderStatus != "cancelled" && orderStatus != "delivered" && orderStatus != "completed" && orderStatus != "picked_up"
] | order(orderDate desc)[0...100]{
  _id,
  orderNumber,
  customerName,
  phone,
  mandadoRecipientName,
  mandadoRecipientPhone,
  mandadoNipRecipient,
  mandadoRecipientWhatsAppDeclared,
  nipDeliveryStatus,
  deliveryVerificationStatus,
  deliveryPinCreatedAt,
  deliveryPinExpiresAt,
  deliveryPinRegenCount,
  deliveryPinRegenCooldownUntil,
  nipResendCooldownUntil,
  nipIncidentAt,
  nipIncidentType,
  orderDate,
  "driverName": repartidorAsignado->nombre
}`;

export type NipIncident = {
  _id: string;
  orderNumber: string;
  customerName?: string;
  recipientName?: string;
  recipientPhoneMasked?: string;
  channel: "sender" | "recipient";
  nipDeliveryStatus: string;
  deliveryVerificationStatus?: string;
  /** Razón operativa de la incidencia (tipos separados, endurecimiento). */
  reason: NipIncidentType;
  /** Última vez que se intentó entregar el código (creación/regeneración/reenvío). */
  lastAttemptAt?: string;
  lastAttemptMinutesAgo?: number | null;
  incidentAt?: string;
  incidentMinutesAgo?: number | null;
  canRegenerate: boolean;
  regenCooldownSeconds: number;
  resendCooldownSeconds: number;
  driverName?: string;
};

export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  try {
    const raw = (await backendClient.fetch(NIP_INCIDENTS_QUERY)) as Array<Record<string, unknown>>;
    const now = new Date();

    const minutesAgo = (iso?: unknown) => {
      if (!iso) return null;
      const ms = now.getTime() - new Date(String(iso)).getTime();
      return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60000) : null;
    };

    const incidents: NipIncident[] = [];
    for (const order of raw) {
      const orderRecord = order as Record<string, unknown>;
      // Estado EFECTIVO canónico (la misma evaluación de /orders y del gate de
      // entrega): verificado > expirado > estado del mensaje. Solo incidencias
      // reales: código no entregado al canal, expirado, o canal remitente por
      // destinatario sin WhatsApp. NUNCA se inventa que fue entregado.
      const status = effectiveNipStatus(orderRecord as never, now);
      if (status === "delivered" || status === "verified" || status === "no_pin") continue;

      const regenCount = Number(orderRecord.deliveryPinRegenCount ?? 0);
      const regenCooldownUntil = orderRecord.deliveryPinRegenCooldownUntil
        ? new Date(String(orderRecord.deliveryPinRegenCooldownUntil))
        : null;
      const resendCooldownUntil = orderRecord.nipResendCooldownUntil
        ? new Date(String(orderRecord.nipResendCooldownUntil))
        : null;

      incidents.push({
        _id: String(orderRecord._id),
        orderNumber: String(orderRecord.orderNumber ?? ""),
        customerName: String(orderRecord.customerName ?? ""),
        recipientName: String(orderRecord.mandadoRecipientName ?? "") || undefined,
        recipientPhoneMasked: maskPhone(String(orderRecord.mandadoRecipientPhone ?? "")),
        channel: String(orderRecord.mandadoNipRecipient ?? "") === "recipient" ? "recipient" : "sender",
        nipDeliveryStatus: status,
        deliveryVerificationStatus: String(orderRecord.deliveryVerificationStatus ?? ""),
        // Tipo de incidencia separado: el persistido (si existe) o el derivado
        // de la misma regla que usa el webhook al registrarla.
        reason:
          (String(orderRecord.nipIncidentType ?? "") as NipIncidentType) ||
          deriveNipIncidentType(
            orderRecord as never,
            status === "expired" ? "expired" : "not_delivered"
          ),
        lastAttemptAt: String(orderRecord.deliveryPinCreatedAt ?? "") || undefined,
        lastAttemptMinutesAgo: minutesAgo(orderRecord.deliveryPinCreatedAt),
        incidentAt: String(orderRecord.nipIncidentAt ?? "") || undefined,
        incidentMinutesAgo: minutesAgo(orderRecord.nipIncidentAt),
        canRegenerate: regenCount < 3 && !(regenCooldownUntil && regenCooldownUntil.getTime() > now.getTime()),
        regenCooldownSeconds:
          regenCooldownUntil && regenCooldownUntil.getTime() > now.getTime()
            ? Math.ceil((regenCooldownUntil.getTime() - now.getTime()) / 1000)
            : 0,
        resendCooldownSeconds:
          resendCooldownUntil && resendCooldownUntil.getTime() > now.getTime()
            ? Math.ceil((resendCooldownUntil.getTime() - now.getTime()) / 1000)
            : 0,
        driverName: String(orderRecord.driverName ?? "") || undefined,
      });
    }

    return NextResponse.json({ incidents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin/dispatch/nip-incidents GET]", error);
    return NextResponse.json({ error: "No se pudieron cargar las incidencias de NIP." }, { status: 500 });
  }
}
