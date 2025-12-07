"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, MapPin, Clock, Phone, Copy, Calendar, Loader2 } from "lucide-react";
import Link from "next/link";

interface OrderData {
  orderNumber: string;
  pickupCode: string;
  customerName: string;
  storeInfo?: {
    storeName: string;
    storeAddress: string;
    storePhone: string;
  };
  estimatedPickupDate?: string;
  total: number;
}

export default function SuccessClickCollectPage() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("orderNumber");
  const pickupCodeFromUrl = searchParams.get("pickupCode");
  
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Obtener datos reales de la orden si es posible
  useEffect(() => {
    const fetchOrderData = async () => {
      if (!orderNumber) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/click-collect-orders?orderNumber=${orderNumber}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data.orders && result.data.orders.length > 0) {
            const order = result.data.orders[0];
            setOrderData({
              orderNumber: order.orderNumber,
              pickupCode: order.pickupCode,
              customerName: order.customerInfo?.name || 'Cliente',
              storeInfo: order.storeInfo ? {
                storeName: order.storeInfo.storeName,
                storeAddress: order.storeInfo.storeAddress,
                storePhone: order.storeInfo.storePhone
              } : undefined,
              estimatedPickupDate: order.estimatedPickupDate,
              total: order.totalAmount || 0
            });
          }
        }
      } catch (error) {
        console.error('Error fetching order data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderData();
  }, [orderNumber]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Código copiado al portapapeles");
  };

  // Usar datos reales si están disponibles, sino usar datos de la URL o mock
  const pickupCode = orderData?.pickupCode || pickupCodeFromUrl || (orderNumber ? orderNumber.slice(-6).toUpperCase() : "ABC123");
  const displayOrderNumber = orderData?.orderNumber || orderNumber || "CC-" + Date.now();
  const customerName = orderData?.customerName || "Cliente";
  const total = orderData?.total || 299.99;

  // Datos de la tienda (usar datos reales si están disponibles)
  const storeData = orderData?.storeInfo || {
    storeName: "Miscelanea Erika",
    storeAddress: "5 de febrero #64, Pedro Escobedo, Querétaro",
    storePhone: "+52 442 123 4567"
  };

  const pickupInstructions = [
    "Presenta tu código de recogida: " + pickupCode,
    "Lleva una identificación oficial",
    "Horarios: Lunes a Viernes 9:00 - 18:00, Sábado 9:00 - 15:00",
    "Teléfono de la tienda: " + storeData.storePhone,
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl translate-y-[70px]">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Cargando información de tu pedido...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl translate-y-[70px]">
      {/* Header de éxito */}
      <div className="text-center mb-8">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-green-800 mb-2">
          ¡Pedido Confirmado!
        </h1>
        <p className="text-lg text-gray-600">
          Tu pedido será enviado a la tienda más cercana para que lo recojas
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Información del pedido */}
        <Card>
          <CardHeader>
            <CardTitle>Detalles del Pedido</CardTitle>
            <CardDescription>Información de tu compra</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Número de Orden:</span>
                <p className="text-gray-600">{displayOrderNumber}</p>
              </div>
              <div>
                <span className="font-medium">Cliente:</span>
                <p className="text-gray-600">{customerName}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Productos:</h4>
              <div className="flex justify-between text-sm py-1">
                <span>Productos del carrito</span>
                <span>Ver detalles en "Mis Pedidos"</span>
              </div>
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>Total:</span>
                <span>${total.toFixed(2)} MXN</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Código de recogida */}
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800">Código de Recogida</CardTitle>
            <CardDescription>Presenta este código en la tienda</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="bg-white p-6 rounded-lg border-2 border-green-300 mb-4">
                <div className="text-3xl font-mono font-bold text-green-800 tracking-wider">
                  {pickupCode}
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => copyToClipboard(pickupCode || "")}
                className="w-full"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar Código
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Información de la tienda */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Tienda de Recogida
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold text-lg">{storeData.storeName}</h4>
              <p className="text-gray-600">{storeData.storeAddress}</p>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-gray-500" />
              <span>{storeData.storePhone}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span>Tienda: {storeData.storeName}</span>
            </div>
          </CardContent>
        </Card>

        {/* Fecha estimada y instrucciones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Fecha de Recogida
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="font-semibold text-blue-800 mb-1">
                Fecha Estimada:
              </div>
              <div className="text-blue-700 text-lg">
                {orderData?.estimatedPickupDate || "mañana por la tarde"}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Instrucciones de Recogida:</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                {pickupInstructions.map((instruction, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-green-500 mt-1">•</span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notificaciones */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>¿Qué sigue?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="font-semibold text-blue-800 mb-1">1. Procesamiento</div>
              <div className="text-blue-600">Tu pedido está siendo preparado</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="font-semibold text-yellow-800 mb-1">2. Envío a Tienda</div>
              <div className="text-yellow-600">Se enviará a la tienda seleccionada</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="font-semibold text-green-800 mb-1">3. Notificación</div>
              <div className="text-green-600">Te avisaremos cuando esté listo</div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-800 mb-2">📱 Sistema de Notificaciones Automáticas</h4>
            <div className="text-blue-700 text-sm space-y-1 mb-3">
              <p>🔄 Te notificaremos <strong>automáticamente</strong> cuando tu pedido llegue a la tienda</p>
              <p>📧 Recibirás <strong>un WhatsApp</strong> con el código de recogida</p>
            </div>
            <div className="flex gap-3">
              <Button asChild variant="outline">
                <Link href="/">Seguir Comprando</Link>
              </Button>
              <Button asChild>
                <Link href="/orders">Ver Mis Pedidos</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}