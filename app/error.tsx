"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">¡Ups! Algo salió mal.</h2>
      <p className="text-gray-600 max-w-md">
        Ocurrió un error inesperado. Hemos registrado el problema.
      </p>
      <Button onClick={() => reset()} className="bg-[#ff8800] hover:bg-[#ff8800]/90">
        Intentar de nuevo
      </Button>
    </div>
  );
}
