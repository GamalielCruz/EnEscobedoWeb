import { formatCurrency } from "@/lib/formatCurrency";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import { getMyOrders } from "@/sanity/lib/orders/getMyOrders";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  Bell,
  ChefHat,
  CheckCircle,
  Clock,
  Package,
  ShoppingBag,
  Truck,
} from "lucide-react";

import { OrdersRefresh } from "@/components/OrdersRefresh";
import { RefreshOrdersButton } from "@/components/RefreshOrdersButton";
import { OrdersStatusNotifications } from "@/components/OrdersStatusNotifications";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DeliveryPinCard } from "@/components/DeliveryPinCard";
import { NipStatusCard } from "@/components/NipStatusCard";
import { orderRequiresDeliveryPin, revealDeliveryPin } from "@/lib/delivery-pin";
import { buildNipSenderView } from "@/lib/nip-sender-view";

const BRAND_COLOR = "#eb1902";

interface ExtendedOrder {
  _id?: string;
  orderNumber?: string;
  orderDate?: string;
  createdAt?: string;
  status?: string;
  totalPrice?: number;
  currency?: string;
  paymentMethod?: string;
  products?: Array<{
    product?: {
      _id?: string;
      name?: string;
      price?: number;
      image?: any;
    };
    quantity?: number;
    notes?: string;
    allergies?: string[];
  }>;
  isClickCollect?: boolean;
  pickupCode?: string;
  storeInfo?: {
    storeName?: string;
    storeAddress?: string;
    storePhone?: string;
  };
  amountDiscount?: number;
  orderType?: string;
  serviceKind?: string;
  mandadoMode?: "pickup" | "purchase";
  mandadoOrigin?: { label?: string };
  mandadoDestination?: { label?: string };
  mandadoOriginReference?: string;
  mandadoDestinationReference?: string;
  mandadoDetails?: string;
  mandadoEntregaSegura?: boolean;
  deliveryPinCiphertext?: string;
  deliveryVerificationStatus?: string;
  nipDeliveryStatus?: string;
  deliveryPinExpiresAt?: string;
  deliveryPinRegenCount?: number;
  deliveryPinRegenCooldownUntil?: string;
  nipResendCooldownUntil?: string;
  mandadoNipRecipient?: string;
  mandadoRecipientWhatsAppDeclared?: boolean;
  mandadoRecipientName?: string;
  mandadoRecipientPhone?: string;
}

const getOrderStep = (status: string | undefined) => {
  if (!status) return 0;

  const stepMap: Record<string, number> = {
    pending: 1,
    paid: 1,
    pending_delivery: 1,
    pending_pickup: 1,
    processing: 2,
    ready_for_pickup: 3,
    shipped: 3,
    completed: 4,
    delivered: 4,
    picked_up: 4,
  };

  return stepMap[status] || 0;
};

const getStatusLabel = (status: string | undefined, isClickCollect?: boolean) => {
  const labels: Record<string, string> = {
    pending: "Recibido",
    paid: "Recibido",
    pending_delivery: "Recibido",
    pending_pickup: "Recibido",
    processing: "Preparando",
    shipped: "En Camino",
    ready_for_pickup: isClickCollect ? "Listo para Recoger" : "En Camino",
    completed: "Completado",
    delivered: "Completado",
    picked_up: "Completado",
    cancelled: "Cancelado",
    failed: "Fallido",
    expired: "Expirado",
  };

  return labels[status || ""] || "Recibido";
};

