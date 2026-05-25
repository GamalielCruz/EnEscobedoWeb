"use client";
import { Product } from "@/sanity.types";
import useBasketStore from "@/store/store";
import { Loader } from "lucide-react";
import { useState } from "react";
import StoreConflictAlert from "./StoreConflictAlert";

interface AddBasketButtonProps {
    product: Product;
    disabled?: boolean;
}

function AddToBasketButtonNew({ product, disabled }: AddBasketButtonProps ) {
    const store = useBasketStore();
    const [isLoading, setIsLoading] = useState(false);
    const [showConflictAlert, setShowConflictAlert] = useState(false);

    const handleAddToBasket = async () => {
        // Verificación básica del store
        if (!store || typeof store.addItem !== 'function') {
            console.warn('Store no disponible');
            return;
        }

        // Verificar si se puede agregar el producto
        if (store.canAddProduct && !store.canAddProduct(product)) {
            setShowConflictAlert(true);
            return;
        }

        setIsLoading(true);
        try {
            store.addItem({ product, quantity: 1 });
            await new Promise((resolve) => setTimeout(resolve, 500));
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearCartAndAdd = async () => {
        if (store && typeof store.clearBasket === 'function') {
            store.clearBasket();
        }
        setIsLoading(true);
        try {
            if (store && typeof store.addItem === 'function') {
                store.addItem({ product, quantity: 1 });
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        } finally {
            setIsLoading(false);
        }
    };

    // Obtener nombres de tienda para el modal de conflicto
    const currentStoreName = store?.items && store.items.length > 0 
        ? (store.items[0]?.product?.affiliateStore as { name?: string })?.name || "Tienda actual"
        : "Tienda actual";
    
    const newStoreName = (product?.affiliateStore as { name?: string })?.name || "Nueva tienda";

    // Renderizar siempre el botón, sin validaciones que puedan bloquear
    return (
        <>
            <div className="w-full">
                <button
                    onClick={handleAddToBasket}
                    className={`
                        w-full bg-[#70e000] text-white px-4 py-3 rounded-lg hover:bg-[#5cb800]
                        disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed
                        flex items-center justify-center
                        transition-all duration-200
                        font-bold text-lg
                        min-h-[56px]
                        shadow-sm hover:shadow-md
                    `}
                    disabled={disabled || isLoading}
                    aria-label="Agregar al carrito"
                >
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <Loader className="w-5 h-5 animate-spin" />
                            Agregando...
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            Agregar al Carrito
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

export default AddToBasketButtonNew;