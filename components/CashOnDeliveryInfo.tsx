"use client";

import { Truck, MapPin, DollarSign, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

interface CashOnDeliveryInfoProps {
  orderNumber: string;
  totalAmount: number;
  currency: string;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  codInstructions?: string;
  deliveryNotes?: string;
}

export function CashOnDeliveryInfo({
  orderNumber,
  totalAmount,
  currency,
  shippingAddress,
  codInstructions,
  deliveryNotes,
}: CashOnDeliveryInfoProps) {
  const formatAddress = () => {
    if (!shippingAddress) return "Dirección no disponible";
    
    const parts = [
      shippingAddress.line1,
      shippingAddress.line2,
      shippingAddress.city,
      shippingAddress.state,
      shippingAddress.postal_code,
    ].filter(Boolean);
    
    return parts.join(", ");
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
      <div className="flex items-start gap-3">
        <Truck className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-2">
          <h3 className="font-semibold text-amber-900">
            Pago Contra Entrega
          </h3>
          <p className="text-sm text-amber-800">
            Tu pedido será entregado y el pago se realizará en efectivo al momento de recibir los productos.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-md p-3 border border-amber-200 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-4 h-4 text-amber-600" />
          <span className="font-medium text-amber-900">
            Información de Pago:
          </span>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Número de Orden:</span>
            <code className="bg-gray-100 px-2 py-1 rounded text-amber-900 font-mono text-xs">
              {orderNumber}
            </code>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600">Monto a pagar en efectivo:</span>
            <span className="font-bold text-amber-900 text-lg">
              {formatCurrency(totalAmount, currency)}
            </span>
          </div>

          {shippingAddress && (
            <div className="pt-2 border-t border-gray-200">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium text-gray-700">Dirección de entrega:</span>
                  <p className="text-gray-600 text-xs mt-1">
                    {formatAddress()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 text-sm">
        <Clock className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-medium text-orange-800">Estado:</span>
          <span className="text-orange-700 ml-1">
            Preparando pedido para entrega
          </span>
        </div>
      </div>

      {codInstructions && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <p className="text-sm text-blue-800 font-medium mb-1">
            📋 Instrucciones de Pago
          </p>
          <p className="text-xs text-blue-700">
            {codInstructions}
          </p>
        </div>
      )}

      {deliveryNotes && (
        <div className="bg-green-50 border border-green-200 rounded p-3">
          <p className="text-sm text-green-800 font-medium mb-1">
            📝 Notas de Entrega
          </p>
          <p className="text-xs text-green-700">
            {deliveryNotes}
          </p>
        </div>
      )}

      <div className="text-xs text-amber-700 space-y-1">
        <p>• Ten el monto exacto listo para facilitar la entrega</p>
        <p>• Verifica que los productos estén en buen estado antes de pagar</p>
        <p>• Te contactaremos por teléfono para coordinar la entrega</p>
        <p>• El pago debe realizarse en efectivo mexicano (MXN)</p>
      </div>
    </div>
  );
}