import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import { buildDriverWallet } from "@/lib/driver-wallet";
import { getMexicoDateKey } from "@/lib/mexico-time";

export const dynamic = "force-dynamic";

/**
 * GET /api/driver/wallet — ganancias del repartidor (v1, solo lectura).
 *
 * El saldo NO se guarda: se DERIVA de los pedidos ya entregados asignados al
 * repartidor. Cada pedido trae `driverPayout` = la parte del repartidor con
 * el porcentaje de ElMenu YA descontado al crear el pedido (ver
 * lib/order-pricing.ts), así que aquí NO se vuelve a deducir nada.
 *
 * Fail-closed: cualquier problema de datos simplemente no suma — la vista
 * muestra cero/lista vacía, nunca un saldo inventado.
 *
 * EFECTIVO vs TARJETA: `cashCollectedBy` dice quién recibió el efectivo. Si lo
 * cobró el repartidor, ese fee ya está en su mano (no se le debe) y la billetera
 * solo acumula lo que ElMenu le pagará después (pagos en línea/tarjeta o
 * servicios pendientes de liquidar).
 *
 * "Día" y "semana" se calculan en HORA DE MÉXICO (mismo criterio que
 * /admin/finanzas), nunca con el reloj del teléfono.
 */

const WALLET_QUERY = `*[
  _type == "order" &&
  !(_id in path('drafts.**')) &&
  repartidorAsignado._ref == $driverId &&
  defined(deliveredAt)
] | order(deliveredAt desc)[0...200]{
  orderNumber,
  deliveredAt,
  orderDate,
  serviceKind,
  "storeName": coalesce(affiliateStore->name, mandadoOrigin.label),
  destLabel,
  driverPayout,
  settlementStatus,
  orderStatus,
  status,
  paymentMethod,
  cashCollectedBy
}`;

type WalletOrderRow = {
  orderNumber: string;
  deliveredAt?: string | null;
  orderDate?: string | null;
  serviceKind?: string | null;
  storeName?: string | null;
  destLabel?: string | null;
  driverPayout?: number | null;
  settlementStatus?: string | null;
  orderStatus?: string | null;
  status?: string | null;
  paymentMethod?: string | null;
  cashCollectedBy?: string | null;
};

export async function GET() {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const { repartidor } = auth;

  try {
    const { backendClient } = await import("@/sanity/lib/backendClient");

    const todayKey = getMexicoDateKey();
    const weekStartMs =
      new Date(`${todayKey}T00:00:00-06:00`).getTime() - 7 * 24 * 60 * 60 * 1000;

    const rows = await backendClient.fetch<WalletOrderRow[]>(WALLET_QUERY, {
      driverId: repartidor._id,
    });

    const wallet = buildDriverWallet(rows ?? [], todayKey, weekStartMs);

    return NextResponse.json(
      { ok: true, wallet, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[driver/wallet] Error calculando ganancias", {
      repartidorId: repartidor._id,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
    return NextResponse.json(
      { ok: false, error: "No pudimos calcular tus ganancias. Intenta de nuevo en unos segundos." },
      { status: 500 }
    );
  }
}
