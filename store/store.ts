import { Product } from "@/sanity.types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface BasketItem {
  product: Product;
  quantity: number;
}

interface BasketState {
  items: BasketItem[];
  currentStoreId: string | null; // Nueva propiedad para rastrear la tienda actual
  addItem: (product: Product) => void;
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
          const productStoreId = product.affiliateStore && 
            typeof product.affiliateStore === 'object' && 
            '_id' in product.affiliateStore 
            ? (product.affiliateStore as { _id: string })._id 
            : null;
          
          // Verificar si se puede agregar el producto
          if (!get().canAddProduct(product)) {
            console.warn('No se puede agregar producto de diferente tienda');
            return state; // No hacer cambios si no se puede agregar
          }
          
          const existingItem = state.items.find(
            (item) => item.product._id === product._id
          );
          
          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.product._id === product._id
                  ? { ...item, quantity: item.quantity + 1 }
                  : item
              ),
            };
          } else {
            return { 
              items: [...state.items, { product, quantity: 1 }],
              currentStoreId: productStoreId || null
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
        return get().items.reduce(
          (total, item) => total + (item.product.price ?? 0) * item.quantity,
          0
        );
      },
      getTotalPrice: () => {
        return get().items.reduce(
          (total, item) => total + (item.product.price ?? 0) * item.quantity,
          0
        );
      },
      getItemCount: (productId) => {
        const item = get().items.find((item) => item.product._id === productId);
        return item ? item.quantity : 0;
      },
      getGroupedItems: () => get().items,
    }),
    {
      name: "basket-store",
    }
  )
);


export default useBasketStore;