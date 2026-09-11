"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useBasketStore from "@/store/store";
import { useUser } from "@clerk/nextjs";
import { formatCurrency } from "@/lib/formatCurrency";
import { CustomerAddress } from "@/lib/clickCollect";
import { calculateOrderTotal, PLATFORM_SERVICE_FEE_MXN } from "@/lib/platform-service-fee";
import {
  Store,
  MapPin,
  DollarSign,
  Clock,
  Phone,
  CheckCircle,
} from "lucide-react";

interface StoreInfo {
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  estimatedDelivery: string;
  customerAddress?: CustomerAddress;
}

function ClickCollectCheckout() {
  const router = useRouter();
  const { user } = useUser();
  const { items, getTotalPrice, clearBasket } = useBasketStore();
  const [isLoading, setIsLoading] = useState(false);
  const [platformServiceFee, setPlatformServiceFee] = useState(PLATFORM_SERVICE_FEE_MXN);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [formData, setFormData] = useState({
    phone: "",
    notes: "",
  });

  // DEBUG: Log forzado al inicio
  console.log("🔥 ClickCollectCheckout COMPONENT MOUNTED!");
  console.log("🔥 Current items from store:", items);
  console.log("🔥 Items length:", items.length);
  
  // DEBUG: Log items cuando se carga el componente
  console.log("[ClickCollectCheckout] Component loaded - Items:", items);
  console.log("[ClickCollectCheckout] Component loaded - Items length:", items.length);

  const storeId = (items[0]?.product?.affiliateStore as any)?._ref || (items[0]?.product?.affiliateStore as any)?._id;
  useEffect(() => {
    if (!storeId) return;
    fetch(`/api/store-service-types?storeId=${storeId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setPlatformServiceFee(Number(data?.commercial?.serviceFee ?? PLATFORM_SERVICE_FEE_MXN)))
      .catch(() => {});
  }, [storeId]);
  const subtotal = getTotalPrice();
  const shippingCost = 0; // Siempre gratis para Click & Collect
  const total = calculateOrderTotal({ productsSubtotal: subtotal, shippingFee: shippingCost, platformServiceFee });

  // Cargar información de la tienda desde localStorage
  useEffect(() => {
    const savedStoreInfo = localStorage.getItem("clickCollectStore");
    if (savedStoreInfo) {
      setStoreInfo(JSON.parse(savedStoreInfo));
    } else {
      // Si no hay tienda seleccionada, redirigir a selección
      router.push("/select-store");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // DEBUG: Checkpoint antes de enviar
    console.log("🔥 CHECKPOINT handleSubmit - Items count:", items.length);
    console.log("🔥 CHECKPOINT handleSubmit - Items:", items);

    if (!user) {
      alert("Debes iniciar sesión para continuar");
      return;
    }

    if (items.length === 0) {
      alert("Tu carrito está vacío");
      return;
    }

    if (!storeInfo) {
      alert("No se ha seleccionado una tienda");
      return;
    }

    setIsLoading(true);

    // DEBUG: Verificar items antes de enviar
    console.log("[ClickCollectCheckout] About to submit - Items count:", items.length);
    console.log("[ClickCollectCheckout] About to submit - Items:", items);

    try {
      const orderNumber = crypto.randomUUID();

      // DEBUG: Log items with customizations before sending
      console.log("[ClickCollectCheckout] Items to send:", items.map(item => ({
        productId: item.product._id,
        productName: item.product.name,
        quantity: item.quantity,
        customizations: item.customizations,
        customPrice: item.customPrice,
      })));

      // Crear orden Click & Collect
      const response = await fetch("/api/create-click-collect-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderNumber,
          customerName: user.fullName || user.firstName || "Cliente",
          customerEmail: user.emailAddresses[0]?.emailAddress || "",
          clerkUserId: user.id,
          phone: formData.phone,
          notes: formData.notes,
          storeId: storeInfo.storeId,
          storeName: storeInfo.storeName,
          storeAddress: storeInfo.storeAddress,
          storePhone: storeInfo.storePhone,
          estimatedDelivery: storeInfo.estimatedDelivery,
          items: items.map((item) => ({
            product: item.product,
            quantity: item.quantity,
            customizations: item.customizations,
            notes: item.notes,
            allergies: item.allergies,
            customPrice: item.customPrice,
          })),
          total: total,
          paymentMethod: "cash_on_pickup", // Pago contraentrega en tienda
        }),
      });

      const result = await response.json();
      
      // DEBUG: Log API response
      console.log("[ClickCollectCheckout] API response:", result);

      if (result.success) {
        // Solo limpiar el carrito si la orden se creó exitosamente
        console.log("[ClickCollectCheckout] Order successful, clearing basket");
        clearBasket();
        localStorage.removeItem("clickCollectStore"); // Limpiar información de tienda

        // Incluir el pickupCode real de la API en la URL
        const pickupCode = result.data?.pickupCode || "";
        router.push(
          `/success-click-collect?orderNumber=${orderNumber}&pickupCode=${pickupCode}`
        );
      } else {
        throw new Error(result.error || "Error al crear la orden");
      }
    } catch (error) {
      console.error("Error creating Click & Collect order:", error);
      alert("Error al crear la orden. Por favor intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Tu carrito está vacío</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
        >
          Continuar Comprando
        </button>
      </div>
    );
  }

  if (!storeInfo) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Cargando información de la tienda...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Store Information */}
      <div className="bg-green-50 rounded-lg shadow-md p-6 border border-green-200">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-green-800">
          <Store className="w-5 h-5" />
          Tienda Seleccionada
        </h2>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">
                {storeInfo.storeName}
              </p>
              <p className="text-sm text-green-700">{storeInfo.storeAddress}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-green-600" />
            <p className="text-sm text-green-700">{storeInfo.storePhone}</p>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-green-600" />
            <p className="text-sm text-green-700">
              Listo para recoger:{" "}
              <span className="font-medium">{storeInfo.estimatedDelivery}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-white rounded border border-green-200">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">Envío Gratuito a la Tienda</span>
          </div>
          <p className="text-sm text-green-700 mt-1">
            Tu pedido será enviado sin costo a la tienda seleccionada
          </p>
        </div>
      </div>

      {/* Order Summary */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Resumen de la Orden
        </h2>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal ({items.length} productos):</span>
            <span>{formatCurrency(subtotal, "mxn")}</span>
          </div>
          <div className="flex justify-between">
            <span>Envío a tienda:</span>
            <span className="text-green-600 font-medium">¡Gratis!</span>
          </div>
          <div className="flex justify-between">
            <span>Tarifa de servicio:</span>
            <span>{formatCurrency(platformServiceFee, "mxn")}</span>
          </div>
          <div className="border-t pt-2 flex justify-between font-bold text-lg">
            <span>Total a pagar en tienda:</span>
            <span className="text-green-600">
              {formatCurrency(total, "mxn")}
            </span>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-center gap-2 text-amber-800">
            <Store className="w-4 h-4" />
            <span className="font-medium">Pago en Tienda</span>
          </div>
          <p className="text-sm text-amber-700 mt-1">
            Pagarás en efectivo cuando recojas tu pedido en la tienda
          </p>
        </div>
      </div>

      {/* Customer Information Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-md p-6"
      >
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Phone className="w-5 h-5" />
          Información de Contacto
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono de contacto *
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+52 442 123 4567"
            />
            <p className="text-xs text-gray-500 mt-1">
              Te contactaremos cuando tu pedido esté listo para recoger
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas adicionales (opcional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Instrucciones especiales, horario preferido para recoger, etc."
            />
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-medium text-blue-900 mb-2">
            Instrucciones para la recogida:
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Ten el monto exacto listo: {formatCurrency(total, "mxn")}</li>
            <li>
              • Menciona tu código de orden: Se generará después de confirmar
            </li>
            <li>• Verifica los productos antes de pagar</li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={isLoading || !formData.phone.trim()}
          className="w-full mt-6 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            "Creando orden..."
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              Confirmar Orden Click & Collect
            </>
          )}
        </button>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => router.push("/select-store")}
            className="text-blue-600 hover:text-blue-800 text-sm underline"
          >
            Cambiar tienda seleccionada
          </button>
        </div>
      </form>
    </div>
  );
}

export default ClickCollectCheckout;
