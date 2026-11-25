import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import OrderTrackingScreen from "@/components/OrderTrackingScreen";
import { backendClient } from "@/sanity/lib/backendClient";

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────
// /pedido/[orderNumber] — pantalla de seguimiento del cliente.
// Server component: valida sesión + propiedad del pedido antes de montar
// la pantalla. El sondeo en vivo vive en OrderTrackingScreen (client).
// ────────────────────────────────────────────────────────────────────

export default async function PedidoTrackingPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/pedido/${orderNumber}`)}`);
  }

  // El filtro `clerkUserId == $userId` impide consultar pedidos ajenos, por lo
  // que el userId resuelto por Clerk SIEMPRE debe enviarse como parámetro.
  // Omitirlo provoca el error de Sanity "param $userId referenced, but not
  // provided". El redirect previo garantiza que aquí userId es una cadena.
  //
  // Lectura SIN CDN: un pedido recién creado con TARJETA nace en
  // /api/checkout/confirm justo antes de este render; el CDN puede servirlo
  // con retraso y provocar un redirect inmediato a /orders (la espera nunca se
  // veía). Se excluyen drafts para no servir una versión no publicada.
  const order = await backendClient.fetch(
    `*[_type == "order" && !(_id in path('drafts.**')) && (orderNumber == $orderNumber || _id == $orderNumber) && clerkUserId == $userId][0]{ _id }`,
    { orderNumber, userId }
  );

  if (!order) {
    redirect("/orders");
  }

  return <OrderTrackingScreen orderNumber={orderNumber} />;
}
