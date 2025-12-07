"use client";
import { Product } from "@/sanity.types";
import useBasketStore from "@/store/store";
import { Loader } from "lucide-react";
import { useEffect, useState } from "react";

interface AddBasketButtonProps {
    product: Product;
    disabled?: boolean;
}

function AddToBasketButton({ product, disabled }: AddBasketButtonProps ) {
    const { addItem, removeItem, getItemCount } = useBasketStore();
    const itemCount = getItemCount(product._id);
    const [isClient, setIsClient] = useState(false);
    const [isLoading, setIsLoading] = useState(false);    

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    const handleAddToBasket = async () => {
      setIsLoading(true);
      try {
          await new Promise((resolve) => {
              addItem(product);
              setTimeout(resolve, 500); // medio segundo de loader
          });
      } finally {
          setIsLoading(false);
      }
  };
  

    return (
        <div className="flex items-center justify-center gap-2 sm:gap-3">
            <button
                onClick={handleAddToBasket}
                className={`
                    w-full bg-[#70e000] text-black px-4 py-2 rounded hover:bg-[#afdc82]
                    disabled:bg-lime-100
                    flex items-center justify-center
                    transition-all duration-200
                    font-bold
                `}
                disabled={disabled || isLoading}
                aria-label="Agregar al carrito"
            >
                {isLoading ? (
                    <span className="flex items-center gap-2">
                        <Loader className="w-4 h-4 animate-spin" />
                        Agregando al carrito
                    </span>
                ) : (
                    <span className="flex text-white items-center gap-2">
                        Agregar 
                    </span>
                )}
            </button>
        </div>
    );
}

export default AddToBasketButton
