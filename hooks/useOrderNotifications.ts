import { useEffect, useRef, useState, useCallback } from 'react';

export type OrderItem = { 
  productName: string; 
  productId: string; 
  quantity: number; 
  price: number;
  productOptionGroups?: Array<{
    title?: string;
  }>;
  customizations?: Array<{
    title?: string;
    options?: Array<{
      label?: string;
      priceDelta?: number;
    }>;
  }>;
  notes?: string;
};

export type Order = {
  _id: string;
  orderNumber: string;
  pickupCode: string;
  customerInfo: { name: string; email: string; phone: string };
  deliveryAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  storeInfo: { storeName: string; storeAddress: string; storePhone?: string };
  items: OrderItem[];
  totalAmount: number;
  status: string;
  estimatedPickupDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deliveryMethod?: "click_collect" | "home_delivery";
  fulfillmentProvider?: "pickup" | "restaurant_delivery" | "elmenu_delivery" | "third_party_logistics";
  deliveryVerificationStatus?: "pending" | "verified" | "locked" | "overridden" | "not_required";
};

interface UseOrderNotificationsOptions {
  storeId: string | null;
  enabled: boolean;
  onNewOrder?: (order: Order) => void;
  pollingInterval?: number; // en milisegundos, default 15000 (15 segundos)
  queryParams?: Record<string, string>;
}

interface UseOrderNotificationsReturn {
  orders: Order[];
  isLoading: boolean;
  lastUpdate: Date | null;
  error: string | null;
  refresh: () => void;
  updateOrderLocally: (orderId: string, updates: Partial<Order>) => void;
}

export function useOrderNotifications({
  storeId,
  enabled = true,
  pollingInterval = 30000,
  onNewOrder,
  queryParams,
}: UseOrderNotificationsOptions): UseOrderNotificationsReturn {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Referencia para el audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Referencias para tracking de pedidos y actualizaciones locales
  const previousOrderIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  
  // Referencia para tracking de actualizaciones locales recientes
  const recentLocalUpdatesRef = useRef<Map<string, { timestamp: number; updates: Partial<Order> }>>(new Map());
  const serializedQueryParams = JSON.stringify(queryParams ?? {});

  // Inicializar el audio
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('/sounds/audio.mp3');
      audioRef.current.volume = 0.7; // 70% volumen
    }
    return () => {
      audioRef.current = null;
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0; // Reiniciar al principio
      audioRef.current.play().catch((err) => {
        console.warn('No se pudo reproducir el sonido de notificación:', err);
      });
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    const normalizedStoreId =
      typeof storeId === "string" &&
      storeId.trim() !== "" &&
      storeId !== "null" &&
      storeId !== "undefined"
        ? storeId
        : null;

    if (!normalizedStoreId || !enabled) {
      return;
    }


    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        storeId: normalizedStoreId,
        ...JSON.parse(serializedQueryParams),
      });

      const res = await fetch(`/api/dashboard/store-orders?${params.toString()}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorDetails: string | undefined = errorText;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed?.details && typeof parsed.details === 'object') {
            errorDetails = JSON.stringify(parsed.details);
          } else {
            errorDetails = parsed?.error || parsed?.details || errorText;
          }
        } catch {
          errorDetails = errorText;
        }

        console.error('🚨 [useOrderNotifications] API Error:', res.status, res.statusText, errorDetails);
        if (res.status === 401) {
          console.error('🚨 [useOrderNotifications] Unauthorized - Session may have expired');
        }
        throw new Error(`Error al cargar pedidos: ${res.status} ${res.statusText}${errorDetails ? ` - ${errorDetails}` : ''}`);
      }

      const data = await res.json();
      const fetchedOrders: Order[] = data.orders ?? [];
      

      // Detectar nuevos pedidos comparando IDs
      if (!isFirstLoadRef.current) {
        const currentOrderIds = new Set(fetchedOrders.map((o) => o._id));
        const newOrderIds = Array.from(currentOrderIds).filter(
          (id) => !previousOrderIdsRef.current.has(id)
        );

        if (newOrderIds.length > 0) {
          // Hay nuevos pedidos!
          playNotificationSound();
          
          // Llamar callback si existe
          if (onNewOrder) {
            const newOrders = fetchedOrders.filter((o) => newOrderIds.includes(o._id));
            newOrders.forEach((order) => onNewOrder(order));
          }
        }
      }

      // Actualizar referencias
      previousOrderIdsRef.current = new Set(fetchedOrders.map((o) => o._id));
      isFirstLoadRef.current = false;
      
      // Mezclar datos del servidor con cambios locales recientes
      const now = Date.now();
      const mergedOrders = fetchedOrders.map(fetchedOrder => {
        const localUpdate = recentLocalUpdatesRef.current.get(fetchedOrder._id);
        
        // Si hay una actualización local reciente (menos de 10 segundos), preservarla
        if (localUpdate && (now - localUpdate.timestamp) < 10000) {
          return { ...fetchedOrder, ...localUpdate.updates };
        }
        
        return fetchedOrder;
      });
      
      // Limpiar actualizaciones locales antiguas
      recentLocalUpdatesRef.current.forEach((update, orderId) => {
        if ((now - update.timestamp) >= 10000) {
          recentLocalUpdatesRef.current.delete(orderId);
        }
      });
      
      setOrders(mergedOrders);
      setLastUpdate(new Date());
      retryCountRef.current = 0; // Reset retry count on success
      
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      
      // Incrementar contador de reintentos
      retryCountRef.current += 1;
      
    } finally {
      setIsLoading(false);
    }
  }, [storeId, enabled, onNewOrder, playNotificationSound, serializedQueryParams]);

  const refresh = useCallback(() => {
    isFirstLoadRef.current = true; // Forzar sonido de notificación si hay nuevos
    fetchOrders();
  }, [fetchOrders]);

  // Configurar polling
  useEffect(() => {
    if (!enabled || !storeId) {
      // Limpiar intervalo si se deshabilita
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Fetch inicial
    fetchOrders();

    // Configurar intervalo
    if (pollingInterval > 0) {
      intervalRef.current = setInterval(fetchOrders, pollingInterval);
    }

    // Limpiar al desmontar
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, storeId, fetchOrders, pollingInterval]);

  const updateOrderLocally = useCallback((orderId: string, updates: Partial<Order>) => {
    // Registrar la actualización local con timestamp
    recentLocalUpdatesRef.current.set(orderId, {
      timestamp: Date.now(),
      updates
    });
    
    
    setOrders((prev) => 
      prev.map((o) => (o._id === orderId ? { ...o, ...updates } : o))
    );
  }, []);

  return {
    orders,
    isLoading,
    lastUpdate,
    error,
    refresh,
    updateOrderLocally,
  };
}
