"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";
import type { Product } from "@/sanity.types";

interface LazyRelatedProductsProps {
  productSlug: string;
  productCategories: string[];
}

type RelatedProduct = Pick<
  Product,
  "_id" | "name" | "slug" | "price" | "image" | "categories"
>;

// Skeleton loader component
const ProductSkeleton = () => (
  <div className="block border-2 border-[#d4e400] p-2 animate-pulse">
    <div className="bg-gray-200 aspect-square rounded mb-2"></div>
    <div className="mt-2">
      <div className="h-4 bg-gray-200 rounded mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-16"></div>
    </div>
  </div>
);

export default function LazyRelatedProducts({
  productSlug,
  productCategories,
}: LazyRelatedProductsProps) {
  const [relatedProducts, setRelatedProducts] = useState<RelatedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const loadRelatedProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/related-products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productSlug,
          productCategories,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setRelatedProducts(data.relatedProducts || []);
      }
    } catch (error) {
      console.error("Error loading related products:", error);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [productSlug, productCategories]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasLoaded && !isLoading) {
          loadRelatedProducts();
        }
      },
      {
        rootMargin: "100px", // Start loading 100px before the section comes into view
        threshold: 0.1,
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, [hasLoaded, isLoading, loadRelatedProducts]);

  return (
    <div ref={sectionRef} className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Te puede interesar</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading || !hasLoaded
          ? // Show skeleton loaders
            Array.from({ length: 4 }).map((_, index) => (
              <ProductSkeleton key={index} />
            ))
          : // Show actual products
            relatedProducts.map((related) => {
              const slug = related.slug?.current;

              return (
                <a
                  key={slug}
                  href={`/product/${slug}`}
                  className="block group border-2 border-[#d4e400] p-2"
                  aria-label={related.name || "Producto relacionado"}
                >
                  {related.image && (
                    <Image
                      src={urlFor(related.image).url()}
                      alt={related.name ?? "Imagen de producto"}
                      width={400}
                      height={400}
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  )}
                  <div className="mt-2">
                    <div className="font-semibold text-gray-900 group-hover:text-darkColor transition-colors text-base">
                      {related.name}
                    </div>
                    {related.price && (
                      <div className="text-gray-700 text-sm group-hover:text-darkColor transition-colors">
                        ${related.price}
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
      </div>
    </div>
  );
}
