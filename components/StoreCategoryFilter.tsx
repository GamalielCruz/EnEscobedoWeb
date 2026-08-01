"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface StoreCategoryIcon {
  type?: string;
  emoji?: string;
  image?: { asset?: { _id?: string; url?: string }; alt?: string };
}

interface StoreCategory {
  _id: string;
  title?: string;
  slug?: { current?: string };
  icon?: StoreCategoryIcon;
}

interface StoreCategoryFilterProps {
  categories: StoreCategory[];
  selectedCategory?: string;
  onCategoryChange?: (categoryId: string | null) => void;
  mandadoSelected?: boolean;
  onMandadoSelect?: () => void;
}

export function StoreCategoryFilter({
  categories,
  selectedCategory: externalSelectedCategory,
  onCategoryChange,
  mandadoSelected = false,
  onMandadoSelect,
}: StoreCategoryFilterProps) {
  const [internalSelectedCategory, setInternalSelectedCategory] = useState("");
  const selectedCategory = externalSelectedCategory ?? internalSelectedCategory;

  const handleCategorySelect = (categoryId: string) => {
    const nextCategory = selectedCategory === categoryId ? null : categoryId;
    if (onCategoryChange) onCategoryChange(nextCategory);
    else setInternalSelectedCategory(nextCategory || "");
  };

  return (
    <div className="scrollbar-hide flex snap-x snap-mandatory items-start justify-around gap-4 overflow-x-auto pb-1 sm:gap-6" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
      <CategoryButton
        label="Mandado"
        selected={mandadoSelected}
        onClick={onMandadoSelect}
        icon={<Image src="/repartidor.png" alt="" width={72} height={72} className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105" />}
      />

      {categories.map((category) => {
        const label = category.title || "Sin nombre";
        const selected = !mandadoSelected && selectedCategory === category._id;
        const icon = category.icon?.type === "emoji" && category.icon.emoji
          ? <span className="text-5xl">{category.icon.emoji}</span>
          : category.icon?.type === "image" && category.icon.image?.asset?.url
            ? <Image src={category.icon.image.asset.url} alt={category.icon.image.alt || label} width={80} height={80} className="h-full w-full object-contain p-1" />
            : <span className="text-2xl font-black text-gray-400">{label.charAt(0)}</span>;

        return <CategoryButton key={category._id} label={label} selected={selected} onClick={() => handleCategorySelect(category._id)} icon={icon} />;
      })}
    </div>
  );
}

function CategoryButton({ label, selected, onClick, icon }: { label: string; selected: boolean; onClick?: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="group flex w-max min-w-20 shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl px-1 py-1 text-center transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eb1901] focus-visible:ring-offset-2 active:scale-95">
      <span className={cn("flex h-18 w-18 items-center justify-center overflow-visible transition-all duration-200 sm:h-20 sm:w-20", selected ? "drop-shadow-md" : "group-hover:scale-105")}>
        {icon}
      </span>
      <span className={cn("whitespace-nowrap text-sm leading-tight transition-colors", selected ? "font-bold text-[#eb1901]" : "font-semibold text-gray-900")}>{label}</span>
    </button>
  );
}
