"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";

interface StoreCategory {
  _id: string;
  title?: string;
  slug?: {
    current?: string;
  };
  icon?: string;
}

interface StoreCategoryFilterProps {
  categories: StoreCategory[];
  selectedCategory?: string;
  onCategoryChange?: (categoryId: string | null) => void;
}

export function StoreCategoryFilter({
  categories,
  selectedCategory: externalSelectedCategory,
  onCategoryChange,
}: StoreCategoryFilterProps) {
  const [internalSelectedCategory, setInternalSelectedCategory] =
    useState<string>("");
  const [showSwipeIndicator, setShowSwipeIndicator] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Set isClient to true after mount
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Use external state if provided, otherwise use internal state
  const selectedCategory =
    externalSelectedCategory !== undefined
      ? externalSelectedCategory
      : internalSelectedCategory;

  // Check if content is scrollable and show swipe indicator (only on client)
  useEffect(() => {
    if (!isClient) return;
    
    const checkScrollable = () => {
      if (scrollContainerRef.current) {
        const { scrollWidth, clientWidth } = scrollContainerRef.current;
        const isScrollable = scrollWidth > clientWidth;
        setShowSwipeIndicator(isScrollable && !hasInteracted);
      }
    };

    checkScrollable();
    window.addEventListener("resize", checkScrollable);

    return () => window.removeEventListener("resize", checkScrollable);
  }, [categories, hasInteracted, isClient]);

  // Hide indicator after user interacts
  const handleScroll = () => {
    setHasInteracted(true);
    setShowSwipeIndicator(false);
  };

  const handleCategorySelect = (categoryId: string) => {
    const newCategoryId = selectedCategory === categoryId ? "" : categoryId;

    if (onCategoryChange) {
      // If callback is provided, use it (controlled component)
      onCategoryChange(newCategoryId || null);
    } else {
      // Otherwise use internal state (uncontrolled component)
      setInternalSelectedCategory(newCategoryId);
    }
  };

  return (
    <div className="w-full relative">
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-2"
        onScroll={handleScroll}
        onTouchStart={handleScroll}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {/* Todas las categorías */}
        <button
          onClick={() => handleCategorySelect("")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all whitespace-nowrap flex-shrink-0",
            selectedCategory === ""
              ? "bg-white text-[#eb1901] font-bold border-[#eb1901]"
              : "bg-white text-black border-black hover:border-gray-400"
          )}
        >
          <span>🏪</span>
          <span>Todas</span>
        </button>

        {/* Category items */}
        {categories.map((category) => {
          const displayName = category.title || "Sin nombre";

          return (
            <button
              key={category._id}
              onClick={() => handleCategorySelect(category._id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all whitespace-nowrap flex-shrink-0",
                selectedCategory === category._id
                  ? "bg-white text-[#eb1901] border-[#eb1901] font-bold"
                  : "bg-white text-black border-black hover:border-gray-400"
              )}
            >
              {category.icon && <span>{category.icon}</span>}
              <span>{displayName}</span>
            </button>
          );
        })}
      </div>

      {/* Gradient fade indicator */}
      {isClient && showSwipeIndicator && (
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none" />
      )}
    </div>
  );
}
