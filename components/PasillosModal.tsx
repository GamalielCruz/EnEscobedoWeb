"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
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
import type { LucideIcon } from "lucide-react";

interface Category {
  _id: string;
  title?: string;
  name?: string;
  slug?: { current?: string };
}

interface PasillosModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onCategorySelect: (categoryId: string | null) => void;
}

type CategoryVisual = { icon: LucideIcon; bgClass: string; iconClass: string };

const DEFAULT_VISUAL: CategoryVisual = {
  icon: ShoppingBasket,
  bgClass: "bg-amber-50",
  iconClass: "text-amber-600",
};

function normalizeLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getCategoryVisual(label: string): CategoryVisual {
  const n = normalizeLabel(label);
  if (n.includes("todo")) return { icon: Grid2x2, bgClass: "bg-slate-100", iconClass: "text-slate-700" };
  if (n.includes("oferta")) return { icon: BadgePercent, bgClass: "bg-red-50", iconClass: "text-red-500" };
  if (n.includes("botana") || n.includes("dulce")) return { icon: Popcorn, bgClass: "bg-orange-50", iconClass: "text-orange-500" };
  if (n.includes("pan") || n.includes("panader")) return { icon: Croissant, bgClass: "bg-yellow-50", iconClass: "text-yellow-600" };
  if (n.includes("carn") || n.includes("marisc")) return { icon: Beef, bgClass: "bg-rose-50", iconClass: "text-rose-500" };
  if (n.includes("enlat") || n.includes("despensa") || n.includes("basic")) return { icon: Soup, bgClass: "bg-amber-50", iconClass: "text-amber-600" };
  if (n.includes("fruta") || n.includes("verdura")) return { icon: Apple, bgClass: "bg-green-50", iconClass: "text-green-600" };
  if (n.includes("bebida")) return { icon: CupSoda, bgClass: "bg-emerald-50", iconClass: "text-emerald-600" };
  if (n.includes("lacteo") || n.includes("huevo")) return { icon: Milk, bgClass: "bg-indigo-50", iconClass: "text-indigo-500" };
  if (n.includes("limpieza")) return { icon: SprayCan, bgClass: "bg-cyan-50", iconClass: "text-cyan-600" };
  if (n.includes("desayun")) return { icon: Coffee, bgClass: "bg-yellow-50", iconClass: "text-yellow-700" };
  if (n.includes("hogar") || n.includes("desechable")) return { icon: House, bgClass: "bg-fuchsia-50", iconClass: "text-fuchsia-600" };
  if (n.includes("producto")) return { icon: Package, bgClass: "bg-orange-50", iconClass: "text-orange-600" };
  if (n.includes("alcohol") || n.includes("tabaco")) return { icon: CupSoda, bgClass: "bg-purple-50", iconClass: "text-purple-600" };
  if (n.includes("farmacia") || n.includes("primeros")) return { icon: Package, bgClass: "bg-teal-50", iconClass: "text-teal-600" };
  return DEFAULT_VISUAL;
}

function getDisplayName(category: Category) {
  const rawName = category.title || category.name || "Sin nombre";
  const [, leafName = rawName] = rawName.split("/").map((s) => s.trim());
  return leafName || rawName;
}

// Group categories by their prefix (e.g. "Abarrotes / Limpieza" → group "Abarrotes")
function groupCategories(categories: Category[]) {
  const groups: Map<string, Category[]> = new Map();

  for (const cat of categories) {
    const rawName = cat.title || cat.name || "";
    const parts = rawName.split("/").map((s) => s.trim());
    const groupName = parts.length > 1 ? parts[0] : "General";
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName)!.push(cat);
  }

  return groups;
}

export default function PasillosModal({
  isOpen,
  onClose,
  categories,
  onCategorySelect,
}: PasillosModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const groups = groupCategories(categories);

  const handleSelect = (categoryId: string) => {
    onCategorySelect(categoryId);
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-t-3xl bg-white sm:rounded-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Pasillos</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {/* "Todo" option */}
          <button
            type="button"
            onClick={() => { onCategorySelect(null); onClose(); }}
            className="mb-6 flex items-center gap-3 w-full text-left hover:opacity-80 transition-opacity"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100">
              <Grid2x2 className="h-7 w-7 text-slate-700" />
            </span>
            <span className="text-sm font-semibold text-gray-900">Todo</span>
          </button>

          {Array.from(groups.entries()).map(([groupName, cats]) => (
            <div key={groupName} className="mb-6">
              {groups.size > 1 && (
                <h3 className="mb-3 text-sm font-bold text-gray-500 uppercase tracking-wide">
                  {groupName}
                </h3>
              )}
              <div className="grid grid-cols-4 gap-3">
                {cats.map((cat) => {
                  const displayName = getDisplayName(cat);
                  const visual = getCategoryVisual(displayName);
                  const Icon = visual.icon;
                  return (
                    <button
                      key={cat._id}
                      type="button"
                      onClick={() => handleSelect(cat._id)}
                      className="flex flex-col items-center gap-1.5 text-center focus:outline-none"
                    >
                      <span
                        className={cn(
                          "flex h-14 w-14 items-center justify-center rounded-full shadow-sm",
                          visual.bgClass
                        )}
                      >
                        <Icon className={cn("h-7 w-7", visual.iconClass)} strokeWidth={2.2} />
                      </span>
                      <span className="line-clamp-2 text-xs font-medium text-gray-800 leading-tight">
                        {displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
