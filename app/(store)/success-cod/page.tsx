"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, Package, Phone, MapPin, Clock, CreditCard } from "lucide-react";

export default function SuccessCODPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    const orderNum = searchParams.get("orderNumber");
    if (orderNum) {
      setOrderNumber(orderNum);
    } else {
      // Si no hay número de orden, redirigir al inicio
      router.push("/");
    }
  }, [searchParams, router]);

  if (!orderNumber) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header de éxito */}
        <div className="text-center mb-8">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            ¡Orden Confirmada!
          </h1>
          <p className="text-lg text-gray-600">
            Tu pedido ha sido registrado exitosamente
          </p>
        </div>

        {/* Información de la orden */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Detalles de tu Orden
            </h2>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
              Confirmada
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Número de Orden</p>
                <p className="font-mono text-sm font-medium text-gray-900">
                  {orderNumber.slice(0, 8)}...{orderNumber.slice(-8)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Método de Pago</p>
                <p className="font-medium text-gray-900">Pago Contra Entrega</p>
              </div>
            </div>
          </div>
        </div>

        {/* Instrucciones importantes */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Instrucciones Importantes
          </h3>
          <div className="space-y-3 text-amber-700">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 mt-1">•</span>
              <p>
                <strong>Pago en Efectivo:</strong> Ten el monto exacto listo al momento de la entrega o recogida
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-600 mt-1">•</span>
              <p>
                <strong>Contacto:</strong> Te contactaremos por teléfono para coordinar la entrega/recogida
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-600 mt-1">•</span>
              <p>
                <strong>Verificación:</strong> Revisa los productos antes de realizar el pago
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-600 mt-1">•</span>
              <p>
                <strong>Número de Orden:</strong> Ten a la mano tu número de orden para cualquier consulta
              </p>
            </div>
          </div>
        </div>

        {/* Próximos pasos */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Próximos Pasos
          </h3>
          <div className="space-y-3 text-blue-700">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                1
              </span>
              <p>Recibirás una llamada de confirmación en las próximas horas</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                2
              </span>
              <p>Coordinaremos contigo el horario de entrega o recogida</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                3
              </span>
              <p>Prepara el monto exacto en efectivo mexicano (MXN)</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                4
              </span>
              <p>Recibe tu pedido y realiza el pago</p>
            </div>
          </div>
        </div>

        {/* Información de contacto */}
        <div className="bg-gray-100 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            ¿Necesitas Ayuda?
          </h3>
          <p className="text-gray-600 mb-3">
            Si tienes alguna pregunta sobre tu orden o necesitas hacer cambios, contáctanos:
          </p>
          <div className="space-y-2 text-sm">
            <p className="text-gray-700">
              <strong>Teléfono:</strong> +52 442 123 4567
            </p>
            <p className="text-gray-700">
              <strong>Email:</strong> pedidos@enescobedo.com
            </p>
            <p className="text-gray-700">
              <strong>Horario:</strong> Lunes a Viernes 9:00 AM - 6:00 PM
            </p>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Continuar Comprando
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(orderNumber);
              alert("Número de orden copiado al portapapeles");
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Copiar Número de Orden
          </button>
        </div>

        {/* Nota final */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            Gracias por tu preferencia. Te contactaremos pronto para coordinar tu entrega.
          </p>
        </div>
      </div>
    </div>
  );
}