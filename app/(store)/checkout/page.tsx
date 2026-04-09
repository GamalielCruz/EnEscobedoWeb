"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import type { Metadata } from "@/actions/createCheckoutSession";
import useBasketStore from "@/store/store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, CreditCard, MapPin, Loader2 } from "lucide-react";
import Loader from "@/components/Loader";

interface ClickCollectStore {
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  estimatedDelivery: string;
  customerAddress: any;
}

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const groupedItems = useBasketStore((state) => state.getGroupedItems());

  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clickCollectStore, setClickCollectStore] =
    useState<ClickCollectStore | null>(null);

  const isClickCollectMode = searchParams.get("mode") === "click_collect";

  useEffect(() => {
    setIsClient(true);

    // Si es modo Click & Collect, cargar datos de la tienda
    if (isClickCollectMode) {
      const storeData = localStorage.getItem("clickCollectStore");
      if (storeData) {
        setClickCollectStore(JSON.parse(storeData));
      } else {
        // Si no hay datos de tienda, redirigir a selección
        router.push("/select-store");
      }
    }
  }, [isClickCollectMode, router]);

  // Redirigir si no está autenticado o no hay productos
  useEffect(() => {
    if (isClient && (!isSignedIn || groupedItems.length === 0)) {
      router.push("/basket");
    }
  }, [isClient, isSignedIn, groupedItems.length, router]);

  if (!isClient) {
    return <Loader />;
  }

  if (!isSignedIn || groupedItems.length === 0) {
    return <Loader />;
  }

  const subtotal = groupedItems.reduce(
    (sum, item) => sum + (item.product.price ?? 0) * item.quantity,
    0
  );

  const handleCheckout = async () => {
    if (!user) return;

    setLoading(true);

    try {
      const metadata: Metadata = {
        orderNumber: crypto.randomUUID(),
        customerName: user.fullName ?? "Unknown",
        customerEmail: user.emailAddresses[0].emailAddress ?? "Unknown",
        clerkUserId: user.id,
      };

      // Si es Click & Collect, agregar metadata adicional
      if (isClickCollectMode && clickCollectStore) {
        metadata.deliveryMethod = "click_collect";
        metadata.pickupStoreId = clickCollectStore.storeId;
        metadata.pickupStoreName = clickCollectStore.storeName;
        metadata.customerAddress = JSON.stringify(clickCollectStore.customerAddress);
      }

      const response = await fetch("/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: groupedItems, metadata }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("Error en /api/checkout-session", data);
        throw new Error(data?.error || "Error al crear la sesión de checkout");
      }

      if (data?.url) {
        if (isClickCollectMode) {
          localStorage.removeItem("clickCollectStore");
        }
        window.location.href = data.url;
      } else {
        throw new Error("No se recibió URL de checkout");
      }
    } catch (error) {
      console.error("Error al crear la sesión de checkout", error);
      alert("Error al procesar el pago. Por favor intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          onClick={() =>
            router.push(isClickCollectMode ? "/select-store" : "/basket")
          }
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {isClickCollectMode
              ? "Pagar - Click & Collect"
              : "Finalizar Compra"}
          </h1>
          <p className="text-gray-600">
            {isClickCollectMode
              ? "Paga tu pedido y recógelo en la tienda seleccionada"
              : "Completa tu compra de forma segura"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Información del pedido */}
        <div className="space-y-6">
          {/* Método de entrega */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isClickCollectMode ? (
                  <>
                    <MapPin className="h-5 w-5 text-blue-500" />
                    Click & Collect
                  </>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5" />
                    Pago Online
                  </>
                )}
              </CardTitle>
              <CardDescription>
                {isClickCollectMode
                  ? "Recogerás tu pedido en la tienda seleccionada"
                  : "Pago seguro con múltiples opciones"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isClickCollectMode && clickCollectStore ? (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-800 mb-2">
                    Tienda de Recogida:
                  </h4>
                  <p className="text-blue-700 font-medium">
                    {clickCollectStore.storeName}
                  </p>
                  <p className="text-blue-600 text-sm">
                    {clickCollectStore.storeAddress}
                  </p>
                  <p className="text-blue-600 text-sm">
                    📞 {clickCollectStore.storePhone}
                  </p>
                  <p className="text-blue-600 text-sm mt-2">
                    <strong>Listo para recoger:</strong>{" "}
                    {clickCollectStore.estimatedDelivery}
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 text-sm">
                    Acepta tarjetas de crédito/débito, OXXO y transferencias
                    bancarias SPEI.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Productos */}
          <Card>
            <CardHeader>
              <CardTitle>Productos ({groupedItems.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {groupedItems.map((item) => (
                  <div
                    key={item.product._id}
                    className="flex justify-between items-center"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.product.name}</p>
                      <p className="text-xs text-gray-500">
                        Cantidad: {item.quantity}
                      </p>
                    </div>
                    <p className="font-medium">
                      ${((item.product.price ?? 0) * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resumen y pago */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumen del Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Envío:</span>
                  <span className={isClickCollectMode ? "text-green-600" : ""}>
                    {isClickCollectMode ? "GRATIS" : "Se calcula en checkout"}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span>${subtotal.toFixed(2)} MXN</span>
                </div>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  `Pagar ${subtotal.toFixed(2)} MXN`
                )}
              </Button>

              <div className="text-xs text-gray-500 text-center">
                Serás redirigido a Stripe para completar el pago de forma segura
              </div>
            </CardContent>
          </Card>

          {isClickCollectMode && (
            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium text-sm mb-2">🎯 Próximos pasos:</h4>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>1. Completa el pago con Stripe</li>
                  <li>2. Recibirás confirmación por email</li>
                  <li>3. Te notificaremos cuando esté listo</li>
                  <li>4. Recoge con tu código único</li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
