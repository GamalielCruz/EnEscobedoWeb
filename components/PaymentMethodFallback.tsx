"use client";

import { AlertTriangle, CreditCard, Store } from "lucide-react";

interface PaymentMethodFallbackProps {
  error?: string;
  onRetry?: () => void;
}

export function PaymentMethodFallback({ error, onRetry }: PaymentMethodFallbackProps) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-2">
          <h3 className="font-semibold text-amber-900">Problema con Transferencias Bancarias</h3>
          <p className="text-sm text-amber-800">
            {error || "Las transferencias bancarias SPEI no están disponibles temporalmente."}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-md p-3 border border-amber-200">
        <h4 className="font-medium text-amber-900 mb-2">Métodos de pago alternativos:</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" />
            <span className="text-gray-700">💳 Tarjeta de crédito o débito (procesamiento inmediato)</span>
          </div>
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-orange-600" />
            <span className="text-gray-700">🏪 OXXO (pago en efectivo, 2 días para completar)</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors text-sm font-medium"
          >
            Reintentar Transferencia
          </button>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          Usar Otro Método
        </button>
      </div>

      <div className="text-xs text-amber-700 space-y-1">
        <p>• Las transferencias SPEI requieren configuración especial</p>
        <p>• Si el problema persiste, contacta a soporte</p>
        <p>• Los otros métodos de pago funcionan normalmente</p>
      </div>
    </div>
  );
}