const OrderStepper = ({
  status,
  isClickCollect,
  isMandado,
}: {
  status: string | undefined;
  isClickCollect: boolean | undefined;
  isMandado?: boolean;
}) => {
  const currentStep = getOrderStep(status);
  const progress = currentStep > 0 ? ((currentStep - 1) / 3) * 100 : 0;

  const steps = [
    { id: 1, label: "Recibido", icon: Bell },
    { id: 2, label: isMandado ? "Asignando" : "Preparando", icon: isMandado ? Truck : ChefHat },
    {
      id: 3,
      label: isClickCollect ? "Listo para Recoger" : "En Camino",
      icon: isClickCollect ? ShoppingBag : Truck,
    },
    { id: 4, label: "Completado", icon: CheckCircle },
  ];

  return (
    <div className="w-full py-5">
      <div className="relative flex items-start justify-between">
        <div className="absolute left-5 right-5 top-5 h-1 rounded-full bg-gray-200" />
        <div
          className="absolute left-5 top-5 h-1 rounded-full transition-all duration-500"
          style={{ width: `calc((100% - 40px) * ${progress / 100})`, backgroundColor: BRAND_COLOR }}
        />

        {steps.map((step) => {
          const isActive = step.id <= currentStep;
          const isCurrent = step.id === currentStep;
          const Icon = step.icon;

          return (
            <div key={step.id} className="relative z-10 flex w-20 flex-col items-center text-center sm:w-28">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                  isActive ? "text-white shadow-sm" : "border-gray-300 bg-white text-gray-400"
                }`}
                style={{
                  backgroundColor: isActive ? BRAND_COLOR : "white",
                  borderColor: isActive ? BRAND_COLOR : undefined,
                }}
              >
                <Icon className={`h-5 w-5 ${isCurrent ? "animate-pulse" : ""}`} />
              </div>
              <p className={`mt-2 text-xs font-medium leading-tight ${isActive ? "text-gray-900" : "text-gray-400"}`}>
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ActiveOrderCard = ({ order }: { order: ExtendedOrder }) => {
  const createdAt = order.orderDate ?? order.createdAt;
  // Regla única de NIP: se muestra solo si la orden REALMENTE lo requiere
  // (mandados: Entrega segura activa; restaurantes: método pin pendiente).
  // La existencia de un NIP almacenado NO implica requisito.
  // Restaurantes: el PIN se revela al cliente como hoy (cliente = destinatario).
  // Mandados: el PIN NO se revela aquí; lo decide NipStatusCard según el canal
  // (nunca al remitente cuando el canal es el destinatario).
  const isMandado = order.serviceKind === "mandado";
  const deliveryPin =
    !isMandado &&
    order.orderType === "delivery" &&
    order.deliveryPinCiphertext &&
    orderRequiresDeliveryPin(order as ExtendedOrder)
      ? revealDeliveryPin(order.deliveryPinCiphertext)
      : null;

  // Experiencia del remitente (CASOS 1-8): view model puro, humano, sin estados
  // técnicos de Meta. El PIN solo se revela cuando el canal es el remitente y el
  // mensaje fue enviado/entregado/falló (showPinToSender).
  const nipView =
    isMandado && orderRequiresDeliveryPin(order as ExtendedOrder)
      ? buildNipSenderView(order as ExtendedOrder)
      : null;
  const nipPin =
    nipView?.showPinToSender && order.deliveryPinCiphertext
      ? revealDeliveryPin(order.deliveryPinCiphertext)
      : undefined;

  return (
    <Card className="overflow-hidden border border-gray-200 shadow-sm">
      <CardHeader className="border-l-4 bg-white pb-4" style={{ borderLeftColor: BRAND_COLOR }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Orden #{order.orderNumber}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold text-gray-900">
                {formatCurrency(order.totalPrice ?? 0, order.currency)}
              </h3>
              <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-700">
                {getStatusLabel(order.status, order.isClickCollect)}
              </Badge>
              {order.isClickCollect && (
                <Badge variant="outline" className="border-gray-200 bg-white text-gray-600">
                  Click & Collect
                </Badge>
              )}
            </div>
          </div>

          {createdAt && (
            <div className="text-left text-sm text-gray-500 sm:text-right">
              <p>{new Date(createdAt).toLocaleDateString("es-MX")}</p>
              <p>{new Date(createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {deliveryPin && <DeliveryPinCard pin={deliveryPin} />}
        {nipView && order._id && <NipStatusCard orderId={order._id} view={nipView} pin={nipPin} />}
        <OrderStepper status={order.status} isClickCollect={order.isClickCollect} isMandado={order.serviceKind === "mandado"} />

        <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
          {order.isClickCollect && order.status === "ready_for_pickup" && order.pickupCode && (
            <div className="mb-4 border-b border-gray-200 pb-4 text-center">
              <p className="text-sm font-medium text-gray-700">Codigo</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-widest" style={{ color: BRAND_COLOR }}>
                {order.pickupCode}
              </p>
            </div>
          )}

          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <ShoppingBag className="h-4 w-4" />
            {order.serviceKind === "mandado" ? "Resumen del mandado" : "Resumen del pedido"}
          </p>

          {order.serviceKind === "mandado" ? (
            <div className="space-y-3 rounded-md border border-gray-100 bg-white p-4 text-sm">
              <p><strong>{order.mandadoMode === "purchase" ? "Comprar en:" : "Recoger en:"}</strong> {order.mandadoOrigin?.label}</p>
              {order.mandadoOriginReference && <p className="text-xs text-gray-500">💬 Indicaciones para el repartidor: {order.mandadoOriginReference}</p>}
              <p><strong>Entregar en:</strong> {order.mandadoDestination?.label}</p>
              {order.mandadoDestinationReference && <p className="text-xs text-gray-500">💬 Indicaciones para el repartidor: {order.mandadoDestinationReference}</p>}
              <p className="rounded-lg bg-gray-50 p-3 text-gray-700">{order.mandadoDetails}</p>
            </div>
          ) : <ul className="space-y-2">
            {order.products?.map((item, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-white p-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {item.product?.image && (
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-gray-100">
                      <Image
                        src={imageUrl(item.product.image).url()}
                        alt={item.product?.name ?? "Producto"}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">
                    </p>
                      {item.quantity}x {item.product?.name}
                    {item.notes ? (
                      <p className="mt-1 text-xs text-amber-700">Instrucciones: {item.notes}</p>
                    ) : null}
                    {item.allergies?.length ? (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        Alergias: {item.allergies.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 font-medium text-gray-700">
                  {item.product?.price ? formatCurrency(item.product.price * (item.quantity ?? 1), order.currency) : "-"}
                </span>
              </li>
            ))}
          </ul>}

          {order.amountDiscount ? (
            <p className="mt-3 text-right text-sm font-medium" style={{ color: BRAND_COLOR }}>
              Ahorraste: {formatCurrency(order.amountDiscount, order.currency)}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

const PastOrderCard = ({ order }: { order: ExtendedOrder }) => {
  const isCancelled = order.status === "cancelled" || order.status === "failed" || order.status === "expired";
  const createdAt = order.orderDate ?? order.createdAt;

  return (
    <div className="flex flex-col justify-between gap-4 rounded-lg border bg-white p-4 transition-shadow hover:shadow-sm sm:flex-row sm:items-center">
      <div className="flex items-start gap-4">
        <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${isCancelled ? "bg-red-500" : "bg-gray-900"}`} />
        <div>
          <div className="flex items-center gap-2 font-medium text-gray-900">
            Orden #{order.orderNumber}
            {order.isClickCollect && <Badge variant="outline" className="h-5 text-[10px]">Click & Collect</Badge>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {createdAt ? new Date(createdAt).toLocaleDateString("es-MX") : ""} · {order.serviceKind === "mandado" ? "Mandado" : `${order.products?.length ?? 0} productos`}
          </p>
          <Badge
            variant="secondary"
            className={`mt-2 text-xs font-normal ${
              isCancelled ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-gray-100 text-gray-700 hover:bg-gray-100"
            }`}
          >
            {getStatusLabel(order.status, order.isClickCollect)}
          </Badge>
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold text-gray-900">{formatCurrency(order.totalPrice ?? 0, order.currency)}</p>
        <span className="text-xs uppercase tracking-wide text-gray-400">Total</span>
      </div>
    </div>
  );
};

async function Orders() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const orders = (await getMyOrders(userId)) as ExtendedOrder[];
  const activeStatuses = ["pending", "paid", "processing", "pending_delivery", "pending_pickup", "shipped", "ready_for_pickup"];

  const activeOrders = orders.filter((order) => activeStatuses.includes(order.status || ""));
  const pastOrders = orders.filter((order) => !activeStatuses.includes(order.status || ""));

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 p-4 pt-4 sm:pt-8">
      <OrdersRefresh userId={userId} />

      <div className="w-full max-w-3xl space-y-8">
        <OrdersStatusNotifications />

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Mis Pedidos</h1>
            <p className="mt-1 text-sm text-gray-500">Estado y resumen de tus compras</p>
          </div>
          <RefreshOrdersButton />
        </div>

        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b pb-2">
            <Package className="h-5 w-5" style={{ color: BRAND_COLOR }} />
            <h2 className="text-lg font-semibold text-gray-800">Pedidos en Curso</h2>
          </div>

          {activeOrders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center">
              <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="font-medium text-gray-500">No tienes pedidos en curso.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {activeOrders.map((order) => (
                <ActiveOrderCard key={order._id} order={order} />
              ))}
            </div>
          )}
        </section>

        {pastOrders.length > 0 && (
          <section className="space-y-4 pt-4">
            <div className="flex items-center gap-2 border-b pb-2">
              <Clock className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-600">Historial</h2>
            </div>
            <div className="space-y-3">
              {pastOrders.map((order) => (
                <PastOrderCard key={order._id} order={order} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default Orders;
