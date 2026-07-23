'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LoadingOrbs } from "@/components/Loader";
import useBasketStore from "@/store/store";

export default function SuccessPage() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams?.get("orderNumber") ?? "";
const sessionId = searchParams?.get("session_id") ?? "";
  const clearBasket = useBasketStore((state) => state.clearBasket);
  const [confirmationError, setConfirmationError] = useState<string | null>(
    null
  );
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (orderNumber) {
      clearBasket();
    }
  }, [orderNumber, clearBasket]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let cancelled = false;

    const confirmOrder = async () => {
      try {
        setIsConfirming(true);
        setConfirmationError(null);

        const response = await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
            orderNumber,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data?.error || "No se pudo confirmar la orden");
        }
      } catch (error) {
        if (!cancelled) {
          setConfirmationError(
            error instanceof Error
              ? error.message
              : "No se pudo confirmar la orden"
          );
        }
      } finally {
        if (!cancelled) {
          setIsConfirming(false);
        }
      }
    };

    void confirmOrder();

    return () => {
      cancelled = true;
    };
  }, [sessionId, orderNumber]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="mx-4 w-full max-w-2xl rounded-xl bg-white p-12 shadow-lg">
        <div className="mb-8 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
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
          <h1 className="mb-2 text-2xl font-bold text-gray-800">
            Compra exitosa
          </h1>

          <div className="mb-6 border-y border-gray-200 py-6">
            <p className="mb-4 text-lg text-gray-600">
              Tu pedido ha sido procesado con exito y pronto sera enviado.
            </p>

            <div className="space-y-2">
              {orderNumber && (
                <p className="flex items-center space-x-5 text-lg">
                  <span>Numero de orden:</span>
                  <span className="font-mono text-sm text-green-600">
                    {orderNumber}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-gray-600">
              Un mensaje de confirmacion ha sido enviado a tu correo
              electronico.
            </p>

            {sessionId && isConfirming && (
              <div className="rounded-lg bg-amber-50 py-3 text-amber-800">
                <LoadingOrbs label="Confirmando tu pedido con la tienda..." />
              </div>
            )}

            {sessionId && !isConfirming && !confirmationError && (
              <p className="ui-enter text-sm text-green-700">
                Pedido confirmado y sincronizado con la tienda.
              </p>
            )}

            {confirmationError && (
              <p className="text-sm text-red-600">
                El pago fue exitoso, pero hubo un problema al sincronizar el
                pedido: {confirmationError}
              </p>
            )}

            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button
                asChild
                className="rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition-colors hover:bg-green-700"
              >
                <Link href="orders">Ver mis pedidos</Link>
              </Button>

              <Button asChild variant="outline">
                <Link href="/">Volver a la tienda</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
