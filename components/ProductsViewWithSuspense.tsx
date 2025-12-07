"use client";

import { Suspense } from "react";
import { Category, Product } from "@/sanity.types";
import ProductsView from "./ProductsView";

interface ProductsViewWithSuspenseProps {
    products: Product[]; 
    categories: Category[];
    selectedCategory?: string;
}

// Skeleton loader component for products
const ProductSkeleton = () => (
    <div className="group cursor-pointer animate-pulse">
        <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 xl:aspect-[7/8]">
            <div className="h-full w-full bg-gray-300"></div>
        </div>
        <div className="mt-4 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
    </div>
);

// Skeleton grid component
const ProductGridSkeleton = ({ count = 8 }: { count?: number }) => (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:max-w-7xl lg:px-8">
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-x-8">
            {Array.from({ length: count }).map((_, index) => (
                <ProductSkeleton key={index} />
            ))}
        </div>
    </div>
);

// Loading fallback component
const ProductsLoadingFallback = () => (
    <div className="flex flex-col w-full">
        {/* Categories skeleton */}
        <div className="w-full mb-6">
            <div className="flex gap-2 overflow-x-auto pb-2">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-10 bg-gray-200 rounded-full animate-pulse min-w-[100px]"></div>
                ))}
            </div>
        </div>

        {/* Products skeleton */}
        <div className="flex-1">
            <ProductGridSkeleton count={8} />
        </div>
    </div>
);

export default function ProductsViewWithSuspense({ 
    products, 
    categories, 
    selectedCategory 
}: ProductsViewWithSuspenseProps) {
    return (
        <Suspense fallback={<ProductsLoadingFallback />}>
            <ProductsView 
                products={products}
                categories={categories}
                selectedCategory={selectedCategory}
            />
        </Suspense>
    );
}