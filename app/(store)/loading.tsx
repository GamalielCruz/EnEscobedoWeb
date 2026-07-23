import { Skeleton } from "@/components/ui/skeleton";

function Loading() {
  return (
    <div
      role="status"
      aria-label="Cargando tiendas"
      className="min-h-screen bg-white px-4 py-4"
    >
      <div className="mx-auto w-full max-w-7xl">
        <Skeleton className="h-72 w-full rounded-none sm:h-96" />
        <div className="mt-6 flex gap-3 overflow-hidden">
          {[96, 128, 160, 112].map((width) => (
            <Skeleton
              key={width}
              className="h-11 shrink-0 rounded-full"
              style={{ width }}
            />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-lg border border-gray-100">
              <Skeleton className="h-48 w-full rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Cargando tiendas...</span>
    </div>
  );
}

export default Loading;
