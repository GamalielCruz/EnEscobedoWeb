import { useEffect, useRef, useState, useCallback } from 'react';

export type OrderItem = { productName: string; productId: string; quantity: number; price: number };

export type Order = {
  _id: string;
  orderNumber: string;
  pickupCode: string;
  customerInfo: { name: string; email: string; phone: string };
  storeInfo: { storeName: string; storeAddress: string; storePhone?: string };
  items: OrderItem[];
  totalAmount: number;
  status: string;
  estimatedPickupDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deliveryMethod?: "click_collect" | "home_delivery";
};

interface UseOrderNotificationsOptions {
  storeId: string | null;
  enabled: boolean;
  onNewOrder?: (order: Order) => void;
  pollingInterval?: number; // en milisegundos, default 15000 (15 segundos)
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
  enabled,
  onNewOrder,
  pollingInterval = 15000,
}: UseOrderNotificationsOptions): UseOrderNotificationsReturn {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const previousOrderIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoadRef = useRef(true);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

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
    if (!storeId || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`/api/dashboard/store-orders?storeId=${storeId}`);
      
      if (!res.ok) {
        throw new Error('Error al cargar pedidos');
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
      
      setOrders(fetchedOrders);
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
  }, [storeId, enabled, onNewOrder, playNotificationSound]);

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

    // Calcular intervalo
    const getPollingInterval = () => {
      // Si hay errores recientes, aumentar el intervalo para proteger la red
      if (retryCountRef.current >= maxRetries) {
        return 30000; // 30 segundos si hay problemas de conexión
      }
      
      return pollingInterval; // Usar el intervalo solicitado (default 15s)
    };

    // Configurar intervalo
    const intervalValue = getPollingInterval();
    intervalRef.current = setInterval(fetchOrders, intervalValue);

    // Limpiar al desmontar
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, storeId, fetchOrders, pollingInterval]); // Eliminado 'orders' de aquí para evitar bucle

  const updateOrderLocally = useCallback((orderId: string, updates: Partial<Order>) => {
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
