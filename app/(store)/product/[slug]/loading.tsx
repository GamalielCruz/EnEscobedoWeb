import { Skeleton } from "@/components/ui/skeleton";

export default function ProductLoading() {
  return (
    <div role="status" aria-label="Cargando producto" className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-xl flex-col">
        <Skeleton className="h-64 w-full rounded-none md:h-80" />
        <div className="space-y-5 px-4 py-5">
          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
      <span className="sr-only">Cargando producto...</span>
    </div>
  );
}
