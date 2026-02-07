import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center space-y-4">
      <h1 className="text-4xl font-bold text-[#ff8800]">404</h1>
      <h2 className="text-2xl font-semibold text-gray-900">Página no encontrada</h2>
      <p className="text-gray-600 max-w-md">
        Lo sentimos, la página que buscas no existe o ha sido movida.
      </p>
      <Link href="/">
        <Button className="bg-[#ff8800] hover:bg-[#ff8800]/90">
          Volver al inicio
        </Button>
      </Link>
    </div>
  );
}
