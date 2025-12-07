import { formatCurrency } from "@/lib/formatCurrency";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import { getMyOrders } from "@/sanity/lib/orders/getMyOrders";
import { auth } from "@clerk/nextjs/server";

import { redirect } from "next/navigation";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { OxxoPaymentInfo } from "@/components/OxxoPaymentInfo";
import { BankTransferInfo } from "@/components/BankTransferInfo";
import { CashOnDeliveryInfo } from "@/components/CashOnDeliveryInfo";
import { OrderContactInfo } from "@/components/OrderContactInfo";
import { OrdersRefresh } from "@/components/OrdersRefresh";
import { RefreshOrdersButton } from "@/components/RefreshOrdersButton";

// Tipo personalizado para órdenes que incluye tanto regulares como Click & Collect
interface ExtendedOrder {
  _id?: string;
  orderNumber?: string;
  orderDate?: string;
  createdAt?: string;
  status?: string;
  totalPrice?: number;
  currency?: string;
  paymentMethod?: string;
  customerName?: string;
  email?: string;
  phone?: string;
  products?: Array<{
    product?: {
      _id?: string;
      name?: string;
      price?: number;
      image?: any;
    };
    quantity?: number;
  }>;
  // Campos específicos de Click & Collect
  isClickCollect?: boolean;
  pickupCode?: string;
  storeInfo?: {
    storeName?: string;
    storeAddress?: string;
    storePhone?: string;
  };
  estimatedPickupDate?: string;
  readyAt?: string;
  // Otros campos opcionales
  oxxoReference?: string;
  bankTransferReference?: string;
  bankTransferClabe?: string;
  stripePaymentIntentId?: string;
  shippingAddress?: any;
  codInstructions?: string;
  deliveryNotes?: string;
  expiredAt?: string;
  amountDiscount?: number;
}

