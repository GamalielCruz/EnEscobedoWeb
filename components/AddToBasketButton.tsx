"use client";
import { Product } from "@/sanity.types";
import useBasketStore from "@/store/store";
import { Loader } from "lucide-react";
import { useEffect, useState } from "react";
import StoreConflictAlert from "./StoreConflictAlert";

interface AddBasketButtonProps {
    product: Product;
    disabled?: boolean;
}

function AddToBasketButton({ product, disabled }: AddBasketButtonProps ) {
    const store = useBasketStore();
    const [isClient, setIsClient] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showConflictAlert, setShowConflictAlert] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    // Verificar que las funciones básicas del store estén disponibles
    if (!store || typeof store.addItem !== 'function' || typeof store.canAddProduct !== 'function') {
        console.warn('Store not fully initialized');
        return (
            <div className="flex items-center justify-center gap-2 sm:gap-3">
                <button
                    disabled
                    className="w-full bg-gray-300 text-gray-500 px-4 py-2 rounded font-bold"
                >
                    Cargando...
                </button>
            </div>
        );
    }

    // Obtener nombre de tienda actual de forma alternativa (sin usar getCurrentStoreName)
    const currentStoreName = store.items && store.items.length > 0 
        ? (store.items[0]?.product?.affiliateStore as { name?: string })?.name || "Tienda actual"
        : "Tienda actual";
    
    const newStoreName = (product?.affiliateStore as { name?: string })?.name || "Nueva tienda";

    const handleAddToBasket = async () => {
        // Verificar si se puede agregar el producto
        if (!store.canAddProduct(product)) {
            setShowConflictAlert(true);
            return;
        }

        setIsLoading(true);
        try {
            await new Promise((resolve) => {
                store.addItem(product);
                setTimeout(resolve, 500); // medio segundo de loader
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearCartAndAdd = async () => {
        if (typeof store.clearBasket === 'function') {
            store.clearBasket();
        }
        setIsLoading(true);
        try {
            await new Promise((resolve) => {
                store.addItem(product);
                setTimeout(resolve, 500);
            });
        } finally {
            setIsLoading(false);
        }
    };
  

    return (
        <>
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

            <StoreConflictAlert
                isOpen={showConflictAlert}
                onClose={() => setShowConflictAlert(false)}
                currentStoreName={currentStoreName}
                newStoreName={newStoreName}
                onClearCart={handleClearCartAndAdd}
            />
        </>
    );
}

export default AddToBasketButton
