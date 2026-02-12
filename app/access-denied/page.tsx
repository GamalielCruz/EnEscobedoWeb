import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldX, Home, Store } from "lucide-react";

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <ShieldX className="w-8 h-8 text-red-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Acceso Denegado
          </h1>
          
          <p className="text-gray-600 mb-6">
            No tienes permisos para acceder al panel de administración. 
            Solo los dueños de restaurantes autorizados pueden acceder.
          </p>
          
          <div className="space-y-3">
            <Link href="/" className="block">
              <Button className="w-full bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900 font-semibold">
                <Home className="w-4 h-4 mr-2" />
                Ir al Inicio
              </Button>
            </Link>
            
            <Link href="/studio" target="_blank" rel="noopener" className="block">
              <Button variant="outline" className="w-full">
                <Store className="w-4 h-4 mr-2" />
                Sanity Studio
              </Button>
            </Link>
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 mb-2">
              <strong>Administradores:</strong> Si eres dueño de un restaurante, 
              asegúrate de que tu ID de Clerk esté correctamente configurado en el campo 
              "Usuario Dueño (ID de Clerk)" de tu tienda en Sanity Studio.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
