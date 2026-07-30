"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import StoreGrid from "./StoreGrid";
import { StoreCategoryFilter } from "./StoreCategoryFilter";
import { Skeleton } from "./ui/skeleton";

interface StoreCategoryIcon {
  type?: string;
  emoji?: string;
  image?: {
    asset?: {
      _id?: string;
      url?: string;
    };
    alt?: string;
  };
}

interface Store {
  _id: string;
  name?: string;
  storeId?: string;
  image?: any;
  coverImage?: any;
  address?: {
    street?: string;
    city?: string;
    state?: string;
  };
  storeCategories?: Array<{
    _id: string;
    title?: string;
    slug?: {
      current?: string;
    };
    icon?: StoreCategoryIcon;
  }>;
  operatingHours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
  deliveryFee?: number;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
  averageDeliveryTime?: number;
  isActive?: boolean;
  promotionalMessages?: string[];
  promotionalMessagesEnabled?: boolean;
}

interface StoreCategory {
  _id: string;
  title?: string;
  slug?: {
    current?: string;
  };
  icon?: StoreCategoryIcon;
}

interface StoresViewProps {
  stores: Store[];
  storeCategories: StoreCategory[];
  selectedCategory?: string;
}

function StoreGridSkeleton() {
  return (
    <div className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-lg border border-gray-100 bg-white">
          <Skeleton className="h-48 w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StoresView({
  stores,
  storeCategories,
  selectedCategory: initialCategory,
}: StoresViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [pendingCategory, setPendingCategory] = useState("");
  const selectedCategory = isPending ? pendingCategory : initialCategory || "";

  const handleCategoryChange = (categoryId: string | null) => {
    setPendingCategory(categoryId || "");
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    
    // Remove page when changing category
    params.delete("page");
    
    if (categoryId) {
      params.set("category", categoryId);
    } else {
      params.delete("category");
    }

    const queryString = params.toString();
    startTransition(() => {
      router.push(queryString ? `/?${queryString}` : "/");
    });
  };

  return (
    <>
      {/* Filtro de categorías */}
      {storeCategories.length > 0 && (
        <div className="mb-6">
          <StoreCategoryFilter
            categories={storeCategories}
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategoryChange}
          />
        </div>
      )}

      {/* Grid de tiendas */}
      <div aria-busy={isPending}>
        {isPending ? <StoreGridSkeleton /> : <StoreGrid stores={stores} />}
      </div>
    </>
  );
}
