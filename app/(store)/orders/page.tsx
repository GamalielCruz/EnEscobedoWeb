import { formatCurrency } from "@/lib/formatCurrency";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import { getMyOrders } from "@/sanity/lib/orders/getMyOrders";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { 
  Bell, 
  ChefHat, 
  Truck, 
  ShoppingBag, 
  CheckCircle, 
  Clock, 
  Package
} from "lucide-react";

import { OxxoPaymentInfo } from "@/components/OxxoPaymentInfo";
import { BankTransferInfo } from "@/components/BankTransferInfo";
import { CashOnDeliveryInfo } from "@/components/CashOnDeliveryInfo";
import { OrdersRefresh } from "@/components/OrdersRefresh";
import { RefreshOrdersButton } from "@/components/RefreshOrdersButton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

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

// Helper para determinar el paso actual del stepper
const getOrderStep = (status: string | undefined, isClickCollect: boolean | undefined) => {
  if (!status) return 0;
  
  // 1: Recibido, 2: Preparando, 3: En Camino/Listo, 4: Completado
  
  // Mapeo unificado para evitar confusiones
  const stepMap: Record<string, number> = {
    // Paso 1: Recibido / Pagado / Pendiente de proceso
    'pending': 1,
    'paid': 1,
    'pending_delivery': 1,
    'pending_pickup': 1,
    
    // Paso 2: Preparando
    'processing': 2,
    
    // Paso 3: Listo / En camino
    'ready_for_pickup': 3,
    'shipped': 3,
    
    // Paso 4: Finalizado
    'completed': 4,
    'delivered': 4,
    'picked_up': 4,
  };

  return stepMap[status] || 0;
};

