"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Category {
  _id: string;
  title?: string;
  name?: string;
  slug?: {
    current?: string;
  };
}

interface SuperCategoryFilterProps {
  categories: Category[];
  selectedCategory?: string;
  onCategoryChange?: (categoryId: string | null) => void;
}

const STOP_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y"]);

function getDisplayName(category: Category) {
  const rawName = category.title || category.name || "Sin nombre";
  const [, leafName = rawName] = rawName.split("/").map((segment) => segment.trim());
  return leafName || rawName;
}

function getBadgeText(label: string) {
  const compactLabel = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const words = compactLabel
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .slice(0, 2);

  if (words.length === 0) return "CA";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return words.map((word) => word[0]).join("").toUpperCase();
}

export function SuperCategoryFilter({
  categories,
  selectedCategory: externalSelectedCategory,
  onCategoryChange,
}: SuperCategoryFilterProps) {
  const [internalSelectedCategory, setInternalSelectedCategory] = useState("");
  const [showSwipeIndicator, setShowSwipeIndicator] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const selectedCategory =
    externalSelectedCategory !== undefined
      ? externalSelectedCategory
      : internalSelectedCategory;

  useEffect(() => {
    const checkScrollable = () => {
      if (!scrollContainerRef.current) return;
      const { scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowSwipeIndicator(scrollWidth > clientWidth && !hasInteracted);
    };

    checkScrollable();
    window.addEventListener("resize", checkScrollable);

    return () => window.removeEventListener("resize", checkScrollable);
  }, [categories, hasInteracted]);

  const handleInteraction = () => {
    setHasInteracted(true);
    setShowSwipeIndicator(false);
  };

  const handleCategorySelect = (categoryId: string) => {
    const nextCategory = selectedCategory === categoryId ? "" : categoryId;

    if (onCategoryChange) {
      onCategoryChange(nextCategory || null);
    } else {
      setInternalSelectedCategory(nextCategory);
    }
  };

  return (
    <div className="relative -mx-4 px-4">
      <div
        ref={scrollContainerRef}
        className="scrollbar-hide flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-2"
        onScroll={handleInteraction}
        onTouchStart={handleInteraction}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <CategoryCard
          badge="TO"
          label="Todo"
          selected={selectedCategory === ""}
          onClick={() => handleCategorySelect("")}
        />

        {categories.map((category) => {
          const displayName = getDisplayName(category);

          return (
            <CategoryCard
              key={category._id}
              badge={getBadgeText(displayName)}
              label={displayName}
              selected={selectedCategory === category._id}
              onClick={() => handleCategorySelect(category._id)}
            />
          );
        })}
      </div>

      {showSwipeIndicator ? (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-14 bg-gradient-to-l from-white to-transparent" />
      ) : null}
    </div>
  );
}

function CategoryCard({
  badge,
  label,
  selected,
  onClick,
}: {
  badge: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="group flex w-[92px] shrink-0 snap-start flex-col items-center gap-2 rounded-xl px-1 py-1 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eb1902] focus-visible:ring-offset-2"
    >
      <span
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full border text-lg font-bold transition-all duration-200 sm:h-20 sm:w-20",
          selected
            ? "border-[#eb1902] bg-[#fff1ef] text-[#eb1902] shadow-sm"
            : "border-gray-200 bg-white text-gray-700 group-hover:-translate-y-0.5 group-hover:shadow-sm"
        )}
      >
        {badge}
      </span>
      <span
        className={cn(
          "line-clamp-2 min-h-[2.5rem] text-sm leading-tight transition-colors",
          selected ? "font-bold text-[#eb1902]" : "font-semibold text-gray-900"
        )}
      >
        {label}
      </span>
    </button>
  );
}
