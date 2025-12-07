"use client";
import { Home, ChevronRight, MoveHorizontal, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface Category {
  _id: string;
  name?: string;
  slug?: {
    current?: string;
  };
}

interface ProductCategoryFilterProps {
  categories: Category[];
  selectedCategory?: string;
  onCategoryChange?: (categoryId: string | null) => void;
}

export function ProductCategoryFilter({
  categories,
  selectedCategory: externalSelectedCategory,
  onCategoryChange,
}: ProductCategoryFilterProps) {
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
    <div className="w-full bg-[#ff9d00] rounded-lg p-2 relative">
      <div
        ref={scrollContainerRef}
        className="flex items-center space-x-1 overflow-x-auto scrollbar-hide"
        onScroll={handleScroll}
        onTouchStart={handleScroll}
      >
        {/* All Categories option */}
        <Button
          variant="ghost"
          onClick={() => handleCategorySelect("")}
          className={cn(
            "flex items-center space-x-2 px-4 py-2 rounded-md transition-colors whitespace-nowrap",
            selectedCategory === ""
              ? "bg-white text-black font-semibold"
              : "text-black hover:bg-gray-50"
          )}
        >
          <Home className="h-4 w-4" />
          <span>Todos</span>
        </Button>

        {/* Separator */}
        <div className="w-px h-6 bg-gray-900 mx-2" />

        {/* Category items */}
        {categories.map((category, index) => {
          return (
            <div key={category._id} className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => handleCategorySelect(category._id)}
                className={cn(
                  "flex items-center space-x-2 px-4 py-2 rounded-md transition-colors whitespace-nowrap",
                  selectedCategory === category._id
                    ? "bg-white text-black font-semibold"
                    : "text-black hover:bg-gray-50"
                )}
              >
                <Tag className="h-4 w-4" />
                <span>{category.name || "Sin nombre"}</span>
              </Button>

              {/* Separator between categories */}
              {index < categories.length - 1 && (
                <div className="w-px h-6 bg-gray-900 mx-2" />
              )}
            </div>
          );
        })}
      </div>

      {/* Swipe Indicator - Only on mobile/tablet */}
      {showSwipeIndicator && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 md:hidden">
          <div className="flex items-center gap-1 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1">
            <MoveHorizontal className="h-3 w-3 text-black" />
            <ChevronRight className="h-3 w-3 text-black animate-ping" />
          </div>
        </div>
      )}

      {/* Gradient fade indicator for desktop */}
      {showSwipeIndicator && (
        <div className="hidden md:block absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#ff9d00] to-transparent pointer-events-none" />
      )}
    </div>
  );
}