const OrderStepper = ({ status, isClickCollect }: { status: string | undefined, isClickCollect: boolean | undefined }) => {
  const currentStep = getOrderStep(status, isClickCollect);
  
  const steps = [
    { id: 1, label: "Recibido", icon: Bell },
    { id: 2, label: "Preparando", icon: ChefHat },
    { id: 3, label: isClickCollect ? "Listo para Recoger" : "En Camino", icon: isClickCollect ? ShoppingBag : Truck },
    { id: 4, label: "Completado", icon: CheckCircle },
  ];

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between relative">
        {/* Linea de progreso de fondo */}
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-200 z-0"></div>
        {/* Linea de progreso activa */}
        <div 
          className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-[#ff8800] transition-all duration-500 z-0"
          style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
        ></div>

        {steps.map((step) => {
          const isActive = step.id <= currentStep;
          const isCurrent = step.id === currentStep;
          
          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center">
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isActive 
                    ? "bg-[#ff8800] border-[#ff8800] text-white shadow-lg scale-110" 
                    : "bg-white border-gray-300 text-gray-400"
                }`}
              >
                <step.icon className={`w-5 h-5 ${isCurrent ? "animate-pulse" : ""}`} />
              </div>
              <p className={`text-xs mt-2 font-medium ${isActive ? "text-[#ff8800]" : "text-gray-400"}`}>
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
  return (
    <Card className="border-l-4 border-l-[#ff8800] shadow-md overflow-hidden">
      <CardHeader className="bg-gray-50/50 pb-4">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Orden #{order.orderNumber}</p>
            <h3 className="text-xl font-bold text-gray-900 mt-1">
              {formatCurrency(order.totalPrice ?? 0, order.currency)}
            </h3>
            {order.isClickCollect && (
              <Badge variant="outline" className="mt-2 bg-green-50 text-green-700 border-green-200">
                🏪 Click & Collect
              </Badge>
            )}
          </div>
          <div className="text-right">
             <p className="text-sm text-gray-500">
               {new Date(order.orderDate ?? order.createdAt ?? "").toLocaleDateString("en-GB")}
             </p>
             <p className="text-sm text-gray-500">
               {new Date(order.orderDate ?? order.createdAt ?? "").toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit', hour12: false })}
             </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-6">
        <OrderStepper status={order.status} isClickCollect={order.isClickCollect} />
        
        {/* Detalles específicos del estado e instrucciones */}
        <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-100">
          
          {/* Instrucciones de Click & Collect */}
          {order.isClickCollect && order.status === 'ready_for_pickup' && (
            <div className="mb-6 text-center border-b pb-6">
               <p className="text-green-700 font-bold text-lg mb-2">¡Tu pedido está listo!</p>
               <div className="bg-white p-3 rounded border border-dashed border-green-300 inline-block shadow-sm">
                 <p className="text-xs text-gray-500 mb-1 tracking-widest uppercase">Código de Recogida</p>
                 <p className="text-3xl font-mono font-bold text-gray-900 tracking-widest">{order.pickupCode}</p>
               </div>
               <p className="text-sm text-gray-600 mt-3">
                 Presenta este código en <strong>{order.storeInfo?.storeName}</strong>
               </p>
            </div>
          )}

          {/* Información de Pagos Pendientes */}
          {order.status === "pending" && (
            <>
                {order.paymentMethod === "oxxo" && (
                    <div className="mb-6 border-b pb-6">
                        <OxxoPaymentInfo
                        orderNumber={order.orderNumber ?? ""}
                        oxxoReference={order.oxxoReference}
                        expiresAt={order.orderDate ? new Date(new Date(order.orderDate).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() : undefined}
                        />
                    </div>
                )}
                {order.paymentMethod === "bank_transfer" && (
                    <div className="mb-6 border-b pb-6">
                        <BankTransferInfo
                            orderNumber={order.orderNumber ?? ""}
                            amount={order.totalPrice ?? 0}
                            currency={order.currency ?? "mxn"}
                            expiresAt={order.orderDate ? new Date(new Date(order.orderDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined}
                            bankTransferReference={order.bankTransferReference}
                            bankTransferClabe={order.bankTransferClabe}
                            orderId={order._id}
                            paymentIntentId={order.stripePaymentIntentId}
                        />
                    </div>
                )}
            </>
          )}

           {order.paymentMethod === "cash_on_delivery" && (
              <div className="mb-6 border-b pb-6">
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

          {/* Lista de productos (resumida) */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                Resumen del pedido
            </p>
            <ul className="space-y-3">
              {order.products?.map((item, idx) => (
                <li key={idx} className="flex justify-between items-center text-sm text-gray-600 bg-white p-2 rounded border border-gray-100">
                   <div className="flex items-center gap-3">
                        {item.product?.image && (
                            <div className="relative w-10 h-10 rounded overflow-hidden bg-gray-100 shrink-0">
                                <Image 
                                    src={imageUrl(item.product.image).url()} 
                                    alt={item.product?.name ?? "Producto"} 
                                    fill 
                                    className="object-cover"
                                />
                            </div>
                        )}
                        <div>
                            <span className="font-medium text-gray-900">{item.quantity}x</span> {item.product?.name}
                        </div>
                   </div>
                   <span className="font-medium">
                     {item.product?.price ? formatCurrency(item.product.price * (item.quantity ?? 1), order.currency) : '-'}
                   </span>
                </li>
              ))}
            </ul>
            {order.amountDiscount ? (
                <div className="mt-3 text-right">
                    <p className="text-sm text-green-600 font-medium">Ahórraste: {formatCurrency(order.amountDiscount, order.currency)}</p>
                </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const PastOrderCard = ({ order }: { order: ExtendedOrder }) => {
  const isCancelled = order.status === 'cancelled' || order.status === 'failed' || order.status === 'expired';
  
  return (
    <div className="bg-white border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-4">
        <div className={`mt-1 w-3 h-3 rounded-full ${isCancelled ? 'bg-red-500' : 'bg-green-500'} shrink-0`} />
        <div>
          <div className="font-medium text-gray-900 flex items-center gap-2">
            Orden #{order.orderNumber}
            {order.isClickCollect && <Badge variant="outline" className="text-[10px] h-5">Click & Collect</Badge>}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(order.orderDate ?? order.createdAt ?? "").toLocaleDateString("en-GB").split('/').join('/')} • {order.products?.length} productos
          </p>
          <Badge variant="secondary" className={`mt-2 text-xs font-normal ${isCancelled ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
              {isCancelled ? (order.status === 'cancelled' ? 'Cancelado' : 'Fallido/Expirado') : (order.status === 'completed' ? 'Completado' : order.status === 'picked_up' ? 'Recogido' : 'Entregado')}
          </Badge>
        </div>
      </div>
      <div className="text-right sm:text-right">
        <p className="font-bold text-gray-900 text-lg">{formatCurrency(order.totalPrice ?? 0, order.currency)}</p>
        <span className="text-xs text-gray-400 uppercase tracking-wide">Total</span>
      </div>
    </div>
  );
};

async function Orders() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const orders = await getMyOrders(userId) as ExtendedOrder[];
  
  // Filtrar órdenes activas vs historial
  // Activas: pending, paid, processing, pending_delivery, shipped, ready_for_pickup
  // Historial: delivered, completed, cancelled, failed, expired
  const activeStatuses = ['pending', 'paid', 'processing', 'pending_delivery', 'shipped', 'ready_for_pickup'];
  
  const activeOrders = orders.filter(o => activeStatuses.includes(o.status || ''));
  const pastOrders = orders.filter(o => !activeStatuses.includes(o.status || ''));

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-50 p-4 pt-4 sm:pt-8">
      <OrdersRefresh userId={userId} />
      
      <div className="w-full max-w-3xl space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-2 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Mis Pedidos</h1>
            <p className="text-gray-500 mt-1 text-sm">Sigue el estado de tus compras en tiempo real</p>
          </div>
          <RefreshOrdersButton />
        </div>

        {/* Sección de Pedidos Activos */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Package className="w-5 h-5 text-[#ff8800]" />
            <h2 className="text-lg font-semibold text-gray-800">
                Pedidos en Curso
            </h2>
          </div>
          
          {activeOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
               <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
               <p className="text-gray-500 font-medium">No tienes pedidos en curso.</p>
               <p className="text-sm text-gray-400">¡Es un buen momento para ordenar algo delicioso!</p>
            </div>
          ) : (
            <div className="space-y-8">
              {activeOrders.map((order) => (
                <ActiveOrderCard key={order._id} order={order} />
              ))}
            </div>
          )}
        </div>

        {/* Sección de Historial */}
        {pastOrders.length > 0 && (
          <div className="space-y-4 pt-8">
            <div className="flex items-center gap-2 pb-2 border-b">
                <Clock className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-600">
                Historial
                </h2>
            </div>
            <div className="space-y-3">
              {pastOrders.map((order) => (
                <PastOrderCard key={order._id} order={order} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Orders;
