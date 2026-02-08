"use client";

import { useState } from "react";
import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";
import { CategoryFilter } from "@/components/ui/category-filter";
import ProductSidebar from "@/components/ProductSidebar";
import ProductCounter from "@/components/ProductCounter";
import MiniBasket from "@/components/MiniBasket";
import useBasketStore from "@/store/store";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";

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
}

export function StoreProductsClient({
  products,
  categories,
}: StoreProductsClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { canAddProduct } = useBasketStore();

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
    setTimeout(() => setSelectedProduct(null), 300);
  };

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
