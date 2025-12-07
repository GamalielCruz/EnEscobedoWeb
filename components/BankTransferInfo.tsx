"use client";

import { AlertCircle, Clock, CreditCard, Copy, RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface BankTransferInfoProps {
  orderNumber: string;
  amount: number;
  currency: string;
  expiresAt?: string;
  bankTransferReference?: string;
  bankTransferClabe?: string;
  orderId?: string;
  paymentIntentId?: string;
}

export function BankTransferInfo({
  orderNumber,
  amount,
  currency,
  expiresAt,
  bankTransferReference,
  bankTransferClabe,
  orderId,
  paymentIntentId,
}: BankTransferInfoProps) {
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentReference, setCurrentReference] = useState(
    bankTransferReference
  );
  const [currentClabe, setCurrentClabe] = useState(bankTransferClabe);

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

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const refreshBankDetails = useCallback(async () => {
    if ((!orderId && !paymentIntentId) || isRefreshing) return;

    setIsRefreshing(true);
    try {
      // Try the SPEI-specific endpoint first if we have a payment intent ID
      let response;
      if (paymentIntentId) {
        response = await fetch(`/api/spei-reference/${paymentIntentId}`);
      } else if (orderId) {
        response = await fetch(`/api/bank-transfer/${orderId}`);
      }

      if (response && response.ok) {
        const data = await response.json();
        setCurrentReference(data.reference);
        setCurrentClabe(data.clabe);
        console.log("Updated SPEI reference:", data.reference);
      }
    } catch (error) {
      console.error("Error refreshing bank details:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [orderId, paymentIntentId, isRefreshing]);

  // Auto-refresh if we don't have bank details yet
  useEffect(() => {
    if (!currentReference && orderId) {
      const interval = setInterval(() => {
        refreshBankDetails();
      }, 30000); // Check every 30 seconds

      return () => clearInterval(interval);
    }
  }, [currentReference, orderId, refreshBankDetails]);

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-2">
          <h3 className="font-semibold text-green-900">
            Transferencia Bancaria SPEI Pendiente
          </h3>
          <p className="text-sm text-green-800">
            Realiza una transferencia SPEI desde tu banco usando los datos
            bancarios que recibirás por email.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-md p-3 border border-green-200 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-green-600" />
            <span className="font-medium text-green-900">
              Información de Pago:
            </span>
          </div>
          {(!currentReference || !currentClabe) &&
            (orderId || paymentIntentId) && (
              <button
                onClick={refreshBankDetails}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}
                />
                {isRefreshing ? "Obteniendo..." : "Obtener Referencia SPEI"}
              </button>
            )}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Referencia SPEI:</span>
            <div className="flex items-center gap-2">
              <code className="bg-gray-100 px-2 py-1 rounded text-green-900 font-mono">
                {currentReference || "Not available"}
              </code>
              <button
                onClick={() => copyToClipboard(currentReference || orderNumber)}
                className="p-1 hover:bg-gray-100 rounded"
                title="Copiar referencia"
              >
                <Copy className="w-3 h-3 text-gray-500" />
              </button>
            </div>
          </div>

          {currentClabe && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600">CLABE:</span>
              <div className="flex items-center gap-2">
                <code className="bg-gray-100 px-2 py-1 rounded text-green-900 font-mono text-xs">
                  {currentClabe}
                </code>
                <button
                  onClick={() => copyToClipboard(currentClabe)}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Copiar CLABE"
                >
                  <Copy className="w-3 h-3 text-gray-500" />
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-gray-600">Monto exacto:</span>
            <span className="font-bold text-green-900">
              {formatAmount(amount, currency)}
            </span>
          </div>
        </div>
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

      {!currentReference && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <p className="text-sm text-blue-800 font-medium mb-1">
            ⏳ Generando datos bancarios...
          </p>
          <p className="text-xs text-blue-700">
            Los datos bancarios completos (CLABE y referencia SPEI) se están
            generando y llegarán a tu email en unos minutos.
          </p>
        </div>
      )}

      <div className="text-xs text-green-700 space-y-1">
        <p>
          •{" "}
          {currentReference
            ? "Usa exactamente la referencia SPEI mostrada arriba"
            : "Recibirás los datos bancarios completos por email"}
        </p>
        <p>• El pago puede tardar hasta 24 horas en procesarse</p>
        <p>• Asegúrate de transferir el monto exacto</p>
        <p>• Te contactaremos por teléfono para coordinar la entrega</p>
        {currentClabe && (
          <p>• Usa la CLABE para transferencias desde otros bancos</p>
        )}
      </div>

      {copied && (
        <div className="text-xs text-green-600 bg-green-100 rounded p-2">
          ✅ Referencia copiada al portapapeles
        </div>
      )}
    </div>
  );
}
