"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { urlFor } from "@/sanity/lib/image";
import { CategoryFilter } from "@/components/ui/category-filter";
import ProductSidebar from "@/components/ProductSidebar";
import ProductCounter from "@/components/ProductCounter";
import MiniBasket from "@/components/MiniBasket";

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
  description?: string;
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
  products: Product[];
  categories: Category[];
  highlightedProductSlug?: string;
}

export function StoreProductsClient({
  products,
  categories,
  highlightedProductSlug,
}: StoreProductsClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [dismissedHighlightedSlug, setDismissedHighlightedSlug] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Verificar si un producto requiere personalización obligatoria
  const hasRequiredOptions = (product: Product) => {
    return product.optionGroups?.some(group => group.required === true) || false;
  };

  // Filtrar productos según la categoría seleccionada
  const filteredProducts = selectedCategory
    ? products.filter((product) =>
        product.categories?.some((cat) => cat._id === selectedCategory)
      )
    : products;

  // Obtener el nombre de la categoría seleccionada
  const selectedCategoryName = selectedCategory
    ? String(categories.find((cat) => cat._id === selectedCategory)?.title ||
       categories.find((cat) => cat._id === selectedCategory)?.name ||
       "Sin categoría")
    : "Todo";

  const handleProductClick = (product: Product, event: React.MouseEvent) => {
    // Check if the click originated from the + button or its container
    const target = event.target as HTMLElement;
    
    // Check if click is from + button area (including SVG inside)
    if (target.closest('button') || 
        target.closest('.absolute.top-2.right-2') ||
        target.closest('svg') ||
        target.tagName === 'svg' ||
        target.tagName === 'path') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    // Si el producto requiere opciones obligatorias, abrir sidebar
    if (hasRequiredOptions(product)) {
      setSelectedProduct(product);
      setIsSidebarOpen(true);
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    setSelectedProduct(product);
    setIsSidebarOpen(true);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    if (highlightedProductSlug) {
      setDismissedHighlightedSlug(highlightedProductSlug);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("product");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname ?? "/", { scroll: false });
    }
    setTimeout(() => setSelectedProduct(null), 300);
  };

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
        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory || ""}
          onCategoryChange={setSelectedCategory}
        />
      </div>

      {/* Título de sección */}
      <div className="px-4 mb-6">
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => {
              const isOutOfStock = product.stock != null && product.stock <= 0;

              return (
                <div
                  key={product._id}
                  className="group cursor-pointer"
                  onClick={(e) => handleProductClick(product, e)}
                  data-product-slug={product.slug?.current || ""}
                >
                  <div className="relative aspect-square rounded-2xl shadow-lg overflow-hidden bg-white mb-2">
                    {product.image && (
                      <Image
                        src={urlFor(product.image).width(400).height(400).url()}
                        alt={product.name || "Producto"}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-200"
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
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
                        product={product as any} 
                        onOpenSidebar={() => {
                          setSelectedProduct(product);
                          setIsSidebarOpen(true);
                        }}
                      />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">
                      {product.name}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">
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
          product={selectedProduct as any}
          isOpen={isSidebarOpen}
          onClose={handleCloseSidebar}
        />
      )}

      {/* MiniBasket persistente */}
      <MiniBasket />
    </div>
  );
}

