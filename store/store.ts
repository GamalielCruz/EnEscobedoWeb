import { Product } from "@/sanity.types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const isPublicProduct = (product: Product) => {
  const approvalStatus = (product as any).approvalStatus;
  return approvalStatus !== "pending" && approvalStatus !== "rejected" && (product as any).isVisible !== false;
};

export interface BasketItem {
  product: Product;
  quantity: number;
  customizations?: { [key: string]: string | string[] };
  notes?: string;
  allergies?: string[];
  customPrice?: number;
}

interface BasketState {
  items: BasketItem[];
  currentStoreId: string | null; // Nueva propiedad para rastrear la tienda actual
  addItem: (product: BasketItem | Product) => void;
  removeItem: (productId: string) => void;
  clearBasket: () => void;
  getTotalPrice: () => number;
  getItemCount: (productId: string) => number;
  getGroupedItems: () => BasketItem[];
  getSubtotalPrice: () => number;
  canAddProduct: (product: Product) => boolean; // Nueva función para validar si se puede agregar
}

const useBasketStore = create<BasketState>()(
  persist(
    (set, get) => ({
      items: [],
      currentStoreId: null,
      
      canAddProduct: (product) => {
        const state = get();
        const productStoreId = product.affiliateStore && 
          typeof product.affiliateStore === 'object' && 
          '_id' in product.affiliateStore 
          ? (product.affiliateStore as { _id: string })._id 
          : null;
        
        // Si no hay productos en el carrito, se puede agregar cualquier producto
        if (state.items.length === 0) {
          return true;
        }
        
        // Si el producto es de la misma tienda que los productos actuales, se puede agregar
        if (state.currentStoreId === productStoreId) {
          return true;
        }
        
        // Si el producto es de una tienda diferente, no se puede agregar
        return false;
      },
      
      addItem: (product) =>
        set((state) => {
          const normalizedItem: BasketItem =
            "product" in product
              ? product
              : { product, quantity: 1 };

          const productStoreId = normalizedItem.product.affiliateStore && 
            typeof normalizedItem.product.affiliateStore === 'object' && 
            '_id' in normalizedItem.product.affiliateStore 
            ? (normalizedItem.product.affiliateStore as { _id: string })._id 
            : null;
          
          // Verificar si se puede agregar el producto
          if (!get().canAddProduct(normalizedItem.product)) {
            console.warn('No se puede agregar producto de diferente tienda');
            return state; // No hacer cambios si no se puede agregar
          }
          
          // Función para comparar personalizaciones
          const areCustomizationsEqual = (a: any, b: any) => {
            if (!a && !b) return true;
            if (!a || !b) return false;
            return JSON.stringify(a) === JSON.stringify(b);
          };

          const existingItem = state.items.find(
            (item) =>
              item.product._id === normalizedItem.product._id &&
              areCustomizationsEqual(item.customizations, normalizedItem.customizations)
              && item.notes === normalizedItem.notes
              && areCustomizationsEqual(item.allergies, normalizedItem.allergies)
          );

          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.product._id === normalizedItem.product._id &&
                areCustomizationsEqual(item.customizations, normalizedItem.customizations)
                && item.notes === normalizedItem.notes
                && areCustomizationsEqual(item.allergies, normalizedItem.allergies)
                  ? { ...item, quantity: item.quantity + (normalizedItem.quantity || 1) }
                  : item
              ),
            };
          } else {
            return {
              items: [
                ...state.items,
                {
                  product: normalizedItem.product,
                  quantity: normalizedItem.quantity || 1,
                  customizations: normalizedItem.customizations,
                  notes: normalizedItem.notes,
                  allergies: normalizedItem.allergies,
                  customPrice: normalizedItem.customPrice,
                },
              ],
              currentStoreId: productStoreId || null,
            };
          }
        }),
        
      removeItem: (productId) =>
        set((state) => {
          const newItems = state.items.reduce((acc, item) => {
            if (item.product._id === productId) {
              if (item.quantity > 1) {
                acc.push({ ...item, quantity: item.quantity - 1 });
              }
            } else {
              acc.push(item);
            }
            return acc;
          }, [] as BasketItem[]);
          
          // Si no quedan productos, limpiar currentStoreId
          return {
            items: newItems,
            currentStoreId: newItems.length === 0 ? null : state.currentStoreId
          };
        }),
        
      clearBasket: () => set({ items: [], currentStoreId: null }),
      
      getSubtotalPrice: () => {
        return get().getGroupedItems().reduce(
          (total, item) => total + (item.customPrice ?? item.product.price ?? 0) * item.quantity,
          0
        );
      },
      getTotalPrice: () => {
        return get().getGroupedItems().reduce(
          (total, item) => total + (item.customPrice ?? item.product.price ?? 0) * item.quantity,
          0
        );
      },
      getItemCount: (productId) => {
        return get().getGroupedItems()
          .filter((item) => item.product._id === productId)
          .reduce((total, item) => total + item.quantity, 0);
      },
      getGroupedItems: () => get().items.filter((item) => isPublicProduct(item.product)),
    }),
    {
      name: "basket-store",
    }
  )
);


export default useBasketStore;
