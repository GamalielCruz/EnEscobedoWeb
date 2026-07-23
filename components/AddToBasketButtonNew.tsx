"use client";
import { Product } from "@/sanity.types";
import useBasketStore from "@/store/store";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import StoreConflictAlert from "./StoreConflictAlert";

interface AddBasketButtonProps {
    product: Product;
    disabled?: boolean;
}

function AddToBasketButtonNew({ product, disabled }: AddBasketButtonProps ) {
    const store = useBasketStore();
    const [isAdded, setIsAdded] = useState(false);
    const [showConflictAlert, setShowConflictAlert] = useState(false);

    useEffect(() => {
        if (!isAdded) return;
        const timer = window.setTimeout(() => setIsAdded(false), 1200);
        return () => window.clearTimeout(timer);
    }, [isAdded]);

    const handleAddToBasket = () => {
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

        store.addItem({ product, quantity: 1 });
        setIsAdded(true);
    };

    const handleClearCartAndAdd = () => {
        if (store && typeof store.clearBasket === 'function') {
            store.clearBasket();
        }
        if (store && typeof store.addItem === 'function') {
            store.addItem({ product, quantity: 1 });
        }
        setIsAdded(true);
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
                        transition-all duration-200 motion-safe:active:scale-[0.98]
                        font-bold text-lg
                        min-h-[56px]
                        shadow-sm hover:shadow-md
                    `}
                    disabled={disabled}
                    aria-label="Agregar al carrito"
                >
                    {isAdded ? (
                        <span className="ui-enter flex items-center gap-2" aria-live="polite">
                            <Check className="h-5 w-5" />
                            Agregado
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
