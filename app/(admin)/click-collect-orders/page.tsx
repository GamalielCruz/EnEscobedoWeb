import ClickCollectOrdersAdmin from "@/components/ClickCollectOrdersAdmin";

// Deshabilitar caché de la página
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ClickCollectOrdersPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <ClickCollectOrdersAdmin />
    </div>
  );
}