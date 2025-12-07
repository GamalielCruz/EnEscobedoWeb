"use client";

import { useState, useCallback } from "react";

export interface StoreInfo {
  storeId: string;
  name: string;
  address: string;
  phone: string;
  distanceKm?: number;
  estimatedDelivery?: string;
}

export interface SearchResult {
  found: boolean;
  store?: StoreInfo;
  error?: string;
}

export interface AddressInput {
  street: string;
  city?: string;
  state?: string;
  country?: string;
}

export function useStoreSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);

  const searchNearestStore = useCallback(async (address: AddressInput | string) => {
    console.log("🔍 Iniciando búsqueda de tiendas con:", address);
    setIsSearching(true);
    setSearchResult(null);

    try {
      // Primero verificar que hay tiendas disponibles
      console.log("📡 Obteniendo lista de tiendas...");
      const storesResponse = await fetch("/api/nearest-store", {
        method: "GET",
      });

      const storesData = await storesResponse.json();
      console.log("🏪 Respuesta de tiendas:", storesData);

      if (!storesData.success || !storesData.data?.stores?.length) {
        console.log("❌ No hay tiendas disponibles");
        setSearchResult({
          found: false,
          error: "No hay tiendas disponibles en este momento"
        });
        return { success: false, error: "No hay tiendas disponibles" };
      }

      console.log(`✅ Encontradas ${storesData.data.stores.length} tiendas disponibles`);

      // Preparar la dirección para la búsqueda
      let addressObj: AddressInput;
      
      if (typeof address === "string") {
        addressObj = {
          street: address,
          city: "Pedro Escobedo",
          state: "Querétaro",
          country: "México"
        };
      } else {
        addressObj = {
          city: "Pedro Escobedo",
          state: "Querétaro",
          country: "México",
          ...address
        };
      }

      // Buscar la tienda más cercana
      console.log("🎯 Buscando tienda más cercana con dirección:", addressObj);
      const searchResponse = await fetch("/api/nearest-store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: addressObj,
          useGoogleMaps: false // Usar OpenStreetMap para evitar problemas de API key
        }),
      });

      const searchData = await searchResponse.json();
      console.log("🎯 Respuesta de búsqueda:", searchData);

      if (searchData.success && searchData.data?.store) {
        const store = searchData.data.store;
        const storeInfo: StoreInfo = {
          storeId: store.id || store.storeId || "store-1",
          name: store.name || store.storeName || "Tienda Principal",
          address: store.address || store.storeAddress || "Dirección no disponible",
          phone: store.phone || store.storePhone || "Teléfono no disponible",
          distanceKm: store.distanceKm || 0,
          estimatedDelivery: store.estimatedDelivery || "1-2 días hábiles"
        };

        setSearchResult({
          found: true,
          store: storeInfo
        });

        return { success: true, store: storeInfo };
      } else {
        console.log("⚠️ Búsqueda por ubicación falló, usando primera tienda disponible como fallback");
        
        // Fallback: usar la primera tienda disponible
        const firstStore = storesData.data.stores[0];
        const storeInfo: StoreInfo = {
          storeId: firstStore._id || firstStore.id || "store-1",
          name: firstStore.name || "Tienda Principal",
          address: firstStore.address?.street || firstStore.address || "Pedro Escobedo, Querétaro",
          phone: firstStore.phone || "+52 442 123 4567",
          distanceKm: 2.5, // Distancia estimada
          estimatedDelivery: "1-2 días hábiles"
        };

        console.log("🏪 Usando tienda fallback:", storeInfo);

        setSearchResult({
          found: true,
          store: storeInfo
        });

        return { success: true, store: storeInfo };
      }
    } catch (error) {
      console.error("Error searching for stores:", error);
      const errorMessage = "Error al buscar tiendas. Por favor intenta de nuevo.";
      setSearchResult({
        found: false,
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setSearchResult(null);
  }, []);

  const saveStoreToLocalStorage = useCallback((store: StoreInfo) => {
    try {
      // Verificar que estamos en el cliente
      if (typeof window === 'undefined') return;
      
      localStorage.setItem('nearestStore', JSON.stringify(store));
      localStorage.setItem('clickCollectStore', JSON.stringify({
        storeId: store.storeId,
        storeName: store.name,
        storeAddress: store.address,
        storePhone: store.phone,
        estimatedDelivery: store.estimatedDelivery
      }));
    } catch (error) {
      console.error("Error saving store to localStorage:", error);
    }
  }, []);

  const getStoredStore = useCallback((): StoreInfo | null => {
    try {
      // Verificar que estamos en el cliente
      if (typeof window === 'undefined') return null;
      
      const stored = localStorage.getItem('nearestStore');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error("Error reading stored store:", error);
      return null;
    }
  }, []);

  return {
    isSearching,
    searchResult,
    searchNearestStore,
    clearResult,
    saveStoreToLocalStorage,
    getStoredStore
  };
}