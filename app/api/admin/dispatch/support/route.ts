import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dispatch/dispatch-core";
import { backendClient } from "@/sanity/lib/backendClient";
import { sendBotMessage } from "@/lib/whatsapp";

const DRIVER_SUPPORT_QUERY = `*[_type == "repartidor" && _id == $driverId][0]{
  _id,
  _rev,
  nombre,
  telefono,
  soporteChat
}`;

function messageKey() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type SupportMessage = {
  _key?: string;
  role?: string;
  body?: string;
  createdAt?: string;
  readAt?: string | null;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    const body = await request.json();
    const { action, driverId, message } = body ?? {};

    // Responder al repartidor por WhatsApp y guardar la respuesta en su chat
    if (action === "reply") {
      const cleanMessage = String(message ?? "").trim();
      if (!driverId || !cleanMessage) {
        return NextResponse.json({ error: "Faltan repartidor o mensaje." }, { status: 400 });
      }
      const driver = await backendClient.fetch(DRIVER_SUPPORT_QUERY, { driverId });
      if (!driver) return NextResponse.json({ error: "El repartidor no existe." }, { status: 404 });

      const now = new Date().toISOString();
      const body = cleanMessage.substring(0, 2000);

      await backendClient
        .patch(driverId)
        .setIfMissing({ soporteChat: [] })
        .append("soporteChat", [
          { _key: messageKey(), role: "admin", body, createdAt: now, readAt: now },
        ])
        .commit();

      await sendBotMessage(driver.telefono, body).catch(() => null);

      await backendClient
        .create({
          _type: "dispatchAudit",
          action: "driver_support_reply",
          actorUserId: admin.userId,
          actorName: "Operador admin",
          driver: { _type: "reference", _ref: driverId },
          reason: "respuesta de soporte al repartidor",
          details: "Respuesta enviada por WhatsApp desde el Dispatch Center.",
          createdAt: now,
        })
        .catch(() => null);

      return NextResponse.json({ success: true });
    }

    // Marcar como leídos los mensajes del repartidor en la conversación
    if (action === "mark_read") {
      if (!driverId) return NextResponse.json({ error: "Falta el repartidor." }, { status: 400 });
      const driver = await backendClient.fetch(DRIVER_SUPPORT_QUERY, { driverId });
      if (!driver) return NextResponse.json({ error: "El repartidor no existe." }, { status: 404 });

      const now = new Date().toISOString();
      const chat = Array.isArray(driver.soporteChat) ? (driver.soporteChat as SupportMessage[]) : [];
      const updated = chat.map((entry) =>
        entry?.role === "driver" && !entry?.readAt ? { ...entry, readAt: now } : entry
      );
      // ifRevisionId evita pisar un mensaje nuevo que el webhook haya
      // agregado entre la lectura y la escritura (raza de escritura).
      try {
        await backendClient
          .patch(driverId)
          .ifRevisionId(driver._rev)
          .set({ soporteChat: updated })
          .commit();
      } catch {
        return NextResponse.json(
          { error: "La conversación cambió; recarga e inténtalo de nuevo." },
          { status: 409 }
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  } catch (error) {
    console.error("[admin/dispatch/support]", error);
    return NextResponse.json({ error: "No se pudo completar la acción." }, { status: 500 });
  }
}
