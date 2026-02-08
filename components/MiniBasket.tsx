"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";
import useBasketStore from "@/store/store";
import { ShoppingCart, X } from "lucide-react";

export default function MiniBasket() {
  const { items, getTotalPrice, getItemCount } = useBasketStore();
  const [isVisible, setIsVisible] = useState(false);

  // Mostrar mini-canasta solo si hay productos
  useEffect(() => {
    setIsVisible(items.length > 0);
  }, [items]);

  if (!isVisible || items.length === 0) return null;

  const totalItems = items.reduce((total, item) => total + item.quantity, 0);
  const totalPrice = getTotalPrice();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 px-4 py-3">
      <div className="max-w-md mx-auto">
        {/* Contenido principal de la mini-canasta */}
        <Link href="/basket" className="block">
          <div className="flex items-center justify-between">
            {/* Vista miniatura de productos */}
            <div className="flex items-center gap-3 flex-1">
              <div className="flex -space-x-2">
                {items.slice(0, 3).map((item, index) => (
                  <div
                    key={item.product._id}
                    className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white"
                    style={{ zIndex: 3 - index }}
                  >
                    {item.product.image ? (
                      <Image
                        src={urlFor(item.product.image).width(32).height(32).url()}
                        alt={item.product.name || "Producto"}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <ShoppingCart className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                  </div>
                ))}
                {items.length > 3 && (
                  <div className="relative w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-600">
                      +{items.length - 3}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Información de productos y precio */}
              <div className="flex-1 ml-3">
                <p className="text-sm font-medium text-gray-900">
                  {totalItems} {totalItems === 1 ? "producto" : "productos"}
                </p>
                <p className="text-lg font-bold text-green-600">
                  ${totalPrice.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Botón para ir a canasta */}
            <button className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2">
              Ir a canasta
              <ShoppingCart className="w-4 h-4" />
            </button>
          </div>
        </Link>
      </div>
    </div>
  );
}