async function Orders() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  // Obtener todas las órdenes (regulares y Click & Collect)
  const orders = await getMyOrders(userId) as ExtendedOrder[];
  
  // Separar órdenes para mostrar estadísticas
  const regularOrders = orders.filter((order: ExtendedOrder) => !order.isClickCollect);
  const clickCollectOrders = orders.filter((order: ExtendedOrder) => order.isClickCollect);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 translate-y-[70px]">
      <OrdersRefresh userId={userId} />
      <div className="bg-white p-4 sm:p-8 rounded-xl shadow-lg w-full max-w-4xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            Mis Pedidos
          </h1>
          <RefreshOrdersButton />
        </div>
        {clickCollectOrders.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-blue-800 text-sm">
              📋 Mostrando {regularOrders.length} pedidos regulares y {clickCollectOrders.length} pedidos Click & Collect
            </p>
          </div>
        )}
        {orders.length === 0 ? (
          <div className="text-center text-gray-600">No tienes pedidos</div>
        ) : (
          <Accordion type="multiple" className="space-y-6 sm:space-y-8">
            {orders.map((order: ExtendedOrder, idx: number) => (
              <AccordionItem
                value={order._id ?? `${order.orderNumber}-${idx}`}
                key={order._id ?? `${order.orderNumber}-${idx}`}
              >
                <AccordionTrigger className="p-4 sm:p-6 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
                  <div className="w-full flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
                    <div>
                      <p className="text-sm text-gray-600 mb-1 font-bold">
                        Numero de orden
                      </p>
                      <p className="font-mono text-sm text-green-600 break-all">
                        {order.orderNumber}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm text-gray-600 mb-1 font-bold">
                        Fecha de orden
                      </p>
                      <p className="font-sm">
                        {order.orderDate
                          ? new Date(order.orderDate).toLocaleDateString()
                          : "N/A"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Estado</span>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            // Estados para órdenes Click & Collect
                            order.isClickCollect ? (
                              order.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : order.status === "processing"
                                  ? "bg-blue-100 text-blue-800"
                                  : order.status === "ready_for_pickup"
                                    ? "bg-green-100 text-green-800"
                                    : order.status === "completed"
                                      ? "bg-purple-100 text-purple-800"
                                      : order.status === "cancelled"
                                        ? "bg-red-100 text-red-800"
                                        : "bg-gray-100 text-gray-800"
                            ) : (
                              // Estados para órdenes regulares
                              order.status === "paid"
                                ? "bg-green-100 text-green-800"
                                : order.status === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : order.status === "failed"
                                    ? "bg-red-100 text-red-800"
                                    : order.status === "expired"
                                      ? "bg-orange-100 text-orange-800"
                                      : order.status === "pending_delivery"
                                        ? "bg-amber-100 text-amber-800"
                                        : order.status === "shipped"
                                          ? "bg-blue-100 text-blue-800"
                                          : order.status === "delivered"
                                            ? "bg-purple-100 text-purple-800"
                                            : order.status === "cancelled"
                                              ? "bg-gray-100 text-gray-800"
                                              : "bg-gray-100 text-gray-800"
                            )
                          }`}
                        >
                          {order.isClickCollect ? (
                            // Estados en español para Click & Collect
                            order.status === "pending"
                              ? "⏳ En Preparación"
                              : order.status === "processing"
                                ? "🚚 En Tránsito a Tienda"
                                : order.status === "ready_for_pickup"
                                  ? "✅ Listo para Recoger"
                                  : order.status === "completed"
                                    ? "✅ Completado"
                                    : order.status === "cancelled"
                                      ? "❌ Cancelado"
                                      : order.status
                          ) : (
                            // Estados en español para órdenes regulares
                            order.status === "paid"
                              ? "✅ Pagado"
                              : order.status === "pending"
                                ? "⏳ Pendiente de Pago"
                                : order.status === "failed"
                                  ? "❌ Pago Fallido"
                                  : order.status === "expired"
                                    ? "⏰ Expirado"
                                    : order.status === "pending_delivery"
                                      ? "📦 Preparando Entrega"
                                      : order.status === "shipped"
                                        ? "🚚 Enviado"
                                        : order.status === "delivered"
                                          ? "📦 Entregado"
                                          : order.status === "cancelled"
                                            ? "❌ Cancelado"
                                            : order.status
                          )}
                        </span>
                      </div>

                      {order.paymentMethod && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Método:</span>
                          <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">
                            {order.paymentMethod === "card"
                              ? "💳 Tarjeta"
                              : order.paymentMethod === "oxxo"
                                ? "🏪 OXXO"
                                : order.paymentMethod === "bank_transfer"
                                  ? "🏦 Transferencia"
                                  : order.paymentMethod === "cash_on_delivery"
                                    ? "🚚 Pago Contra Entrega"
                                    : order.paymentMethod === "cash_on_pickup"
                                      ? "🏪 Pago en Tienda"
                                      : order.paymentMethod === "card_on_pickup"
                                        ? "💳 Tarjeta en Tienda"
                                        : order.paymentMethod}
                          </span>
                        </div>
                      )}

                      {order.isClickCollect && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Tipo:</span>
                          <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded">
                            🏪 Click & Collect
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm text-gray-600 mb-1">Total</p>
                      <p className="font-bold text-lg">
                        {formatCurrency(order.totalPrice ?? 0, order.currency)}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="p-4 sm:p-6 rounded-b-lg bg-white border-t">
                    
                    {/* Click & Collect Info */}
                    {order.isClickCollect && (
                      <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                        <h3 className="text-green-800 font-medium mb-2 flex items-center gap-2">
                          🏪 Información de Recogida en Tienda
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-medium text-green-700">Código de Recogida:</p>
                            <p className="font-mono text-lg text-green-800 bg-white px-2 py-1 rounded border">
                              {order.pickupCode}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-green-700">Estado:</p>
                            <span className={`px-2 py-1 rounded text-sm font-medium ${
                              order.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : order.status === "processing"
                                  ? "bg-blue-100 text-blue-800"
                                  : order.status === "ready_for_pickup"
                                    ? "bg-green-100 text-green-800"
                                    : order.status === "completed"
                                      ? "bg-purple-100 text-purple-800"
                                    : order.status === "cancelled"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-gray-100 text-gray-800"
                            }`}>
                              {order.status === "pending"
                                ? "⏳ En Preparación"
                                : order.status === "processing"
                                  ? "🚚 En Tránsito a Tienda"
                                  : order.status === "ready_for_pickup"
                                    ? "✅ Listo para Recoger"
                                    : order.status === "completed"
                                      ? "✅ Completado"
                                    : order.status === "cancelled"
                                      ? "❌ Cancelado"
                                      : order.status}
                            </span>
                          </div>
                        </div>
                        
                        {order.storeInfo && (
                          <div className="mt-3 pt-3 border-t border-green-200">
                            <p className="font-medium text-green-700 mb-1">Tienda:</p>
                            <p className="text-green-800">{order.storeInfo.storeName}</p>
                            <p className="text-green-700 text-sm">{order.storeInfo.storeAddress}</p>
                            {order.storeInfo.storePhone && (
                              <p className="text-green-700 text-sm">📞 {order.storeInfo.storePhone}</p>
                            )}
                          </div>
                        )}

                        {order.estimatedPickupDate && (
                          <div className="mt-3 pt-3 border-t border-green-200">
                            <p className="font-medium text-green-700 mb-1">Fecha Estimada de Recogida:</p>
                            <p className="text-green-800">{order.estimatedPickupDate}</p>
                          </div>
                        )}

                        {order.readyAt && (
                          <div className="mt-3 pt-3 border-t border-green-200">
                            <p className="font-medium text-green-700 mb-1">Listo desde:</p>
                            <p className="text-green-800">
                              {new Date(order.readyAt).toLocaleString('es-MX', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        )}
                        
                        <div className="mt-3 pt-3 border-t border-green-200">
                          <p className="text-green-700 text-sm">
                            💡 <strong>Instrucciones:</strong> Presenta tu código en la tienda para retirar tu pedido.
                          </p>
                        </div>
                      </div>
                    )}
                    {order.status === "pending" &&
                      order.paymentMethod === "oxxo" && (
                        <div className="mb-4">
                          <OxxoPaymentInfo
                            orderNumber={order.orderNumber ?? ""}
                            oxxoReference={order.oxxoReference}
                            expiresAt={
                              order.orderDate
                                ? new Date(
                                    new Date(order.orderDate).getTime() +
                                      2 * 24 * 60 * 60 * 1000
                                  ).toISOString()
                                : undefined
                            }
                          />
                        </div>
                      )}

                    {order.status === "pending" &&
                      order.paymentMethod === "bank_transfer" && (
                        <div className="mb-4">
                          <BankTransferInfo
                            orderNumber={order.orderNumber ?? ""}
                            amount={order.totalPrice ?? 0}
                            currency={order.currency ?? "mxn"}
                            expiresAt={
                              order.orderDate
                                ? new Date(
                                    new Date(order.orderDate).getTime() +
                                      7 * 24 * 60 * 60 * 1000
                                  ).toISOString()
                                : undefined
                            }
                            bankTransferReference={order.bankTransferReference}
                            bankTransferClabe={order.bankTransferClabe}
                            orderId={order._id}
                            paymentIntentId={order.stripePaymentIntentId}
                          />
                        </div>
                      )}

                    {order.paymentMethod === "cash_on_delivery" && (
                      <div className="mb-4">
                        <CashOnDeliveryInfo
                          orderNumber={order.orderNumber ?? ""}
                          totalAmount={order.totalPrice ?? 0}
                          currency={order.currency ?? "mxn"}
                          shippingAddress={order.shippingAddress}
                          codInstructions={order.codInstructions}
                          deliveryNotes={order.deliveryNotes}
                        />
                      </div>
                    )}

                    {order.status === "expired" && (
                      <div className="mb-4 p-3 sm:p-4 bg-orange-50 rounded-lg border border-orange-200">
                        <p className="text-orange-800 font-medium mb-1 text-sm sm:text-base">
                          ⏰ Pago Expirado
                        </p>
                        <p className="text-sm text-orange-700">
                          El tiempo límite para realizar el pago ha vencido.
                          Puedes crear una nueva orden si aún deseas estos
                          productos.
                        </p>
                        {order.expiredAt && (
                          <p className="text-xs text-orange-600 mt-1">
                            Expiró el:{" "}
                            {new Date(order.expiredAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}

                    {order.amountDiscount ? (
                      <div className="mt-1 p-3 sm:p-4 bg-indigo-50 rounded-lg">
                        <p className="text-indigo-500 font-medium mb-1 text-sm sm:text-base">
                          Descuento aplicado:{" "}
                          {formatCurrency(order.amountDiscount, order.currency)}
                        </p>
                        <p className="text-sm text-gray-600">
                          Precio sin descuento:{" "}
                          {formatCurrency(
                            (order.totalPrice ?? 0) + order.amountDiscount,
                            order.currency
                          )}
                        </p>
                      </div>
                    ) : null}

                    <OrderContactInfo
                      customerName={order.customerName || undefined}
                      email={order.email || undefined}
                      phone={order.phone || undefined}
                    />

                    <div className="px-4 py-3 sm:px-6 sm:py-4">
                      <p className="text-sm font-semibold text-gray-600 mb-3 sm:mb-4">
                        Productos
                      </p>
                      <div className="space-y-3 sm:space-y-4">
                        {order.products?.map((product, productIdx: number) => (
                          <div
                            key={product.product?._id || `product-${productIdx}`}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-2 border-b last:border-b-0"
                          >
                            <div className="flex items-center gap-3 sm:gap-4">
                              {product.product?.image && (
                                <div className="relative h-14 w-14 sm:h-16 sm:w-16 flex-shrink-0 rounded-md overflow-hidden">
                                  <Image
                                    src={imageUrl(product.product.image).url()}
                                    alt={product.product.name ?? ""}
                                    className="object-cover"
                                    fill
                                  />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-sm sm:text-base">
                                  {product.product?.name}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Cantidad: {product.quantity ?? "N/A"}
                                </p>
                                {order.isClickCollect && (
                                  <p className="text-xs text-green-600">
                                    🏪 Para recoger en tienda
                                  </p>
                                )}
                              </div>
                            </div>
                            <p className="font-medium text-right">
                              {product.product?.price && product.quantity
                                ? formatCurrency(
                                    product.product.price * product.quantity,
                                    order.currency
                                  )
                                : "N/A"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}

export default Orders;
