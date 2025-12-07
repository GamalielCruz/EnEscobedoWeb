import ClickCollectBanner from "@/components/ClickCollectBanner";
import { Button } from "@/components/ui/button";
import { getAllAffiliateStores } from "@/sanity/lib/products/getAllAffiliateStores";
import { getAllStoreCategories } from "@/sanity/lib/products/getAllStoreCategories";
import { redirect } from "next/navigation";
import StoresView from "@/components/StoresView";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const PAGE_SIZE = 8;

type NextPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getCurrentPage(
  searchParams: Record<string, string | string[] | undefined>
) {
  const page = searchParams?.page;
  const pageNum = Array.isArray(page)
    ? parseInt(
        page.length > 0 && typeof page[0] === "string" ? page[0] : "1",
        10
      )
    : parseInt(typeof page === "string" ? page : "1", 10);
  return isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
}

function getSelectedCategory(
  searchParams: Record<string, string | string[] | undefined>
) {
  const category = searchParams?.category;
  return Array.isArray(category) ? category[0] : category;
}

export default async function Home(props: NextPageProps) {
  const searchParams: Record<string, string | string[] | undefined> =
    await (props?.searchParams ?? Promise.resolve({}));

  const [stores, storeCategories] = await Promise.all([
    getAllAffiliateStores(),
    getAllStoreCategories(),
  ]);

  const currentPage = getCurrentPage(searchParams);
  const selectedCategory = getSelectedCategory(searchParams);

  // Debug
  console.log('Selected category:', selectedCategory);
  console.log('Total stores:', stores.length);
  console.log('Sample store categories:', stores[0]?.storeCategories);

  // Filter stores by category
  const filteredStores = selectedCategory
    ? stores.filter((store: any) =>
        store.storeCategories?.some((cat: unknown) => cat._id === selectedCategory)
      )
    : stores;

  console.log('Filtered stores:', filteredStores.length);

  // Pagination for filtered stores
  const totalStores = filteredStores.length;
  const totalPages = Math.ceil(totalStores / PAGE_SIZE);

  if (currentPage > totalPages && totalPages > 0) {
    const categoryParam = selectedCategory ? `&category=${selectedCategory}` : "";
    redirect(`/?page=1${categoryParam}`);
  }

  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const endIdx = startIdx + PAGE_SIZE;
  const paginatedStores = filteredStores.slice(startIdx, endIdx);

  return (
    <div className="translate-y-[70px]">
      
      {/* Click & Collect Banner - Solo en la primera página */}
      {currentPage === 1 && (
        <div className="max-w-6xl mx-auto px-4 py-4">
          <ClickCollectBanner compact={true} />
        </div>
      )}

      <div className="flex flex-col min-h-screen bg-gray-100 p-4 w-full">
        <div className="w-full max-w-7xl mx-auto">
          <StoresView
            stores={paginatedStores}
            storeCategories={storeCategories}
            selectedCategory={selectedCategory}
          />
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex gap-2 mt-6 justify-center w-full max-w-7xl mx-auto">
            <Button asChild variant="outline" disabled={currentPage <= 1}>
              <a
                href={`/?page=${currentPage - 1}${selectedCategory ? `&category=${selectedCategory}` : ""}`}
                aria-disabled={currentPage <= 1}
                tabIndex={currentPage <= 1 ? -1 : 0}
              >
                Atrás
              </a>
            </Button>
            <span className="px-2 py-1 text-gray-700">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              asChild
              variant="outline"
              disabled={currentPage >= totalPages}
            >
              <a
                href={`/?page=${currentPage + 1}${selectedCategory ? `&category=${selectedCategory}` : ""}`}
                aria-disabled={currentPage >= totalPages}
                tabIndex={currentPage >= totalPages ? -1 : 0}
              >
                Siguiente
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
