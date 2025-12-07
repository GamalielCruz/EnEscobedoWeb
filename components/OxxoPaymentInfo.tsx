"use client";

import { AlertCircle, Clock, MapPin } from "lucide-react";

interface OxxoPaymentInfoProps {
  orderNumber: string;
  oxxoReference?: string;
  expiresAt?: string;
}

export function OxxoPaymentInfo({
  orderNumber,
  oxxoReference,
  expiresAt,
}: OxxoPaymentInfoProps) {
  const formatExpiryDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-MX", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-2">
          <h3 className="font-semibold text-blue-900">Pago OXXO Pendiente</h3>
          <p className="text-sm text-blue-800">
            Tu orden está esperando el pago en OXXO. Presenta el código de
            barras o número de referencia en cualquier tienda OXXO.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-md p-3 border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-4 h-4 text-blue-600" />
          <span className="font-medium text-blue-900">
            Número de Referencia:
          </span>
        </div>
        <code className="text-lg font-mono bg-gray-100 px-2 py-1 rounded text-blue-900 break-all">
          {oxxoReference || orderNumber}
        </code>
      </div>

      {expiresAt && (
        <div className="flex items-start gap-2 text-sm">
          <Clock className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium text-orange-800">Vence el:</span>
            <span className="text-orange-700 ml-1">
              {formatExpiryDate(expiresAt)}
            </span>
          </div>
        </div>
      )}

      <div className="text-xs text-blue-700 space-y-1">
        <p>• El pago puede tardar hasta 24 horas en procesarse</p>
        <p>• Recibirás una confirmación por email una vez procesado el pago</p>
        <p>• Te contactaremos por teléfono para coordinar la entrega</p>
      </div>
    </div>
  );
}
