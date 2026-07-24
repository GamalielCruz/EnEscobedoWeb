"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CheckCircle,
  CreditCard,
  Package,
} from "lucide-react";
import Loader from "@/components/Loader";

const BRAND_COLOR = "#eb1902";

export default function SuccessCODPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const orderNum = searchParams?.get("orderNumber") ?? "";

    if (orderNum) {
      setOrderNumber(orderNum);
      return;
    }

    router.push("/");
  }, [searchParams, router]);

  if (!isMounted || !orderNumber) {
    return <Loader />;
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 text-center">
          <div
            className="ui-enter mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-sm"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            <CheckCircle className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pedido recibido</h1>
          <p className="mt-2 text-sm text-gray-500">
            Tu pedido fue registrado correctamente. Puedes consultar su avance en Mis Pedidos.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-l-4 p-5 sm:p-6" style={{ borderLeftColor: BRAND_COLOR }}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Orden</p>
                <p className="mt-1 break-all font-mono text-sm font-semibold text-gray-900">{orderNumber}</p>
              </div>
              <span
                className="inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-medium text-white"
                style={{ backgroundColor: BRAND_COLOR }}
              >
                Recibido
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-md bg-gray-50 p-3">
                <Package className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Estado actual</p>
                  <p className="font-medium text-gray-900">Recibido</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-md bg-gray-50 p-3">
                <CreditCard className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Pago</p>
                  <p className="font-medium text-gray-900">Efectivo al recibir</p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Seguimiento del pedido</p>
              <p className="mt-1 text-sm text-gray-600">
                Para ver cambios de estado, entra a Mis Pedidos.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            onClick={() => router.push("/orders")}
            className="inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold text-white transition-colors hover:brightness-95"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            <Package className="h-4 w-4" />
            Ver mis pedidos
          </button>
        </div>
      </div>
    </div>
  );
}
