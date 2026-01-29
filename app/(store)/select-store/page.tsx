"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeLocationBasedStoreSelector } from "@/components/SafeLocationBasedStoreSelector";
import useBasketStore from "@/store/store";
import { CustomerAddress } from "@/lib/clickCollect";
import { calculateDistance } from '@/lib/clickCollect';
import { ArrowLeft, ShoppingCart } from "lucide-react";
import Loader from "@/components/Loader";

// Tipo para los datos de la tienda seleccionada (debe coincidir con StoreData del componente)
interface StoreData {
  store: {
    _id: string;
    name: string;
    distanceKm?: number;
    address: {
      street: string;
      city: string;
      state: string;
    };
    contact?: {
      phone?: string;
    };
  };
  summary: {
    storeName: string;
    distance: string;
    estimatedDelivery: string;
    address: string;
    phone: string;
  };
}

export default function SelectStorePage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const groupedItems = useBasketStore((state) => state.getGroupedItems());
  
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  // Allow storing optional coordinates along with address
  const [customerAddress, setCustomerAddress] = useState<
    (CustomerAddress & { latitude?: number; longitude?: number }) | null
  >(null);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [isClient, setIsClient] = useState(false);

  // Obtener el ID de la tienda de los productos en el carrito
  const cartStoreId = groupedItems[0]?.product?.affiliateStore && 
    typeof groupedItems[0]?.product?.affiliateStore === 'object' && 
    '_id' in groupedItems[0]?.product?.affiliateStore 
    ? (groupedItems[0]?.product?.affiliateStore as { _id: string })._id 
    : null;
  
  // Debug - verificar estructura completa
  console.log('=== DEBUG SELECT STORE ===');
  console.log('Grouped Items Length:', groupedItems.length);
  console.log('First Item:', groupedItems[0]);
  console.log('First Product:', groupedItems[0]?.product);
  console.log('Affiliate Store:', groupedItems[0]?.product?.affiliateStore);
  console.log('Cart Store ID:', cartStoreId);
  console.log('========================');

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Redirigir si no está autenticado o no hay productos
  useEffect(() => {
    if (isClient && (!isSignedIn || groupedItems.length === 0)) {
      router.push('/basket');
    }
  }, [isClient, isSignedIn, groupedItems.length, router]);

  if (!isClient) {
    return <Loader />;
  }

  if (!isSignedIn || groupedItems.length === 0) {
    return <Loader />;
  }

  const handleStoreSelected = (storeData: StoreData) => {
    setSelectedStore(storeData);
  };

  const handleAddressChange = (address: CustomerAddress) => {
    // Puede venir con coordenadas añadidas por el selector
    setCustomerAddress(address as CustomerAddress & { latitude?: number; longitude?: number });
  };

  const handleProceedToCheckout = () => {
    if (!selectedStore) {
      alert("Por favor selecciona una tienda para continuar");
      return;
    }
    // Preparar payload base
    const payload: any = {
      deliveryMethod,
      storeId: selectedStore.store._id,
      storeName: selectedStore.summary.storeName,
      storeAddress: selectedStore.summary.address,
      storePhone: selectedStore.summary.phone,
      estimatedDelivery: selectedStore.summary.estimatedDelivery,
      customerAddress: customerAddress,
    };

    // Si es entrega a domicilio, requerimos coordenadas del cliente para calcular distancia y coste
    if (deliveryMethod === 'delivery') {
      if (!customerAddress || typeof customerAddress.latitude !== 'number' || typeof customerAddress.longitude !== 'number') {
        // Intentar pedir ubicación al navegador
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const custAddrWithCoords = {
              ...(customerAddress || {}),
              latitude: lat,
              longitude: lng,
            };
            setCustomerAddress(custAddrWithCoords as any);

            // Calcular distancia con la tienda seleccionada
            const storeCoords = (selectedStore.store as any).coordinates;
            let distanceKm = 0;
            if (storeCoords && storeCoords.latitude && storeCoords.longitude) {
              distanceKm = calculateDistance(lat, lng, storeCoords.latitude, storeCoords.longitude);
            }

            // Coste simple por km
            const costPerKm = 6; // MXN por km
            const minCharge = 30; // cargo mínimo
            const shippingCost = Math.max(minCharge, Math.round(distanceKm * costPerKm));

            payload.customerAddress = custAddrWithCoords;
            payload.distanceKm = distanceKm;
            payload.shippingCost = shippingCost;

            localStorage.setItem('clickCollectStore', JSON.stringify(payload));
            router.push('/checkout-click-collect');
          }, (err) => {
            alert('Necesitamos tu ubicación para calcular el costo de entrega. Por favor permite el acceso a la ubicación o selecciona Recoger en tienda.');
          });
          return;
        } else {
          alert('No es posible obtener tu ubicación. Selecciona Recoger en tienda o ingresa tu dirección con coordenadas.');
          return;
        }
      } else {
        // Ya tenemos coordenadas en customerAddress
        const lat = customerAddress.latitude as number;
        const lng = customerAddress.longitude as number;
        const storeCoords = (selectedStore.store as any).coordinates;
        let distanceKm = 0;
        if (storeCoords && storeCoords.latitude && storeCoords.longitude) {
          distanceKm = calculateDistance(lat, lng, storeCoords.latitude, storeCoords.longitude);
        }

        const costPerKm = 6; // MXN por km
        const minCharge = 30;
        const shippingCost = Math.max(minCharge, Math.round(distanceKm * costPerKm));

        payload.distanceKm = distanceKm;
        payload.shippingCost = shippingCost;
      }
    }

    // Guardar información en localStorage y redirigir
    localStorage.setItem('clickCollectStore', JSON.stringify(payload));
    router.push('/checkout-click-collect');
  };

  const subtotal = groupedItems.reduce(
    (sum, item) => sum + (item.product.price ?? 0) * item.quantity,
    0
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl translate-y-[70px]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="outline" 
          onClick={() => router.push('/basket')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al Carrito
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <button
            className={`px-3 py-1 rounded ${deliveryMethod === 'pickup' ? 'bg-blue-600 text-white' : 'border'}`}
            onClick={() => setDeliveryMethod('pickup')}
          >Recoger en tienda</button>
          <button
            className={`px-3 py-1 rounded ${deliveryMethod === 'delivery' ? 'bg-blue-600 text-white' : 'border'}`}
            onClick={() => setDeliveryMethod('delivery')}
          >Entrega a domicilio</button>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Seleccionar Tienda para Recogida</h1>
          <p className="text-gray-600">Elige la tienda más cercana donde recogerás tu pedido</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selector de tienda */}
        <div className="lg:col-span-2">
          {cartStoreId ? (
            <Card>
              <CardHeader>
                <CardTitle>Tienda de Recogida</CardTitle>
                <CardDescription>
                  Los productos en tu carrito pertenecen a esta tienda
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SafeLocationBasedStoreSelector 
                  onStoreSelected={handleStoreSelected}
                  onAddressChange={handleAddressChange}
                  apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
                  filterStoreId={cartStoreId}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">Error</CardTitle>
              </CardHeader>
              <CardContent>
                <p>No se pudo identificar la tienda de los productos</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Resumen del pedido */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Resumen del Pedido
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Productos */}
              <div className="space-y-2">
                {groupedItems.map((item) => (
                  <div key={item.product._id} className="flex justify-between text-sm">
                    <span className="truncate">{item.product.name} x{item.quantity}</span>
                    <span>${((item.product.price ?? 0) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-2">
                <div className="flex justify-between font-semibold">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)} MXN</span>
                </div>
                <div className="flex justify-between text-sm text-green-600">
                  <span>Envío:</span>
                  <span>GRATIS</span>
                </div>
              </div>

              {/* Información de tienda seleccionada */}
              {selectedStore && (
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <h4 className="font-medium text-green-800 text-sm mb-1">
                  Tienda Seleccionada:
                  </h4>
                  <p className="text-sm text-green-700">{selectedStore.summary.storeName}</p>
                  <p className="text-xs text-green-600">
                    Listo: {selectedStore.summary.estimatedDelivery}
                  </p>
                </div>
              )}

              {/* Botón continuar */}
              <Button
                onClick={handleProceedToCheckout}
                disabled={!selectedStore}
                className="w-full"
                size="lg"
              >
                Continuar al Pago
              </Button>

              {!selectedStore && (
                <p className="text-sm text-amber-600 text-center">
                  ⚠️ Selecciona una tienda para continuar
                </p>
              )}
            </CardContent>
          </Card>

          {/* Información adicional */}
          <Card>
            <CardContent className="p-4">
              <h4 className="font-medium text-sm mb-2">💡 Click & Collect</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Envío gratuito a la tienda</li>
                <li>• Notificación cuando esté listo</li>
                <li>• Código de recogida único</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}