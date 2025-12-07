"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import StoreGrid from "./StoreGrid";
import { StoreCategoryFilter } from "./StoreCategoryFilter";

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
    icon?: string;
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
}

interface StoreCategory {
  _id: string;
  title?: string;
  slug?: {
    current?: string;
  };
  icon?: string;
}

interface StoresViewProps {
  stores: Store[];
  storeCategories: StoreCategory[];
  selectedCategory?: string;
}

export default function StoresView({
  stores,
  storeCategories,
  selectedCategory: initialCategory,
}: StoresViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleCategoryChange = (categoryId: string | null) => {
    const params = new URLSearchParams(searchParams);
    
    // Remove page when changing category
    params.delete("page");
    
    if (categoryId) {
      params.set("category", categoryId);
    } else {
      params.delete("category");
    }

    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  return (
    <>
      {/* Título */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Tiendas</h1>
        <p className="text-gray-600 mt-2">
          Explora nuestras tiendas y encuentra lo que necesitas
        </p>
      </div>

      {/* Filtro de categorías */}
      {storeCategories.length > 0 && (
        <div className="mb-6">
          <StoreCategoryFilter
            categories={storeCategories}
            selectedCategory={initialCategory || ""}
            onCategoryChange={handleCategoryChange}
          />
        </div>
      )}

      {/* Grid de tiendas */}
      <StoreGrid stores={stores} />
    </>
  );
}
