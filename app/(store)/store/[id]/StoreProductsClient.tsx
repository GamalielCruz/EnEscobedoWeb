"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { urlFor } from "@/sanity/lib/image";
import { CategoryFilter } from "@/components/ui/category-filter";
import { SuperCategoryFilter } from "@/components/ui/super-category-filter";
import PasillosModal from "@/components/PasillosModal";
import ProductSidebar from "@/components/ProductSidebar";
import ProductCounter from "@/components/ProductCounter";
import MiniBasket from "@/components/MiniBasket";
import { orderProducts } from "@/lib/product-order";
import {
  getPrimaryProductCategoryName,
  getRetailProductImageUrl,
} from "@/lib/retail-product-images";
import type { Product as SanityProduct } from "@/sanity.types";

interface Category {
  _id: string;
  title?: string;
  name?: string;
  slug?: {
    current?: string;
  };
}

interface Product {
  _id: string;
  name?: string;
  slug?: {
    current?: string;
  };
  image?: {
    asset?: {
      _ref?: string;
    };
  } | null;
  price?: number;
  stock?: number;
  description?: unknown;
  categories?: Array<{
    _id: string;
    name?: string;
    title?: string;
    slug?: {
      current?: string;
    };
  }>;
  optionGroups?: Array<{
    title?: string;
    description?: string;
    required?: boolean;
    selectionType?: "single" | "multiple";
    options?: Array<{
      label?: string;
      description?: string;
      priceDelta?: number;
      isDefault?: boolean;
    }>;
  }>;
}

interface StoreProductsClientProps {
  storeId: string;
  products: Product[];
  categories: Category[];
  categoryProductOrders: Record<string, string[]>;
  highlightedProductSlug?: string;
}

