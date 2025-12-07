"use client";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";

interface Category {
  _id: string;
  title?: string;
  name?: string;
  slug?: {
    current?: string;
  };
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory?: string;
  onCategoryChange?: (categoryId: string | null) => void;
}

export function CategoryFilter({
  categories,
  selectedCategory: externalSelectedCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  const [internalSelectedCategory, setInternalSelectedCategory] =
    useState<string>("");
  const [showSwipeIndicator, setShowSwipeIndicator] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Use external state if provided, otherwise use internal state
  const selectedCategory =
    externalSelectedCategory !== undefined
      ? externalSelectedCategory
      : internalSelectedCategory;

  // Check if content is scrollable and show swipe indicator
  useEffect(() => {
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
  }, [categories, hasInteracted]);

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
    <div className="w-full relative -mx-4 px-4">
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-6 overflow-x-auto scrollbar-hide pb-2"
        onScroll={handleScroll}
        onTouchStart={handleScroll}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* Todas las categorías */}
        <button
          onClick={() => handleCategorySelect("")}
          className={cn(
            "text-base font-medium whitespace-nowrap transition-colors ml-2 pb-2 border-b-2 flex-shrink-0",
            selectedCategory === ""
              ? "text-black border-black"
              : "text-gray-500 border-transparent hover:text-gray-700"
          )}
        >
          Todo
        </button>

        {/* Category items */}
        {categories.map((category) => {
          const displayName = category.title || category.name || "Sin nombre";
          
          return (
            <button
              key={category._id}
              onClick={() => handleCategorySelect(category._id)}
              className={cn(
                "text-base font-medium whitespace-nowrap transition-colors pb-2 border-b-2 flex-shrink-0",
                selectedCategory === category._id
                  ? "text-black border-black"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              )}
            >
              {displayName}
            </button>
          );
        })}
      </div>

      {/* Gradient fade indicator */}
      {showSwipeIndicator && (
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white to-transparent pointer-events-none" />
      )}
    </div>
  );
}
