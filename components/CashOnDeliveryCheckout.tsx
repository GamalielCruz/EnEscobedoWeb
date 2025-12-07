"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useBasketStore from "@/store/store";
import { useUser } from "@clerk/nextjs";
import { createCashOnDeliveryOrder } from "@/actions/createCashOnDeliveryOrder";
import { formatCurrency } from "@/lib/formatCurrency";
import { Truck, MapPin, DollarSign } from "lucide-react";

function CashOnDeliveryCheckout() {
  const router = useRouter();
  const { user } = useUser();
  const { items, getTotalPrice, clearBasket } = useBasketStore();
  const [isLoading, setIsLoading] = useState(false);
  const [shippingCalculated, setShippingCalculated] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [formData, setFormData] = useState({
    phone: "",
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "MX",
    },
  });

  const subtotal = getTotalPrice();
  const [shippingCost, setShippingCost] = useState(0);
  const total = subtotal + shippingCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert("Debes iniciar sesión para continuar");
      return;
    }

    if (items.length === 0) {
      alert("Tu carrito está vacío");
      return;
    }

    if (!shippingCalculated) {
      alert("Por favor calcula tu envío antes de continuar");
      return;
    }

    if (shippingError) {
      alert("No podemos procesar tu orden debido a restricciones de envío");
      return;
    }

    setIsLoading(true);

    try {
      const orderNumber = crypto.randomUUID();

      const result = await createCashOnDeliveryOrder(
        items.map((item) => ({
          product: item.product,
          quantity: item.quantity,
        })),
        {
          orderNumber,
          customerName: user.fullName || user.firstName || "Cliente",
          customerEmail: user.emailAddresses[0]?.emailAddress || "",
          clerkUserId: user.id,
          phone: formData.phone,
          shippingAddress: formData.address,
        },
        shippingCost
      );

      if (result.success) {
        clearBasket();
        router.push(`/success-cod?orderNumber=${orderNumber}`);
      }
    } catch (error) {
      console.error("Error creating COD order:", error);
      alert("Error al crear la orden. Por favor intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const calculateShipping = () => {
    const state = formData.address.state.toLowerCase().trim();
    const city = formData.address.city.toLowerCase().trim();

    // Reset previous calculations
    setShippingError("");
    setShippingCalculated(false);
    setShippingCost(0);

    // Check if state is Querétaro
    if (state !== "queretaro" && state !== "querétaro") {
      setShippingError("Pago contra entrega no disponible en tu estado");
      return;
    }

    // Free shipping cities (Pedro Escobedo, El Marqués)
    const freeCities = ["pedro escobedo", "el marques", "el marqués"];
    if (freeCities.includes(city)) {
      setShippingCost(0);
      setShippingCalculated(true);
      return;
    }

    // Restricted cities (Santiago de Querétaro, San Juan del Río, etc.)
    const restrictedCities = [
      "santiago de queretaro",
      "santiago de querétaro",
      "queretaro",
      "querétaro",
      "san juan del rio",
      "san juan del río",
    ];

    if (restrictedCities.includes(city)) {
      setShippingError("Pago contra entrega no disponible en tu ciudad");
      return;
    }

    // If we reach here, it's an unknown city in Querétaro
    setShippingError("Pago contra entrega no disponible en tu ciudad");
  };

  const handleInputChange = (field: string, value: string) => {
    // Reset shipping calculation when address changes
    if (field.startsWith("address.")) {
      setShippingCalculated(false);
      setShippingError("");
      setShippingCost(0);

      const addressField = field.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    }
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

  return (
    <div className="space-y-6">
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
            <span>Envío:</span>
            <span>
              {shippingCalculated ? (
                shippingCost === 0 ? (
                  <span className="text-green-600 font-medium">¡Gratis!</span>
                ) : (
                  formatCurrency(shippingCost, "mxn")
                )
              ) : (
                <span className="text-gray-500">Calcular envío</span>
              )}
            </span>
          </div>
          <div className="border-t pt-2 flex justify-between font-bold text-lg">
            <span>Total a pagar en efectivo:</span>
            <span className="text-green-600">
              {shippingCalculated
                ? formatCurrency(total, "mxn")
                : "Calcular envío"}
            </span>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-center gap-2 text-amber-800">
            <Truck className="w-4 h-4" />
            <span className="font-medium">Pago Contra Entrega</span>
          </div>
          <p className="text-sm text-amber-700 mt-1">
            Pagarás en efectivo cuando recibas tu pedido
          </p>
        </div>
      </div>

      {/* Shipping Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-md p-6"
      >
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Información de Entrega
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono *
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+52 55 1234 5678"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dirección *
            </label>
            <input
              type="text"
              required
              value={formData.address.line1}
              onChange={(e) =>
                handleInputChange("address.line1", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Calle y número"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dirección adicional (opcional)
            </label>
            <input
              type="text"
              value={formData.address.line2}
              onChange={(e) =>
                handleInputChange("address.line2", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Colonia, referencias"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ciudad *
              </label>
              {formData.address.state === "Querétaro" ? (
                <select
                  required
                  value={formData.address.city}
                  onChange={(e) =>
                    handleInputChange("address.city", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecciona una ciudad</option>
                  <option value="Querétaro">Querétaro</option>
                  <option value="San Juan del Río">San Juan del Río</option>
                  <option value="El Marqués">El Marqués</option>
                  <option value="Pedro Escobedo">Pedro Escobedo</option>
                </select>
              ) : (
                <input
                  type="text"
                  required
                  value={formData.address.city}
                  onChange={(e) =>
                    handleInputChange("address.city", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ciudad"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado *
              </label>
              <select
                required
                value={formData.address.state}
                onChange={(e) =>
                  handleInputChange("address.state", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecciona un estado</option>
                <option value="Aguascalientes">Aguascalientes</option>
                <option value="Baja California">Baja California</option>
                <option value="Baja California Sur">Baja California Sur</option>
                <option value="Campeche">Campeche</option>
                <option value="Chiapas">Chiapas</option>
                <option value="Chihuahua">Chihuahua</option>
                <option value="Ciudad de México">Ciudad de México</option>
                <option value="Coahuila">Coahuila</option>
                <option value="Colima">Colima</option>
                <option value="Durango">Durango</option>
                <option value="Estado de México">Estado de México</option>
                <option value="Guanajuato">Guanajuato</option>
                <option value="Guerrero">Guerrero</option>
                <option value="Hidalgo">Hidalgo</option>
                <option value="Jalisco">Jalisco</option>
                <option value="Michoacán">Michoacán</option>
                <option value="Morelos">Morelos</option>
                <option value="Nayarit">Nayarit</option>
                <option value="Nuevo León">Nuevo León</option>
                <option value="Oaxaca">Oaxaca</option>
                <option value="Puebla">Puebla</option>
                <option value="Querétaro">Querétaro</option>
                <option value="Quintana Roo">Quintana Roo</option>
                <option value="San Luis Potosí">San Luis Potosí</option>
                <option value="Sinaloa">Sinaloa</option>
                <option value="Sonora">Sonora</option>
                <option value="Tabasco">Tabasco</option>
                <option value="Tamaulipas">Tamaulipas</option>
                <option value="Tlaxcala">Tlaxcala</option>
                <option value="Veracruz">Veracruz</option>
                <option value="Yucatán">Yucatán</option>
                <option value="Zacatecas">Zacatecas</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código Postal *
            </label>
            <input
              type="text"
              required
              value={formData.address.postal_code}
              onChange={(e) =>
                handleInputChange("address.postal_code", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="12345"
            />
          </div>
        </div>

        {/* Shipping Calculator */}
        <div className="mt-6">
          <button
            type="button"
            onClick={calculateShipping}
            disabled={!formData.address.city || !formData.address.state}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Truck className="w-4 h-4" />
            Calcular Tu Envío
          </button>

          {/* Shipping Results */}
          {shippingCalculated && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 text-green-800">
                <Truck className="w-4 h-4" />
                <span className="font-medium">¡Envío disponible!</span>
              </div>
              <p className="text-sm text-green-700 mt-1">
                {shippingCost === 0
                  ? "¡Felicidades! Tu envío es gratuito"
                  : `Costo de envío: ${formatCurrency(shippingCost, "mxn")}`}
              </p>
            </div>
          )}

          {shippingError && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-2 text-red-800">
                <MapPin className="w-4 h-4" />
                <span className="font-medium">Envío no disponible</span>
              </div>
              <p className="text-sm text-red-700 mt-1">{shippingError}</p>
              <p className="text-xs text-red-600 mt-2">
                Actualmente solo ofrecemos pago contra entrega en Pedro Escobedo
                y El Marqués, Querétaro.
              </p>
            </div>
          )}
        </div>

        {shippingCalculated && !shippingError && (
          <>
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-medium text-blue-900 mb-2">
                Instrucciones importantes:
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>
                  • Ten el monto exacto listo: {formatCurrency(total, "mxn")}
                </li>
                <li>• Verifica los productos antes de pagar</li>
                <li>• Te contactaremos para coordinar la entrega</li>
                <li>• El pago debe ser en efectivo mexicano (MXN)</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-6 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading
                ? "Creando orden..."
                : "Confirmar Orden con Pago Contra Entrega"}
            </button>
          </>
        )}

        {!shippingCalculated && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              Completa tu dirección y calcula el envío para continuar
            </p>
          </div>
        )}
      </form>
    </div>
  );
}

export default CashOnDeliveryCheckout;
