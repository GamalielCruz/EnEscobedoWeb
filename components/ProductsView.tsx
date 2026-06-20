"use client";
import { Product } from "@/sanity.types";
import ProductGrid from "./ProductGrid";
import { CategorySelectorComponent } from "./ui/category-selector";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

// Type for AffiliateStore
interface AffiliateStore {
    _id: string;
    name?: string;
    storeId?: string;
}

interface ProductsViewProps {
    products: Product[]; 
    stores: AffiliateStore[];
    selectedStore?: string;
    isLoading?: boolean;
}

// Skeleton loader component for products (matches ProductThumb design)
const ProductSkeleton = () => (
    <div className="group flex flex-col bg-white rounded-lg overflow-hidden animate-pulse w-full">
        {/* Image skeleton - Horizontal/Wide Aspect Ratio */}
        <div className="relative w-full h-48 overflow-hidden bg-gray-200">
            <div className="h-full w-full bg-gray-300"></div>
        </div>
        
        {/* Content skeleton */}
        <div className="p-4 space-y-2">
            {/* Title skeleton */}
            <div className="h-6 bg-gray-200 rounded w-3/4"></div>
            
            {/* Price range skeleton */}
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            
            {/* Badges skeleton */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
                <div className="h-6 bg-gray-200 rounded-full w-20"></div>
                <div className="h-6 bg-gray-200 rounded-full w-24"></div>
                <div className="h-6 bg-gray-200 rounded-full w-16"></div>
            </div>
        </div>
    </div>
);

// Skeleton grid component (matches ProductGrid layout)
const ProductGridSkeleton = ({ count = 8 }: { count?: number }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4 w-full">
        {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="w-full">
                <ProductSkeleton />
            </div>
        ))}
    </div>
);

const ProductsView = ({ products, stores, selectedStore, isLoading = false }: ProductsViewProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [previousStore, setPreviousStore] = useState(selectedStore);

    const handleStoreChange = (storeId: string | null) => {
        // Only show transition if store is actually changing
        if (storeId !== selectedStore) {
            setIsTransitioning(true);
            setPreviousStore(selectedStore);
        }
        
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        
        if (storeId) {
            params.set('store', storeId);
        } else {
            params.delete('store');
        }
        
        // Always reset to page 1 when changing store
        params.delete('page');
        
        const queryString = params.toString();
        const newUrl = queryString ? `/?${queryString}` : '/';
        
        router.push(newUrl);
    };

    // Reset transition state when products change or store changes
    useEffect(() => {
        if (!isLoading && selectedStore !== previousStore) {
            const timer = setTimeout(() => {
                setIsTransitioning(false);
                setPreviousStore(selectedStore);
            }, 100); // Small delay to ensure smooth transition
            
            return () => clearTimeout(timer);
        }
    }, [isLoading, products, selectedStore, previousStore]);

    // Show loading state
    const shouldShowSkeleton = isLoading || isTransitioning;

    return (
    <div className="flex flex-col w-full">
        {/* Stores */}
        <div className="w-full">
            <CategorySelectorComponent 
                stores={stores} 
                selectedStore={selectedStore || ""}
                onStoreChange={handleStoreChange}
            />
        </div>

        {/* Products */}
        <div className="flex-1">
            <div className="relative">
                {shouldShowSkeleton ? (
                    <div className="transition-opacity duration-300">
                        <ProductGridSkeleton count={8} />
                    </div>
                ) : (
                    <div className="transition-opacity duration-300 opacity-100">
                        <ProductGrid products={products} />
                    </div>
                )}

                <hr className="w-1/2 sm:w-3/4" />
            </div>
        </div>

    </div>
    );
};

export default ProductsView;