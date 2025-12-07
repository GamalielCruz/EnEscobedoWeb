import { CheckCircle, Truck, Phone } from "lucide-react";
import Link from "next/link";

interface SuccessCODPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function SuccessCODPage({ searchParams }: SuccessCODPageProps) {
  const params = await searchParams;
  const orderNumber = params.orderNumber as string | undefined;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 translate-y-[70px]">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            ¡Orden Confirmada!
          </h1>
          <p className="text-gray-600">
            Tu orden con pago contra entrega ha sido creada exitosamente
          </p>
        </div>

        {orderNumber && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Número de orden:</p>
            <code className="text-lg font-mono text-green-600 break-all">
              {orderNumber}
            </code>
          </div>
        )}

        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-3 text-left">
            <Truck className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">Preparando tu pedido</p>
              <p className="text-sm text-gray-600">
                Comenzaremos a preparar tu orden para entrega
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-left">
            <Phone className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">Te contactaremos pronto</p>
              <p className="text-sm text-gray-600">
                Nos comunicaremos contigo para coordinar la entrega
              </p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-amber-900 mb-2">Recordatorio:</h3>
          <p className="text-sm text-amber-800">
            Ten el monto exacto en efectivo listo para cuando llegue tu pedido.
            Podrás revisar los productos antes de realizar el pago.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/orders"
            className="block w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Ver mis órdenes
          </Link>
          
          <Link
            href="/"
            className="block w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            Continuar comprando
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SuccessCODPage;