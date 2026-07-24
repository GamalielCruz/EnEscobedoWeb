import { Skeleton } from "@/components/ui/skeleton";

export default function StoreLoading() {
  return (
    <div role="status" aria-label="Cargando tienda" className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl">
        <div className="relative h-48 overflow-hidden md:h-64">
          <Skeleton className="h-full w-full rounded-none" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full md:h-24 md:w-24" />
            <Skeleton className="h-8 w-40 bg-gray-300" />
          </div>
        </div>
        <div className="space-y-3 border-b px-4 py-4">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex gap-6 border-b px-4 py-5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="grid grid-cols-2 gap-4 px-4 py-8 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Cargando tienda...</span>
    </div>
  );
}
