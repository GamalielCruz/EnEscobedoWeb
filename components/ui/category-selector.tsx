"use client";
import {
  Store,
  Home,
  ChevronRight,
  MoveHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

// Type for AffiliateStore (Tienda/Restaurante)
interface AffiliateStore {
  _id: string;
  name?: string;
  storeId?: string;
  address?: {
    city?: string;
    state?: string;
  };
  isActive?: boolean;
}

interface StoreSelectorProps {
  stores: AffiliateStore[];
  selectedStore?: string;
  onStoreChange?: (storeId: string | null) => void;
}

export function CategorySelectorComponent({
  stores,
  selectedStore: externalSelectedStore,
  onStoreChange,
}: StoreSelectorProps) {
  const [internalSelectedStore, setInternalSelectedStore] =
    useState<string>("");
  const [showSwipeIndicator, setShowSwipeIndicator] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Use external state if provided, otherwise use internal state
  const selectedStore =
    externalSelectedStore !== undefined
      ? externalSelectedStore
      : internalSelectedStore;

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
  }, [stores, hasInteracted]);

  // Hide indicator after user interacts
  const handleScroll = () => {
    setHasInteracted(true);
    setShowSwipeIndicator(false);
  };

  const handleStoreSelect = (storeId: string) => {
    const newStoreId = selectedStore === storeId ? "" : storeId;

    if (onStoreChange) {
      // If callback is provided, use it (controlled component)
      onStoreChange(newStoreId || null);
    } else {
      // Otherwise use internal state (uncontrolled component)
      setInternalSelectedStore(newStoreId);
    }
  };

  return (
    <div className="w-full bg-[#ff9d00] rounded-lg p-2 relative">
      {/* Label so users understand this filter as Tienda/Restaurante instead of categorías */}
      <div className="mb-1 px-1">
      
      </div>
      <div
        ref={scrollContainerRef}
        className="flex items-center space-x-1 overflow-x-auto scrollbar-hide"
        onScroll={handleScroll}
        onTouchStart={handleScroll}
      >
        {/* All Stores option */}
        <Button
          variant="ghost"
          onClick={() => handleStoreSelect("")}
          className={cn(
            "flex items-center space-x-2 px-4 py-2 rounded-md transition-colors whitespace-nowrap",
            selectedStore === ""
              ? "bg-white text-black font-semibold"
              : "text-black hover:bg-gray-50"
          )}
        >
          <Home className="h-4 w-4" />
          <span>Todos</span>
        </Button>

        {/* Separator */}
        <div className="w-px h-6 bg-gray-900 mx-2" />

        {/* Store items */}
        {stores.map((store, index) => {
          return (
            <div key={store._id} className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => handleStoreSelect(store._id)}
                className={cn(
                  "flex items-center space-x-2 px-4 py-2 rounded-md transition-colors whitespace-nowrap",
                  selectedStore === store._id
                    ? "bg-white text-black font-semibold"
                    : "text-black hover:bg-gray-50"
                )}
              >
                <Store className="h-4 w-4" />
                <span>{store.name || "Tienda sin nombre"}</span>
              </Button>

              {/* Separator between stores */}
              {index < stores.length - 1 && (
                <div className="w-px h-6 bg-gray-900 mx-2" />
              )}
            </div>
          );
        })}
      </div>

      {/* Swipe Indicator - Only on mobile/tablet */}
      {showSwipeIndicator && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 md:hidden">
          <div className="flex items-center gap-1 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1 ">
            <MoveHorizontal className="h-3 w-3 text-black" />
            <ChevronRight className="h-3 w-3 text-black animate-ping" />
          </div>
        </div>
      )}

      {/* Gradient fade indicator for desktop */}
      {showSwipeIndicator && (
        <div className="hidden md:block absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#e1ff00] to-transparent pointer-events-none" />
      )}
    </div>
  );
}
