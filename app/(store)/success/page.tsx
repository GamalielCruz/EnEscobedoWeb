'use client';

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import  useBasketStore  from "@/store/store";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function SuccessPage() {
    const searchParams = useSearchParams();
    const orderNumber = searchParams.get("orderNumber");
    const clearBasket = useBasketStore((state) => state.clearBasket);
    const sessionId = searchParams.get("session_id");

    useEffect(() => {
        if (orderNumber) {
            clearBasket();
        }
    }, [orderNumber, clearBasket]);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white p-12 rounded-xl shadow-lg max-w-2xl w-full mx-4">
          <div className="flex justify-center mb-8">
            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Compra exitosa
            </h1>
            <div className="border-t border-b border-gray-200 py-6 mb-6">
              <p className="text-gray-600 text-lg mb-4">
                Tu pedido ha sido procesado con éxito y pronto será enviado.
              </p>
              <div className="space-y-2">
                {orderNumber && (
                  <p className="text-lg flex items-center space-x-5">
                    <span>Número de orden:</span>
                    <span className="font-mono text-sm text-green-600">
                      {orderNumber}
                    </span>
                  </p>
                )}
                {/*{sessionId && (
                  <p className="text-gray-600 flex justify-between">
                    <span>Numero de seguimiento:</span>
                    <span className="font-mono text-sm text-green-600">
                      {sessionId}
                    </span>
                  </p>
                )}
                  */}
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-gray-600">
                Un mensaje de confirmación ha sido enviado a tu correo
                electrónico.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  asChild
                  className="bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                >
                  <Link href="orders"> Ver mis pedidos </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/"> Volver a la tienda </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
}

export default SuccessPage;