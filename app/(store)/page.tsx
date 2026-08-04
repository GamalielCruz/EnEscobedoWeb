import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ComponentProps } from "react";
import { getAllAffiliateStores } from "@/sanity/lib/products/getAllAffiliateStores";
import { getAllStoreCategories } from "@/sanity/lib/products/getAllStoreCategories";
import { redirect } from "next/navigation";
import StoresView from "@/components/StoresView";
import BuenFinBanner from "@/components/BuenFinBanner";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const PAGE_SIZE = 8;

type NextPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type StoreCategoryIcon = {
  type?: "emoji" | "image" | null;
  emoji?: string | null;
  image?: {
    asset?: {
      _id?: string | null;
      url?: string | null;
    } | null;
    alt?: string | null;
  } | null;
};

type RawStoreCategory = {
  _id: string;
  title?: string | null;
  slug?: {
    current?: string | null;
  } | null;
  icon?: StoreCategoryIcon | null;
};

type RawAffiliateStore = {
  _id: string;
  name?: string | null;
  storeId?: string | null;
  address?: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  operatingHours?: {
    monday?: string | null;
    tuesday?: string | null;
    wednesday?: string | null;
    thursday?: string | null;
    friday?: string | null;
    saturday?: string | null;
    sunday?: string | null;
  } | null;
  storeCategories?: RawStoreCategory[] | null;
};

type StoresViewProps = ComponentProps<typeof StoresView>;
type ViewStore = StoresViewProps["stores"][number];
type ViewStoreCategory = StoresViewProps["storeCategories"][number];

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

function normalizeCategoryName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isHiddenHomeStore(store: RawAffiliateStore) {
  const normalizedName = normalizeCategoryName(store.name);
  return normalizedName === "abarrotes" || store.storeId === "abarrotes-pilot";
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
  const isMandado = (Array.isArray(searchParams.service) ? searchParams.service[0] : searchParams.service) === "mandado";
  const visibleStoreCategories: ViewStoreCategory[] = storeCategories
    .filter(
        (category) =>
        normalizeCategoryName(category.title) !== "abarrotes"
    )
    .map((category) => ({
      _id: category._id,
      title: category.title || undefined,
      slug: category.slug
        ? {
            current: category.slug.current || undefined,
          }
        : undefined,
      icon: category.icon
        ? {
            type: category.icon.type || undefined,
            emoji: category.icon.emoji || undefined,
            image: category.icon.image
              ? {
                  asset: category.icon.image.asset
                    ? {
                        _id: category.icon.image.asset._id || undefined,
                        url: category.icon.image.asset.url || undefined,
                      }
                    : undefined,
                  alt: category.icon.image.alt || undefined,
                }
              : undefined,
          }
        : undefined,
    }));
  const hiddenCategoryIds = new Set(
    storeCategories
      .filter(
        (category) =>
          normalizeCategoryName(category.title) === "abarrotes"
      )
      .map((category) => category._id)
  );
  const effectiveSelectedCategory =
    selectedCategory && !hiddenCategoryIds.has(selectedCategory)
      ? selectedCategory
      : undefined;

  // Filter stores by category
  const visibleStores = stores.filter((store: RawAffiliateStore) => !isHiddenHomeStore(store));
  const filteredStores = effectiveSelectedCategory
    ? visibleStores.filter((store: RawAffiliateStore) =>
        store.storeCategories?.some((cat: RawStoreCategory) => cat._id === effectiveSelectedCategory)
      )
    : visibleStores;

  // Pagination for filtered stores
  const totalStores = filteredStores.length;
  const totalPages = Math.ceil(totalStores / PAGE_SIZE);

  if (currentPage > totalPages && totalPages > 0) {
    const categoryParam = effectiveSelectedCategory
      ? `&category=${effectiveSelectedCategory}`
      : "";
    redirect(`/?page=1${categoryParam}`);
  }

  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const endIdx = startIdx + PAGE_SIZE;
  const paginatedStores = filteredStores.slice(startIdx, endIdx);

  // Convert stores to match StoresView interface
  const convertedStores: ViewStore[] = paginatedStores.map((store: RawAffiliateStore) => ({
    ...store,
    name: store.name || undefined, // Convert null to undefined
    storeId: store.storeId || undefined,
    address: store.address || undefined, // Convert null to undefined
    operatingHours: store.operatingHours || undefined, // Convert null to undefined
    storeCategories: store.storeCategories ? store.storeCategories.map((cat: RawStoreCategory) => ({
      _id: cat._id,
      title: cat.title || undefined,
      slug: cat.slug ? {
        current: cat.slug.current || undefined
      } : undefined,
      icon: cat.icon || undefined
    })) : undefined
  }));

  return (
    <div className="">
      
      {/* Click & Collect Banner - Solo en la primera página */}
      {currentPage === 1 && (
        <div className="">
          <BuenFinBanner />
        </div>
      )}

      <div className="flex min-h-screen w-full flex-col bg-white px-4 pb-4">
        <div className="w-full max-w-7xl mx-auto">
          <StoresView
            stores={convertedStores}
            storeCategories={visibleStoreCategories}
            selectedCategory={effectiveSelectedCategory}
          />
        </div>

        {/* Pagination Controls */}
        {!isMandado && totalPages > 1 && (
          <div className="flex gap-2 mt-6 justify-center w-full max-w-7xl mx-auto">
            <Button asChild variant="outline" disabled={currentPage <= 1}>
              <Link
                href={`/?page=${currentPage - 1}${effectiveSelectedCategory ? `&category=${effectiveSelectedCategory}` : ""}`}
                aria-disabled={currentPage <= 1}
                tabIndex={currentPage <= 1 ? -1 : 0}
              >
                Atrás
              </Link>
            </Button>
            <span className="px-2 py-1 text-gray-700">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              asChild
              variant="outline"
              disabled={currentPage >= totalPages}
            >
              <Link
                href={`/?page=${currentPage + 1}${effectiveSelectedCategory ? `&category=${effectiveSelectedCategory}` : ""}`}
                aria-disabled={currentPage >= totalPages}
                tabIndex={currentPage >= totalPages ? -1 : 0}
              >
                Siguiente
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


