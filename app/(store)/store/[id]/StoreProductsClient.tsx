"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { urlFor } from "@/sanity/lib/image";
import { CategoryFilter } from "@/components/ui/category-filter";

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
  image?: any;
  price?: number;
  stock?: number;
  categories?: Array<{
    _id: string;
    name?: string;
    title?: string;
    slug?: {
      current?: string;
    };
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

  // Filtrar productos según la categoría seleccionada
  const filteredProducts = selectedCategory
    ? products.filter((product) =>
        product.categories?.some((cat) => cat._id === selectedCategory)
      )
    : products;

  // Obtener el nombre de la categoría seleccionada
  const selectedCategoryName = selectedCategory
    ? (categories.find((cat) => cat._id === selectedCategory)?.title ||
       categories.find((cat) => cat._id === selectedCategory)?.name ||
       "Sin categoría")
    : "Todo";

  return (
    <div className="py-6">
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
                <Link
                  key={product._id}
                  href={`/product/${product.slug?.current}`}
                  className="group"
                >
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 mb-2">
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
                    <button className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors">
                      <svg
                        className="h-5 w-5 text-gray-700"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </button>
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
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
