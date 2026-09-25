import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import OrderTrackingScreen from "@/components/OrderTrackingScreen";
import { client } from "@/sanity/lib/client";

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

  const order = await client.fetch(
    `*[_type == "order" && (orderNumber == $orderNumber || _id == $orderNumber) && clerkUserId == $userId][0]{ _id }`,
    { orderNumber }
  );

  if (!order) {
    redirect("/orders");
  }

  return <OrderTrackingScreen orderNumber={orderNumber} />;
}
