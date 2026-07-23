import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div role="status" aria-label="Buscando productos" className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto w-full max-w-4xl rounded-lg bg-white p-6 sm:p-8">
        <Skeleton className="mx-auto h-8 w-64" />
        <Skeleton className="mx-auto mt-4 h-4 w-44" />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Buscando productos...</span>
    </div>
  );
}
