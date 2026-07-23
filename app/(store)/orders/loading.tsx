import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersLoading() {
  return (
    <div role="status" aria-label="Cargando pedidos" className="min-h-screen bg-gray-50 p-4 sm:pt-8">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-64" />
        </div>
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-4 rounded-lg border bg-white p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-7 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando pedidos...</span>
    </div>
  );
}