export function StoreProductsClient({
  storeId,
  products,
  categories,
  categoryProductOrders,
  highlightedProductSlug,
}: StoreProductsClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPasillosOpen, setIsPasillosOpen] = useState(false);
  const [dismissedHighlightedSlug, setDismissedHighlightedSlug] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const enableCatalogFallback =
    storeId === "abarrotes-pilot" || pathname?.startsWith("/super") === true;

  // Filtrar productos según la categoría seleccionada
  const filteredProducts = selectedCategory
    ? orderProducts(
        products.filter((product) =>
          product.categories?.some((cat) => cat._id === selectedCategory)
        ),
        categoryProductOrders[selectedCategory] ?? []
      )
    : products;

  // Obtener el nombre de la categoría seleccionada
  const selectedCategoryName = selectedCategory
    ? String(categories.find((cat) => cat._id === selectedCategory)?.title ||
       categories.find((cat) => cat._id === selectedCategory)?.name ||
       "Sin categoría")
    : "Todo";

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsSidebarOpen(true);
  };

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    if (highlightedProductSlug) {
      setDismissedHighlightedSlug(highlightedProductSlug);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("product");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname ?? "/", { scroll: false });
    }
    setTimeout(() => setSelectedProduct(null), 300);
  }, [highlightedProductSlug, pathname, router, searchParams]);

  const highlightedProduct = highlightedProductSlug
    && highlightedProductSlug !== dismissedHighlightedSlug
    ? products.find((product) => product.slug?.current === highlightedProductSlug)
    : null;

  useEffect(() => {
    if (highlightedProduct && !selectedProduct) {
      setSelectedProduct(highlightedProduct);
      setIsSidebarOpen(true);
    }
  }, [highlightedProduct, selectedProduct]);

  useEffect(() => {
    if (!highlightedProductSlug) {
      setDismissedHighlightedSlug(null);
    }
  }, [highlightedProductSlug]);

  useEffect(() => {
    if (!highlightedProductSlug) return;
    const el = document.querySelector(
      `[data-product-slug="${highlightedProductSlug}"]`
    ) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedProductSlug]);

  return (
    <div className="py-6 pb-24">
      {/* Filtro de categorías - siempre mostrar */}
      <div className="mb-8">
        {enableCatalogFallback ? (
          <SuperCategoryFilter
            categories={categories}
            selectedCategory={selectedCategory || ""}
            onCategoryChange={setSelectedCategory}
          />
        ) : (
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory || ""}
            onCategoryChange={setSelectedCategory}
          />
        )}
      </div>

      {/* Título de sección */}
      <div className="mb-6 px-4">
        <h2 className="text-2xl font-bold text-gray-900">
          {selectedCategoryName}
        </h2>
      </div>

      {/* Productos */}
      <div className="px-4">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {selectedCategory
                ? "No hay productos en esta categoría"
                : "No hay productos disponibles en esta tienda"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {filteredProducts.map((product) => {
              const isOutOfStock = product.stock != null && product.stock <= 0;
              const hasSanityImage = Boolean(product.image?.asset?._ref);
              const fallbackImageUrl =
                !hasSanityImage && enableCatalogFallback
                  ? getRetailProductImageUrl({
                      productName: product.name,
                      categoryName: getPrimaryProductCategoryName(product.categories),
                    })
                  : null;
              const productImageSrc = hasSanityImage
                ? urlFor(product.image as NonNullable<Product["image"]>).width(400).height(400).url()
                : fallbackImageUrl;
              const usesGeneratedImage = !hasSanityImage && Boolean(fallbackImageUrl);

              return (
                <div
                  key={product._id}
                  className="group relative cursor-pointer"
                  data-product-slug={product.slug?.current || ""}
                >
                  <button
                    type="button"
                    className="absolute inset-0 z-[1] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5bb800]"
                    onClick={() => openProduct(product)}
                    aria-label={`Ver ${product.name || "producto"}`}
                  />
                  <div className="relative mb-2 aspect-square overflow-hidden rounded-2xl bg-white shadow-lg">
                    {productImageSrc ? (
                      <Image
                        src={productImageSrc}
                        alt={product.name || "Producto"}
                        fill
                        className={`transition-transform duration-200 group-hover:scale-105 ${
                          usesGeneratedImage ? "object-contain bg-white p-4" : "object-cover"
                        }`}
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        unoptimized={usesGeneratedImage}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-gray-400">
                        Sin imagen
                      </div>
                    )}
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="text-white text-xs font-semibold">
                          Agotado
                        </span>
                      </div>
                    )}
                    {!isOutOfStock && (
                      <ProductCounter
                        product={product}
                        onOpenSidebar={() => {
                          setSelectedProduct(product);
                          setIsSidebarOpen(true);
                        }}
                      />
                    )}
                  </div>
                  <div>
                    <p className="line-clamp-2 text-sm font-medium text-gray-900">
                      {product.name}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      $
                      {typeof product.price === "number"
                        ? product.price.toFixed(2)
                        : "0.00"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ProductSidebar */}
      {selectedProduct && (
        <ProductSidebar
          product={selectedProduct as unknown as SanityProduct}
          storeId={storeId}
          enableCatalogFallback={enableCatalogFallback}
          isOpen={isSidebarOpen}
          onClose={handleCloseSidebar}
        />
      )}

      {/* MiniBasket persistente */}
      <MiniBasket />

      {/* Botón Pasillos - solo para super/retail */}
      {enableCatalogFallback && categories.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setIsPasillosOpen(true)}
            className="fixed bottom-24 right-4 z-40 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-gray-900 text-white shadow-xl hover:bg-gray-800 active:scale-95 transition-all"
            aria-label="Ver pasillos"
          >
            <span className="text-lg leading-none">🛒</span>
            <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide leading-none">
              Pasillos
            </span>
          </button>

          <PasillosModal
            isOpen={isPasillosOpen}
            onClose={() => setIsPasillosOpen(false)}
            categories={categories}
            onCategorySelect={setSelectedCategory}
          />
        </>
      )}
    </div>
  );
}
