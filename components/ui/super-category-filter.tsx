"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Apple,
  BadgePercent,
  Beef,
  Coffee,
  Croissant,
  CupSoda,
  Grid2x2,
  House,
  Milk,
  Package,
  Popcorn,
  ShoppingBasket,
  Soup,
  SprayCan,
} from "lucide-react";
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

type CategoryVisual = {
  icon: LucideIcon;
  bgClass: string;
  iconClass: string;
};

const DEFAULT_VISUAL: CategoryVisual = {
  icon: ShoppingBasket,
  bgClass: "bg-amber-50",
  iconClass: "text-amber-600",
};

function getDisplayName(category: Category) {
  const rawName = category.title || category.name || "Sin nombre";
  const [, leafName = rawName] = rawName.split("/").map((segment) => segment.trim());
  return leafName || rawName;
}

function normalizeLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getCategoryVisual(label: string): CategoryVisual {
  const normalized = normalizeLabel(label);

  if (normalized.includes("todo")) {
    return { icon: Grid2x2, bgClass: "bg-slate-100", iconClass: "text-slate-700" };
  }
  if (normalized.includes("oferta")) {
    return { icon: BadgePercent, bgClass: "bg-red-50", iconClass: "text-red-500" };
  }
  if (normalized.includes("botana") || normalized.includes("dulce")) {
    return { icon: Popcorn, bgClass: "bg-orange-50", iconClass: "text-orange-500" };
  }
  if (normalized.includes("pan") || normalized.includes("panader")) {
    return { icon: Croissant, bgClass: "bg-yellow-50", iconClass: "text-yellow-600" };
  }
  if (normalized.includes("carn") || normalized.includes("marisc")) {
    return { icon: Beef, bgClass: "bg-rose-50", iconClass: "text-rose-500" };
  }
  if (normalized.includes("enlat") || normalized.includes("despensa") || normalized.includes("basic")) {
    return { icon: Soup, bgClass: "bg-amber-50", iconClass: "text-amber-600" };
  }
  if (normalized.includes("fruta") || normalized.includes("verdura")) {
    return { icon: Apple, bgClass: "bg-green-50", iconClass: "text-green-600" };
  }
  if (normalized.includes("bebida")) {
    return { icon: CupSoda, bgClass: "bg-emerald-50", iconClass: "text-emerald-600" };
  }
  if (normalized.includes("lacteo") || normalized.includes("huevo")) {
    return { icon: Milk, bgClass: "bg-indigo-50", iconClass: "text-indigo-500" };
  }
  if (normalized.includes("limpieza")) {
    return { icon: SprayCan, bgClass: "bg-cyan-50", iconClass: "text-cyan-600" };
  }
  if (normalized.includes("desayun")) {
    return { icon: Coffee, bgClass: "bg-yellow-50", iconClass: "text-yellow-700" };
  }
  if (normalized.includes("hogar") || normalized.includes("desechable")) {
    return { icon: House, bgClass: "bg-fuchsia-50", iconClass: "text-fuchsia-600" };
  }
  if (normalized.includes("producto")) {
    return { icon: Package, bgClass: "bg-orange-50", iconClass: "text-orange-600" };
  }

  return DEFAULT_VISUAL;
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
          label="Todo"
          selected={selectedCategory === ""}
          onClick={() => handleCategorySelect("")}
        />

        {categories.map((category) => {
          const displayName = getDisplayName(category);

          return (
            <CategoryCard
              key={category._id}
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
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const visual = getCategoryVisual(label);
  const Icon = visual.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="group flex w-[96px] shrink-0 snap-start flex-col items-center gap-2 rounded-xl px-1 py-1 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eb1902] focus-visible:ring-offset-2"
    >
      <span
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200 sm:h-20 sm:w-20",
          selected
            ? "scale-[1.03] ring-2 ring-[#eb1902]/20"
            : "group-hover:-translate-y-0.5"
        )}
      >
        <span
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full shadow-sm transition-transform duration-200 group-hover:scale-105",
            visual.bgClass,
            selected && "ring-2 ring-[#eb1902]"
          )}
        >
          <Icon className={cn("h-8 w-8 sm:h-10 sm:w-10", visual.iconClass)} strokeWidth={2.2} />
        </span>
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
