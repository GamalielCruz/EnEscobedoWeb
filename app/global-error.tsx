"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">Error crítico</h2>
          <p className="text-gray-600">Ocurrió un error grave en la aplicación.</p>
          <Button onClick={() => reset()} className="bg-[#ff8800] hover:bg-[#ff8800]/90">
            Reiniciar aplicación
          </Button>
        </div>
      </body>
    </html>
  );
}
