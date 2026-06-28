"use client";

import { useEffect, useMemo, useState } from "react";
import { SignInButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Store,
  Loader2,
  ChevronRight,
  ImageIcon,
  Tag,
  Settings,
  Trash2,
  Volume2,
  Copy,
  MapPinned,
  ExternalLink,
} from "lucide-react";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import { useOrderNotifications, type Order, type OrderItem } from "@/hooks/useOrderNotifications";

type StoreServiceTypes = {
  delivery?: boolean;
  pickup?: boolean;
  deliveryRadius?: number;
  minimumOrderDelivery?: number;
  onDemand?: boolean;
  onDemandExtraMinutes?: number;
};

type OwnedStore = { _id: string; name: string; storeId?: string };
type Product = {
  _id: string;
  name: string;
  slug?: string;
  price: number;
  stock?: number;
  image?: { _ref?: string } | null;
  approvalStatus?: "pending" | "approved" | "rejected";
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "Pagado", color: "bg-blue-100 text-blue-800" },
  pending_delivery: { label: "Pendiente entrega", color: "bg-yellow-100 text-yellow-800" },
  pending_pickup: { label: "Pendiente de Recoger", color: "bg-yellow-100 text-yellow-800" },
  processing: { label: "Procesando", color: "bg-blue-100 text-blue-800" },
  shipped: { label: "Enviado", color: "bg-indigo-100 text-indigo-800" },
  ready_for_pickup: { label: "Listo para Recoger", color: "bg-green-100 text-green-800" },
  completed: { label: "Completado", color: "bg-gray-100 text-gray-800" },
  delivered: { label: "Entregado", color: "bg-gray-100 text-gray-800" },
  picked_up: { label: "Recogido", color: "bg-gray-100 text-gray-800" },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-800" },
  failed: { label: "Fallido", color: "bg-red-100 text-red-800" },
};

const finalStatuses = ["completed", "cancelled", "delivered", "picked_up", "failed"];

const getLocalDayBounds = () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
};

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  
  // Add global error handlers to catch redirect triggers
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('🚨 [Dashboard] Global Error:', event.error);
      console.error('🚨 [Dashboard] Error message:', event.message);
      console.error('🚨 [Dashboard] Error stack:', event.error?.stack);
    };
    
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error('🚨 [Dashboard] Unhandled Promise Rejection:', event.reason);
    };
    
    
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);
  
  const [ownedStores, setOwnedStores] = useState<OwnedStore[] | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [allStores, setAllStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"productos" | "pedidos" | "configuracion">("pedidos");
  const [ordersView, setOrdersView] = useState<"today" | "history">("today");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [storeConfig, setStoreConfig] = useState<any | null>(null);
  const [storeConfigLoading, setStoreConfigLoading] = useState(false);
  const [savingStoreConfig, setSavingStoreConfig] = useState(false);

  const store = ownedStores?.find(s => s._id === selectedStoreId) || null;

  // Función para refrescar productos
  const refreshProducts = async () => {
    if (!store?._id) return;
    setRefreshingProducts(true);
    try {
      const res = await fetch(`/api/dashboard/store-products?storeId=${store._id}&t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch (err) {
      console.error('🚨 [Dashboard] Error refrescando productos:', err);
      if (err instanceof Error && err.message.includes('401')) {
        console.error('🚨 [Dashboard] Sesión expirada al cargar productos');
      }
    } finally {
      setRefreshingProducts(false);
    }
  };

  const [dayBounds] = useState(() => getLocalDayBounds());
  const { startAt: todayStartAt, endAt: todayEndAt } = dayBounds;
  const todayQueryParams = useMemo(
    () => ({
      scope: "today",
      startAt: todayStartAt,
      endAt: todayEndAt,
    }),
    [todayStartAt, todayEndAt]
  );
  const historyQueryParams = useMemo(
    () => ({
      scope: "history",
      beforeAt: todayStartAt,
    }),
    [todayStartAt]
  );

  // Hook de pedidos del dia
  const {
    orders: todayOrders,
    isLoading: todayOrdersLoading,
    lastUpdate: todayLastUpdate,
    refresh: refreshTodayOrders,
    updateOrderLocally: updateTodayOrderLocally,
  } = useOrderNotifications({
    storeId: store?._id ?? null,
    enabled: !!store?._id && tab === "pedidos" && ordersView === "today",
    pollingInterval: 49000,
    queryParams: todayQueryParams,
  });

  // Historial bajo demanda para no cargarlo siempre
  const {
    orders: historyOrders,
    isLoading: historyOrdersLoading,
    lastUpdate: historyLastUpdate,
    refresh: refreshHistoryOrders,
    updateOrderLocally: updateHistoryOrderLocally,
  } = useOrderNotifications({
    storeId: store?._id ?? null,
    enabled: !!store?._id && tab === "pedidos" && ordersView === "history",
    pollingInterval: 0,
    queryParams: historyQueryParams,
  });

  // Estado completo del producto
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    description: "",
    stock: "",
    image: null as { _type: string; asset: { _type: string; _ref: string } } | null,
    categories: [] as string[],
    optionGroups: [] as Array<{
      _key: string;
      title: string;
      description: string;
      required: boolean;
      selectionType: "single" | "multiple";
      options: Array<{
        _key: string;
        label: string;
        description: string;
        priceDelta: number;
        isDefault: boolean;
      }>;
    }>,
  });
  
  const [availableCategories, setAvailableCategories] = useState<
    Array<{ _id: string; title: string }>
  >([]);
  const [modalOpen, setModalOpen] = useState(false);

  // Reset modal state when it closes
  useEffect(() => {
    if (!modalOpen) {
      setEditingProductId(null);
      setNewProduct({
        name: "",
        price: "",
        description: "",
        stock: "",
        image: null,
        categories: [],
        optionGroups: [],
      });
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!user?.id) {
      setLoading(false);
      setOwnedStores([]);
      return;
    }
    fetch("/api/my-stores")
      .then((res) => {
        if (!res.ok) {
          console.error('🚨 [Dashboard] API Error - Status:', res.status, res.statusText);
        }
        return res.json();
      })
      .then((data) => {
        const stores = data.stores ?? [];
        setOwnedStores(stores);
        setLoading(false);
      })
      .catch((error) => {
        console.error('� [Dashboard] Error fetching stores:', error);
        console.error('🚨 [Dashboard] Error stack:', error?.stack);
        setOwnedStores([]);
        setLoading(false);
      });
  }, [isLoaded, user?.id]);

  useEffect(() => {
    if (ownedStores && ownedStores?.length > 0 && !selectedStoreId) {
      const firstStoreWithId = ownedStores.find((s) => !!s._id);
      if (firstStoreWithId?._id) {
        setSelectedStoreId(firstStoreWithId._id);
      }
    }
  }, [ownedStores, selectedStoreId]);

  const fetchAllStores = async () => {
    try {
      const res = await fetch("/api/dashboard/all-stores");
      const data = await res.json();
      if (data.stores) setAllStores(data.stores);
    } catch (error) {
      console.error("Error fetching all stores:", error);
    }
  };

  const claimStore = async (storeId: string) => {
    if (!confirm("¿Estás seguro de que eres el dueño de esta tienda?")) return;
    try {
      const res = await fetch("/api/dashboard/claim-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Tienda asignada correctamente. Recargando...");
        window.location.reload();
      } else {
        alert(data.error || "Error al reclamar tienda");
      }
    } catch (error) {
      alert("Error de conexión");
    }
  };

  useEffect(() => {
    if (!store?._id) return;
    if (tab === "productos") {
      setProductsLoading(true);
      const timestamp = Date.now();
      const fetchOptions = {
        cache: "no-store" as RequestCache,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      };
      Promise.all([
        fetch(`/api/dashboard/store-products?storeId=${store._id}&t=${timestamp}`, fetchOptions).then((res) => res.json()),
        fetch(`/api/dashboard/product-update-requests?t=${timestamp}`, fetchOptions).then((res) => res.json()),
      ])
        .then(([productsData, requestsData]) => {
          setProducts(productsData.products ?? []);
          // Build map of product IDs with pending changes
          const pending: Record<string, boolean> = {};
          if (requestsData.items) {
            requestsData.items.forEach((req: any) => {
              if (req.product?._id) pending[req.product._id] = true;
            });
          }
          setPendingChanges(pending);
          setProductsLoading(false);
        })
        .catch(() => setProductsLoading(false));

      // Refrescar productos cada 10 segundos cuando estamos en la pestaña de productos
      const interval = setInterval(() => {
        const refreshTimestamp = Date.now();
        Promise.all([
          fetch(`/api/dashboard/store-products?storeId=${store._id}&t=${refreshTimestamp}`, fetchOptions).then((res) => res.json()),
          fetch(`/api/dashboard/product-update-requests?t=${refreshTimestamp}`, fetchOptions).then((res) => res.json()),
        ])
          .then(([productsData, requestsData]) => {
            setProducts(productsData.products ?? []);
            const pending: Record<string, boolean> = {};
            if (requestsData.items) {
              requestsData.items.forEach((req: any) => {
                if (req.product?._id) pending[req.product._id] = true;
              });
            }
            setPendingChanges(pending);
          })
          .catch((err) => console.error("Error en auto-refresh:", err));
      }, 10000);

      return () => clearInterval(interval);
    }
    // Nota: Los pedidos ahora se manejan via useOrderNotifications polling
  }, [store?._id, tab]);

  // Cargar categorías cuando se abre el modal
  useEffect(() => {
    if (modalOpen && availableCategories?.length === 0) {
      fetch("/api/dashboard/categories")
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setAvailableCategories(data.categories ?? []);
          }
        })
        .catch((err) => console.error("Error cargando categorías:", err));
    }
  }, [modalOpen, availableCategories.length]);

  // Load Store Configuration
  useEffect(() => {
    if (!store?._id || tab !== "configuracion") return;

    setStoreConfigLoading(true);
    fetch(`/api/dashboard/store-config?storeId=${store._id}&t=${Date.now()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setStoreConfig(data.store ?? null);
      })
      .catch((error) => {
        console.error("Error cargando configuracion de tienda:", error);
        setStoreConfig(null);
      })
      .finally(() => setStoreConfigLoading(false));
  }, [store?._id, tab]);

  const saveStoreServiceTypes = async (nextServiceTypes: StoreServiceTypes) => {
    if (!store?._id) return;

    setSavingStoreConfig(true);
    try {
      const res = await fetch("/api/dashboard/store-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store._id,
          serviceTypes: nextServiceTypes,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo guardar la configuracion");
      }

      setStoreConfig(data.store);
      setSubmitMessage("Configuracion de restaurante actualizada.");
      setTimeout(() => setSubmitMessage(null), 5000);
    } catch (error: any) {
      console.error("Error guardando configuracion de tienda:", error);
      alert(error.message || "Error al guardar configuracion");
    } finally {
      setSavingStoreConfig(false);
    }
  };


  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store?._id || !newProduct.name || !newProduct.price) return;
    setAddingProduct(true);
    try {
      // If editingProductId is set, create a productUpdateRequest, else create product (POST)
      if (editingProductId) {
        const changes: any = {};
        if (newProduct.name) changes.name = newProduct.name.trim();
        if (newProduct.price) changes.price = parseFloat(newProduct.price);
        if (newProduct.stock) changes.stock = parseInt(newProduct.stock, 10);
        if (newProduct.description) changes.description = [
          {
            _type: "block",
            _key: `desc-${Date.now()}`,
            style: "normal",
            children: [{ _type: "span", _key: "span", text: String(newProduct.description) }],
            markDefs: [],
          },
        ];
        if (newProduct.image) changes.image = newProduct.image;
        if (newProduct.categories?.length > 0) changes.categories = newProduct.categories.map((c) => ({ _type: "reference", _ref: c }));
        if (newProduct.optionGroups?.length > 0) changes.optionGroups = newProduct.optionGroups;

        const body = { productId: editingProductId, changes };
        const res = await fetch("/api/dashboard/product-update-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          setSubmitMessage("Cambios enviados para revisión. El ejecutivo backend los aprobará pronto.");
          // Marcar producto como con cambios pendientes
          setPendingChanges((prev) => ({ ...prev, [editingProductId]: true }));
          // Refrescar lista de productos después de crear solicitud
          await refreshProducts();
        } else {
          alert(data.error || "Error al crear solicitud de cambio");
        }
      } else {
        const body = {
          storeId: store._id,
          name: newProduct.name.trim(),
          price: parseFloat(newProduct.price),
          description: newProduct.description.trim() || undefined,
          stock: newProduct.stock ? parseInt(newProduct.stock, 10) : undefined,
          image: newProduct.image,
          categories: newProduct.categories?.length > 0 ? newProduct.categories : undefined,
          optionGroups: newProduct.optionGroups?.length > 0 ? newProduct.optionGroups : undefined,
        } as any;

        const res = await fetch("/api/dashboard/store-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        // Debug: log outgoing payload
        const data = await res.json();
        if (data.success) {
          setProducts((prev) => [...prev, data.product]);
          setSubmitMessage("Producto enviado para revisión. El ejecutivo backend lo aprobará pronto.");
        } else {
          alert(data.error || "Error al crear producto");
        }
      }
      setModalOpen(false);
      setTimeout(() => setSubmitMessage(null), 5000);
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    } finally {
      setAddingProduct(false);
    }
  };

  const openEditModal = (p: Product) => {
    setEditingProductId(p._id);
    setNewProduct((_) => ({
      name: p.name || "",
      price: String(p.price ?? ""),
      description: "",
      stock: p.stock != null ? String(p.stock) : "",
      image: (p as any).image ?? null,
      categories: [],
      optionGroups: [],
    }));
    setModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/dashboard/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setNewProduct((prev) => ({ ...prev, image: data.asset }));
      } else {
        alert(data.error || "Error al subir imagen");
      }
    } catch (err) {
      console.error(err);
      alert("Error al subir imagen");
    } finally {
      setUploadingImage(false);
    }
  };


  const handleUpdateOrderStatus = async (orderId: string, orderNumber: string, status: string) => {
    // Actualización optimista
    updateTodayOrderLocally(orderId, { status });
    updateHistoryOrderLocally(orderId, { status });
    
    setUpdatingOrder(orderNumber);
    try {
      const res = await fetch("/api/dashboard/store-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, status }),
      });
      const data = await res.json();
      if (data.success) {
        // Forzar un refresco inmediato de los datos del servidor
        setTimeout(() => {
          refreshTodayOrders();
          refreshHistoryOrders();
        }, 500);
      } else {
        alert(data.error || "Error al actualizar pedido");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    } finally {
      setUpdatingOrder(null);
    }
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleString("es-MX", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

  const isSameDay = (dateValue: string, referenceDate: Date) => {
    const parsedDate = new Date(dateValue);

    return (
      parsedDate.getFullYear() === referenceDate.getFullYear() &&
      parsedDate.getMonth() === referenceDate.getMonth() &&
      parsedDate.getDate() === referenceDate.getDate()
    );
  };

  const today = new Date();
  const todayActiveOrders = todayOrders.filter((order) => !finalStatuses.includes(order.status));
  const todayCompletedOrders = todayOrders.filter((order) => finalStatuses.includes(order.status));
  const currentOrders = ordersView === "today" ? todayOrders : historyOrders;
  const currentOrdersLoading = ordersView === "today" ? todayOrdersLoading : historyOrdersLoading;
  const currentLastUpdate = ordersView === "today" ? todayLastUpdate : historyLastUpdate;
  const refreshCurrentOrders = ordersView === "today" ? refreshTodayOrders : refreshHistoryOrders;
  const orders = currentOrders;
  const activeOrders = todayActiveOrders;
  const completedTodayOrders = ordersView === "today" ? todayCompletedOrders : [];
  const previousDaysOrders = ordersView === "history" ? historyOrders : [];

  const renderOrderStatusOptions = (order: Order) => (
    <>
      <optgroup label="Flujo de Trabajo">
        <option value="pending">Pendiente (Recibido)</option>
        <option value="processing">Preparando comida</option>
        {order.deliveryMethod === "home_delivery" ? (
          <>
            <option value="shipped">Repartidor en camino</option>
            <option value="delivered">Entregado (Finalizar)</option>
          </>
        ) : (
          <>
            <option value="ready_for_pickup">Listo para Recoger</option>
            <option value="picked_up">Recogido (Finalizar)</option>
          </>
        )}
      </optgroup>

      <optgroup label="Otras Acciones">
        <option value="cancelled">Cancelar Pedido</option>
      </optgroup>
    </>
  );

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copiado`);
    } catch (error) {
      console.error(`Error copiando ${label}:`, error);
      alert(`No se pudo copiar ${label.toLowerCase()}`);
    }
  };

  const buildAddressLabel = (order: Order) => {
    const address = order.deliveryAddress;
    if (!address) return "";

    return [
      address.line1,
      address.line2,
      [address.postal_code, address.city].filter(Boolean).join(" "),
      address.state,
      address.country,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const getCustomizationTitle = (
    custom: NonNullable<OrderItem["customizations"]>[number],
    item: OrderItem
  ) => {
    if (custom.title && !/^group-\d+$/.test(custom.title)) {
      return custom.title;
    }

    const match = custom.title?.match(/^group-(\d+)$/);
    const index = match ? Number(match[1]) : -1;
    const fallbackTitle =
      index >= 0 ? item.productOptionGroups?.[index]?.title : undefined;

    return fallbackTitle || custom.title || "Opcion";
  };

  if (!isLoaded || loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#ff8800]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-lg text-center">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <Store className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Panel del Restaurante</h1>
          <p className="text-gray-600 mb-6">
            Inicia sesión para gestionar tu restaurante, productos y pedidos.
          </p>
          <SignInButton mode="modal">
            <Button size="lg" className="bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900 font-semibold">
              Iniciar sesión
            </Button>
          </SignInButton>
        </div>
      </div>
    );
  }


if (!store || ownedStores?.length !== 1) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-lg text-center">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <LayoutDashboard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin restaurante asignado</h1>
          <p className="text-gray-600 mb-8">
            Tu cuenta no tiene un restaurante asociado. Selecciona uno de la lista para reclamarlo como tuyo.
          </p>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 text-left">
            {allStores.map((s) => {
              const isOwner = user?.id === s.ownerClerkUserId;
              return (
              <div key={s._id} className="border rounded-lg p-4 hover:border-[#ff8800] transition-colors relative">
                <h3 className="font-semibold text-lg mb-1">{s.name}</h3>
                <p className="text-xs text-gray-500 mb-3">ID: {s._id.slice(0, 8)}...</p>
                
                {s.ownerClerkUserId ? (
                  <div className="mt-2">
                    <span className={`text-xs px-2 py-1 rounded ${isOwner ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {isOwner ? '¡Eres el dueño!' : `Dueño: ${s.ownerClerkUserId.slice(0, 10)}...`}
                    </span>
                    
                    {isOwner ? (
                        <Button 
                          className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => {
                              // Manually set as owned store to bypass API lag if any
                              setOwnedStores([s]);
                              setSelectedStoreId(s._id);
                          }}
                        >
                          Acceder al Panel
                        </Button>
                    ) : (
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={() => {
                        if (confirm(`¿FORZAR reclamo de ${s.name}? Esto eliminará al dueño actual.`)) {
                           // Force claim logic
                           fetch("/api/dashboard/claim-store", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ storeId: s._id, force: true }),
                           })
                           .then(res => res.json())
                           .then(data => {
                              if (data.success) {
                                alert("Tienda reclamada forzosamente. Recargando...");
                                window.location.reload();
                              } else {
                                alert(data.error || "Error");
                              }
                           });
                        }
                      }}
                    >
                      Forzar Reclamo (Debug)
                    </Button>
                    )}
                  </div>
                ) : (
                  <Button 
                    className="w-full bg-[#ff8800] hover:bg-[#ff8800]/90 text-white"
                    onClick={() => claimStore(s._id)}
                  >
                    Reclamar Tienda
                  </Button>
                )}
              </div>
            ); })}
          </div>
          
          <div className="mt-8">
            <Button variant="outline" onClick={() => { fetchAllStores(); }}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Actualizar lista
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/" className="hover:text-[#eb1902]">
            Inicio
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-900 font-medium">Manager</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
          <LayoutDashboard className="w-8 h-8 text-[#eb1902]" />
          {store.name}
        </h1>
        {submitMessage && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
            ✓ {submitMessage}
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === "pedidos" ? "default" : "outline"}
          onClick={() => setTab("pedidos")}
          className={tab === "pedidos" ? "bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900" : ""}
        >
          <ShoppingBag className="w-4 h-4 mr-2" />
          Pedidos
        </Button>
        <Button
          variant={tab === "productos" ? "default" : "outline"}
          onClick={() => setTab("productos")}
          className={tab === "productos" ? "bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900" : ""}
        >
          <Package className="w-4 h-4 mr-2" />
          Productos
        </Button>
        <Button
          variant={tab === "configuracion" ? "default" : "outline"}
          onClick={() => setTab("configuracion")}
          className={tab === "configuracion" ? "bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900" : ""}
        >
          <Settings className="w-4 h-4 mr-2" />
          Configuracion
        </Button>
      </div>

      {tab === "pedidos" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Pedidos de tu restaurante
                {currentLastUpdate && (
                  <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Actualizado: {currentLastUpdate.toLocaleTimeString()}
                  </span>
                )}
              </CardTitle>
              <CardDescription>Hoy muestra solo las ordenes del dia. El historial se consulta aparte para mantener el dashboard agil.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const audio = new Audio("/sounds/audio.mp3");
                  audio.play().catch(e => console.error("Error audio:", e));
                }}
                title="Probar sonido"
              >
                <Volume2 className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshCurrentOrders}
                disabled={currentOrdersLoading}
              >
                <RefreshCw className={`w-4 h-4 ${currentOrdersLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={ordersView} onValueChange={(value) => setOrdersView(value as "today" | "history")} className="mb-6 w-full">
              <TabsList className="grid w-full grid-cols-2 md:w-[320px]">
                <TabsTrigger value="today">Hoy</TabsTrigger>
                <TabsTrigger value="history">Historial</TabsTrigger>
              </TabsList>
            </Tabs>
            {currentOrdersLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#ff8800]" />
              </div>
            ) : currentOrders.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                {ordersView === "today" ? "No hay pedidos para hoy." : "No hay pedidos en el historial todavia."}
              </div>
            ) : (
              <div className="space-y-8">
                {ordersView === "today" && (
                <>
                {/* Pedidos Activos */}
                <div>
                   <h3 className="font-semibold text-lg text-gray-800 mb-4 flex items-center gap-2">
                     <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                     </span>
                     Pedidos Activos
                   </h3>
                   {activeOrders.length === 0 ? (
                      <div className="p-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No tienes pedidos activos en este momento.</p>
                        <p className="text-sm text-gray-400">Los nuevos pedidos aparecerán aquí automáticamente.</p>
                      </div>
                   ) : (
                      <div className="grid gap-4">
                        {activeOrders.map(order => (
                          <div
                            key={order._id}
                            className="border-l-4 border-l-[#ff8800] shadow-sm bg-white rounded-r-xl border-y border-r p-5 hover:shadow-md transition-all relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                <ShoppingBag className="w-24 h-24" />
                            </div>
                            
                            <div className="flex flex-wrap items-start justify-between gap-4 relative z-10">
                              <div className="flex-1 min-w-[280px]">
                                <div className="flex items-center gap-3 mb-2">
                                    <Badge className={`${statusConfig[order.status]?.color ?? "bg-gray-100"} text-base px-3 py-1`}>
                                      {statusConfig[order.status]?.label ?? order.status}
                                    </Badge>
                                    <Badge variant="outline" className="border-orange-100 text-[#ff8800] bg-orange-50/50">
                                      {order.deliveryMethod === 'home_delivery' ? '🛵 Domicilio' : '🛍️ Recoger'}
                                    </Badge>
                                    <span className="text-xs font-mono text-gray-400">#{order.pickupCode || order.orderNumber.slice(-8)}</span>
                                </div>
                                <h4 className="font-bold text-gray-900 text-lg mb-1">
                                  {order.customerInfo.name}
                                </h4>
                                <div className="text-sm text-gray-600 mb-3 flex flex-col gap-1">
                                    <span className="flex items-center gap-2">
                                      <span className="opacity-50">📞</span>
                                      <span>{order.customerInfo.phone || "Sin telefono"}</span>
                                      {order.customerInfo.phone && (
                                        <button
                                          type="button"
                                          onClick={() => copyToClipboard(order.customerInfo.phone, "Telefono")}
                                          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
                                        >
                                          <Copy className="h-3 w-3" />
                                          Copiar
                                        </button>
                                      )}
                                    </span>
                                    <span className="flex items-center gap-1"><span className="opacity-50">📧</span> {order.customerInfo.email}</span>
                                </div>
                                
                                {order.deliveryMethod === "home_delivery" && buildAddressLabel(order) && (
                                  <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
                                      Ubicacion del pedido
                                    </p>
                                    <p className="text-sm text-blue-900">
                                      {buildAddressLabel(order)}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => copyToClipboard(buildAddressLabel(order), "Ubicacion")}
                                        className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100"
                                      >
                                        <Copy className="h-3 w-3" />
                                        Copiar ubicacion
                                      </button>
                                      <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buildAddressLabel(order))}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100"
                                      >
                                        <MapPinned className="h-3 w-3" />
                                        Ver en Google Maps
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                  </div>
                                )}
                                
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mb-3">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detalle del pedido</p>
                                    <ul className="space-y-2">
                                        {(order.items || []).map((i, idx) => (
                                            <li key={idx} className="text-sm">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-gray-800">{i.quantity}x {i.productName}</span>
                                                    <span className="text-gray-500">{formatCurrency(i.price)}</span>
                                                </div>
                                                {i.customizations && i.customizations.length > 0 && (
                                                    <div className="mt-1 ml-4 space-y-0.5">
                                                        {i.customizations.map((custom, cidx) => (
                                                            <div key={cidx} className="text-xs text-gray-600">
                                                                <span className="font-medium text-gray-500">{getCustomizationTitle(custom, i)}:</span>
                                                                <span className="ml-1">
                                                                    {custom.options?.map((opt, oidx) => (
                                                                        <span key={oidx}>
                                                                            {opt.label}
                                                                            {opt.priceDelta && opt.priceDelta > 0 ? (
                                                                                <span className="text-green-600"> (+{formatCurrency(opt.priceDelta)})</span>
                                                                            ) : null}
                                                                            {oidx < (custom.options?.length || 0) - 1 ? ", " : ""}
                                                                        </span>
                                                                    ))}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {i.notes && (
                                                    <p className="mt-1 ml-4 text-xs text-amber-600 italic">
                                                        📝 {i.notes}
                                                    </p>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-3 pt-2 border-t border-gray-200 flex justify-between items-center">
                                        <span className="font-semibold text-gray-900">Total</span>
                                        <span className="font-bold text-lg text-[#ff8800]">{formatCurrency(order.totalAmount)}</span>
                                    </div>
                                </div>

                                {order.notes && (
                                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs font-bold text-yellow-800 flex items-center gap-1">
                                        <span className="text-base">📝</span> NOTAS DEL CLIENTE:
                                    </p>
                                    <p className="text-sm text-yellow-800 mt-1 italic">"{order.notes}"</p>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col items-end gap-3 min-w-[200px]">
                                <div className="text-right">
                                    <p className="text-xs text-gray-400">Recibido:</p>
                                    <p className="text-sm font-medium text-gray-600">{formatDate(order.createdAt)}</p>
                                </div>
                                
                                <div className="w-full bg-gray-50 p-4 rounded-lg border border-gray-100 mt-2">
                                    <Label className="mb-2 block text-xs font-semibold text-gray-500">ACTUALIZAR ESTADO</Label>
                                    <select
                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-[#ff8800] focus:ring focus:ring-[#ff8800] focus:ring-opacity-50 p-2 border cursor-pointer font-medium"
                                        value={order.status}
                                        onChange={(e) => handleUpdateOrderStatus(order._id, order.orderNumber, e.target.value)}
                                        disabled={!!updatingOrder}
                                    >
                                        <optgroup label="Flujo de Trabajo">
                                          <option value="pending">🟡 Pendiente (Recibido)</option>
                                          <option value="processing">👨‍🍳 Preparando comida</option>
                                          {order.deliveryMethod === "home_delivery" ? (
                                            <>
                                              <option value="shipped">🛵 Repartidor en camino</option>
                                              <option value="delivered">✅ Entregado (Finalizar)</option>
                                            </>
                                          ) : (
                                            <>
                                              <option value="ready_for_pickup">📦 Listo para Recoger</option>
                                              <option value="picked_up">🏁 Recogido (Finalizar)</option>
                                            </>
                                          )}
                                        </optgroup>
                                        
                                        <optgroup label="Otras Acciones">
                                          <option value="cancelled">❌ Cancelar Pedido</option>
                                        </optgroup>
                                    </select>
                                    {updatingOrder === order.orderNumber && (
                                      <div className="flex items-center justify-center mt-2 text-[#ff8800] text-xs animate-pulse">
                                          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Actualizando...
                                      </div>
                                    )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                   )}
                </div>
                </>
                )}

                {completedTodayOrders.length > 0 && (
                  <div className="border-t pt-8">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 font-semibold text-gray-800">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          Historial del dia
                        </h3>
                        <p className="text-sm text-gray-500">
                          Aqui se muestran las ordenes finalizadas hoy para mantener limpia la operacion activa.
                        </p>
                      </div>
                      <Badge className="border border-green-200 bg-green-50 text-green-700 hover:bg-green-50">
                        {completedTodayOrders.length} finalizadas hoy
                      </Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {completedTodayOrders.map((order) => (
                        <div key={order._id} className="rounded-xl border border-green-100 bg-green-50/60 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-800">Orden #{order.orderNumber}</p>
                                <Badge variant="outline" className="bg-white/80">
                                  {statusConfig[order.status]?.label ?? order.status}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-gray-600">
                                {order.customerInfo.name} • {order.items?.length || 0} productos
                              </p>
                            </div>
                            <p className="text-right text-xs text-gray-500">{formatDate(order.createdAt)}</p>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                            <span className="text-gray-500">
                              {order.deliveryMethod === "home_delivery" ? "Entrega a domicilio" : "Recoger en tienda"}
                            </span>
                            <span className="font-semibold text-[#ff8800]">{formatCurrency(order.totalAmount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {previousDaysOrders.length > 0 && (
                  <div className="border-t pt-8">
                    <div className="mb-4">
                      <h3 className="mb-1 flex items-center gap-2 font-semibold text-gray-700">
                        <Clock className="w-5 h-5" />
                        Historial de pedidos
                      </h3>
                      <p className="text-sm text-gray-500">
                        Revisa a detalle las ordenes anteriores sin cargar todo el historico en la vista principal.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {previousDaysOrders.map((order) => (
                        <div key={order._id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 hover:bg-white transition-colors">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-[260px] flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${["completed", "delivered", "picked_up"].includes(order.status) ? "bg-green-500" : "bg-red-500"}`}></span>
                                <p className="font-semibold text-gray-700">Orden #{order.orderNumber}</p>
                                <Badge variant="outline" className="bg-white text-xs font-normal">
                                  {statusConfig[order.status]?.label ?? order.status}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-gray-500">
                                {order.customerInfo.name} • {order.items?.length || 0} productos • {formatCurrency(order.totalAmount)}
                              </p>
                              <p className="mt-1 text-xs text-gray-400">
                                Creado: {formatDate(order.createdAt)}
                              </p>
                            </div>
                            <div className="w-full max-w-xs rounded-lg border border-gray-200 bg-white p-3">
                              <p className="text-xs font-semibold text-gray-500">RESUMEN</p>
                              <p className="mt-2 text-sm text-gray-600">
                                {order.deliveryMethod === "home_delivery" ? "Entrega a domicilio" : "Recoger en tienda"}
                              </p>
                              <p className="mt-1 text-sm text-gray-600">
                                {order.customerInfo.phone || "Sin telefono"}
                              </p>
                              <p className="mt-3 text-lg font-bold text-[#ff8800]">
                                {formatCurrency(order.totalAmount)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pedidos Anteriores */}
                {false && orders.filter(o => ['completed', 'cancelled', 'delivered', 'picked_up', 'failed'].includes(o.status)).length > 0 && (
                  <div className="border-t pt-8">
                    <h3 className="font-semibold text-gray-500 mb-4 flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Historial de Pedidos
                    </h3>
                     <div className="space-y-3">
                        {orders.filter(o => ['completed', 'cancelled', 'delivered', 'picked_up', 'failed'].includes(o.status)).map(order => (
                          <div key={order._id} className="border rounded-lg p-4 bg-gray-50 hover:bg-white transition-colors flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${order.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    <p className="font-semibold text-gray-700">Orden #{order.orderNumber}</p>
                                    <Badge variant="outline" className="text-xs font-normal">
                                        {statusConfig[order.status]?.label ?? order.status}
                                    </Badge>
                                </div>
                                <p className="text-sm text-gray-500 mt-1">
                                    {order.customerInfo.name} • {order.items?.length || 0} productos • {formatCurrency(order.totalAmount)}
                                </p>
                            </div>
                            <div className="text-right text-xs text-gray-400">
                                {formatDate(order.createdAt)}
                            </div>
                          </div>
                        ))}
                     </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "configuracion" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-[#ff8800]" />
              Configuracion del restaurante
            </CardTitle>
            <CardDescription>
              Ajusta avisos operativos que afectan lo que ve el cliente en domicilio y retiro en local.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {storeConfigLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#ff8800]" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-lg border p-4 bg-gray-50">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">Modo Alta Demanda</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Activalo cuando el restaurante tenga varios pedidos. El cliente vera un aviso y un tiempo estimado mayor.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={savingStoreConfig || !storeConfig}
                      onClick={() => {
                        const current = storeConfig?.serviceTypes || {};
                        saveStoreServiceTypes({
                          ...current,
                          onDemand: !current.onDemand,
                          onDemandExtraMinutes: Number(current.onDemandExtraMinutes ?? 15),
                        });
                      }}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
                        storeConfig?.serviceTypes?.onDemand ? "bg-[#ff8800]" : "bg-gray-300"
                      }`}
                      aria-pressed={Boolean(storeConfig?.serviceTypes?.onDemand)}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          storeConfig?.serviceTypes?.onDemand ? "translate-x-7" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <Label htmlFor="on-demand-extra">Minutos extra cuando Alta Demanda esta activa</Label>
                      <Input
                        id="on-demand-extra"
                        type="number"
                        min="0"
                        value={String(storeConfig?.serviceTypes?.onDemandExtraMinutes ?? 15)}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setStoreConfig((prev: any) => ({
                            ...prev,
                            serviceTypes: {
                              ...(prev?.serviceTypes || {}),
                              onDemandExtraMinutes: value,
                            },
                          }));
                        }}
                        disabled={savingStoreConfig || !storeConfig}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Por default el pedido se estima en 10 minutos. Con Alta Demanda se suman estos minutos.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => saveStoreServiceTypes(storeConfig?.serviceTypes || {})}
                      disabled={savingStoreConfig || !storeConfig}
                      className="bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900"
                    >
                      {savingStoreConfig ? "Guardando..." : "Guardar tiempo"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "productos" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Productos de tu restaurante</CardTitle>
              <CardDescription>Añade y gestiona los productos de tu menú</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshProducts}
                disabled={refreshingProducts}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${refreshingProducts ? "animate-spin" : ""}`} />
                {refreshingProducts ? "Actualizando..." : "Actualizar"}
              </Button>
              <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900">
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo producto
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingProductId ? "Editar producto" : "Añadir producto"}</DialogTitle>
                  <DialogDescription>
                    {editingProductId
                      ? "Edita los datos del producto y guarda los cambios aquí."
                      : "Completa todos los datos del nuevo producto como lo harías en Sanity Studio."}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddProduct}>
                  <Tabs defaultValue="basic" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="basic">Básico</TabsTrigger>
                      <TabsTrigger value="media">Imagen y Categorías</TabsTrigger>
                      <TabsTrigger value="options">Opciones</TabsTrigger>
                    </TabsList>

                    {/* Tab Básico */}
                    <TabsContent value="basic" className="space-y-4">
                      <div>
                        <Label htmlFor="name">Nombre del producto *</Label>
                        <Input
                          id="name"
                          value={newProduct.name}
                          onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Ej: Crepa de Nutella"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="price">Precio (MXN) *</Label>
                          <Input
                            id="price"
                            type="number"
                            step="0.01"
                            min="0"
                            value={newProduct.price}
                            onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="stock">Inventario</Label>
                          <Input
                            id="stock"
                            type="number"
                            min="0"
                            value={newProduct.stock}
                            onChange={(e) => setNewProduct((p) => ({ ...p, stock: e.target.value }))}
                            placeholder="Opcional"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="description">Descripción</Label>
                        <Textarea
                          id="description"
                          value={newProduct.description}
                          onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
                          placeholder="Describe el producto en detalle..."
                          rows={5}
                          className="resize-none"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Esta descripción se convertirá en contenido enriquecido en Sanity.
                        </p>
                      </div>
                    </TabsContent>

                    {/* Tab Imagen y Categorías */}
                    <TabsContent value="media" className="space-y-4">
                      <div>
                        <Label htmlFor="image" className="flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" />
                          Imagen del producto
                        </Label>
                        <div className="mt-2 space-y-3">
                          {newProduct.image ? (
                            <div className="relative border rounded-lg p-4 bg-gray-50">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm text-green-600 font-medium">✓ Imagen subida</p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setNewProduct((p) => ({ ...p, image: null }))}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                              <p className="text-xs text-gray-500">ID: {newProduct.image.asset._ref}</p>
                            </div>
                          ) : (
                            <div className="border-2 border-dashed rounded-lg p-6 text-center">
                              <ImageIcon className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                              <Label htmlFor="image-upload" className="cursor-pointer">
                                <span className="text-sm text-[#ff8800] hover:underline">
                                  {uploadingImage ? "Subiendo..." : "Selecciona una imagen"}
                                </span>
                              </Label>
                              <input
                                id="image-upload"
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                                disabled={uploadingImage}
                              />
                              {uploadingImage && (
                                <div className="mt-2">
                                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#ff8800]" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <Label className="flex items-center gap-2 mb-3">
                          <Tag className="w-4 h-4" />
                          Categorías
                        </Label>
                        {availableCategories.length > 0 ? (
                          <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                            {(availableCategories || []).map((cat) => (
                              <div key={cat._id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`cat-${cat._id}`}
                                  checked={newProduct.categories.includes(cat._id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setNewProduct((p) => ({
                                        ...p,
                                        categories: [...p.categories, cat._id],
                                      }));
                                    } else {
                                      setNewProduct((p) => ({
                                        ...p,
                                        categories: p.categories.filter((id) => id !== cat._id),
                                      }));
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`cat-${cat._id}`}
                                  className="cursor-pointer text-sm font-normal"
                                >
                                  {cat.title}
                                </Label>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 italic">
                            No hay categorías disponibles. Crea categorías en Sanity Studio primero.
                          </p>
                        )}
                      </div>
                    </TabsContent>

                    {/* Tab Opciones */}
                    <TabsContent value="options" className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <Settings className="w-4 h-4" />
                          Grupos de Opciones de Personalización
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setNewProduct((p) => ({
                              ...p,
                              optionGroups: [
                                ...p.optionGroups,
                                {
                                  _key: `group-${Date.now()}`,
                                  title: "",
                                  description: "",
                                  required: false,
                                  selectionType: "single",
                                  options: [],
                                },
                              ],
                            }));
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Añadir grupo
                        </Button>
                      </div>

                      {newProduct.optionGroups.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed rounded-lg">
                          <Settings className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">
                            No hay grupos de opciones. Ej: Tamaño, Ingredientes, etc.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                          {(newProduct.optionGroups || []).map((group, groupIdx) => (
                            <Card key={group._key} className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-start justify-between">
                                  <h4 className="text-sm font-semibold">Grupo {groupIdx + 1}</h4>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setNewProduct((p) => ({
                                        ...p,
                                        optionGroups: p.optionGroups.filter((_, i) => i !== groupIdx),
                                      }));
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </div>

                                <div>
                                  <Label htmlFor={`group-title-${groupIdx}`}>Título del grupo *</Label>
                                  <Input
                                    id={`group-title-${groupIdx}`}
                                    value={group.title}
                                    onChange={(e) => {
                                      setNewProduct((p) => ({
                                        ...p,
                                        optionGroups: p.optionGroups.map((g, i) =>
                                          i === groupIdx ? { ...g, title: e.target.value } : g
                                        ),
                                      }));
                                    }}
                                    placeholder="Ej: Tamaño"
                                  />
                                </div>

                                <div>
                                  <Label htmlFor={`group-desc-${groupIdx}`}>Descripción</Label>
                                  <Input
                                    id={`group-desc-${groupIdx}`}
                                    value={group.description}
                                    onChange={(e) => {
                                      setNewProduct((p) => ({
                                        ...p,
                                        optionGroups: p.optionGroups.map((g, i) =>
                                          i === groupIdx ? { ...g, description: e.target.value } : g
                                        ),
                                      }));
                                    }}
                                    placeholder="Opcional"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`group-req-${groupIdx}`}
                                      checked={group.required}
                                      onCheckedChange={(checked) => {
                                        setNewProduct((p) => ({
                                          ...p,
                                          optionGroups: p.optionGroups.map((g, i) =>
                                            i === groupIdx ? { ...g, required: !!checked } : g
                                          ),
                                        }));
                                      }}
                                    />
                                    <Label htmlFor={`group-req-${groupIdx}`}>Obligatorio</Label>
                                  </div>

                                  <div>
                                    <Label htmlFor={`group-sel-${groupIdx}`}>Tipo de selección</Label>
                                    <Select
                                      value={group.selectionType}
                                      onValueChange={(value: "single" | "multiple") => {
                                        setNewProduct((p) => ({
                                          ...p,
                                          optionGroups: p.optionGroups.map((g, i) =>
                                            i === groupIdx ? { ...g, selectionType: value } : g
                                          ),
                                        }));
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="single">Una opción</SelectItem>
                                        <SelectItem value="multiple">Múltiples</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <Separator />

                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <Label className="text-xs">Opciones</Label>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setNewProduct((p) => ({
                                          ...p,
                                          optionGroups: p.optionGroups.map((g, i) =>
                                            i === groupIdx
                                              ? {
                                                  ...g,
                                                  options: [
                                                    ...g.options,
                                                    {
                                                      _key: `opt-${Date.now()}`,
                                                      label: "",
                                                      description: "",
                                                      priceDelta: 0,
                                                      isDefault: false,
                                                    },
                                                  ],
                                                }
                                              : g
                                          ),
                                        }));
                                      }}
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      Añadir opción
                                    </Button>
                                  </div>

                                  {group.options.length === 0 ? (
                                    <p className="text-xs text-gray-500 italic">
                                      Sin opciones. Ej: Pequeño, Mediano, Grande
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {group.options.map((option, optIdx) => (
                                        <div
                                          key={option._key}
                                          className="border rounded p-2 bg-gray-50 space-y-2"
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium">
                                              Opción {optIdx + 1}
                                            </span>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => {
                                                setNewProduct((p) => ({
                                                  ...p,
                                                  optionGroups: p.optionGroups.map((g, i) =>
                                                    i === groupIdx
                                                      ? {
                                                          ...g,
                                                          options: g.options.filter(
                                                            (_, j) => j !== optIdx
                                                          ),
                                                        }
                                                      : g
                                                  ),
                                                }));
                                              }}
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </Button>
                                          </div>

                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <Label
                                                htmlFor={`opt-label-${groupIdx}-${optIdx}`}
                                                className="text-xs"
                                              >
                                                Etiqueta *
                                              </Label>
                                              <Input
                                                id={`opt-label-${groupIdx}-${optIdx}`}
                                                value={option.label}
                                                onChange={(e) => {
                                                  setNewProduct((p) => ({
                                                    ...p,
                                                    optionGroups: p.optionGroups.map((g, i) =>
                                                      i === groupIdx
                                                        ? {
                                                            ...g,
                                                            options: g.options.map((o, j) =>
                                                              j === optIdx
                                                                ? { ...o, label: e.target.value }
                                                                : o
                                                            ),
                                                          }
                                                        : g
                                                    ),
                                                  }));
                                                }}
                                                placeholder="Ej: Grande"
                                                className="h-8 text-sm"
                                              />
                                            </div>

                                            <div>
                                              <Label
                                                htmlFor={`opt-price-${groupIdx}-${optIdx}`}
                                                className="text-xs"
                                              >
                                                Costo adicional
                                              </Label>
                                              <Input
                                                id={`opt-price-${groupIdx}-${optIdx}`}
                                                type="number"
                                                step="0.01"
                                                value={option.priceDelta}
                                                onChange={(e) => {
                                                  setNewProduct((p) => ({
                                                    ...p,
                                                    optionGroups: p.optionGroups.map((g, i) =>
                                                      i === groupIdx
                                                        ? {
                                                            ...g,
                                                            options: g.options.map((o, j) =>
                                                              j === optIdx
                                                                ? {
                                                                    ...o,
                                                                    priceDelta: parseFloat(
                                                                      e.target.value
                                                                    ) || 0,
                                                                  }
                                                                : o
                                                            ),
                                                          }
                                                        : g
                                                    ),
                                                  }));
                                                }}
                                                placeholder="0.00"
                                                className="h-8 text-sm"
                                              />
                                            </div>
                                          </div>

                                          <div className="flex items-center space-x-2">
                                            <Checkbox
                                              id={`opt-default-${groupIdx}-${optIdx}`}
                                              checked={option.isDefault}
                                              onCheckedChange={(checked) => {
                                                setNewProduct((p) => ({
                                                  ...p,
                                                  optionGroups: p.optionGroups.map((g, i) =>
                                                    i === groupIdx
                                                      ? {
                                                          ...g,
                                                          options: g.options.map((o, j) =>
                                                            j === optIdx
                                                              ? { ...o, isDefault: !!checked }
                                                              : o
                                                          ),
                                                        }
                                                      : g
                                                  ),
                                                }));
                                              }}
                                            />
                                            <Label
                                              htmlFor={`opt-default-${groupIdx}-${optIdx}`}
                                              className="text-xs"
                                            >
                                              Seleccionada por defecto
                                            </Label>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>

                    <DialogFooter className="mt-6">
                    <DialogClose asChild>
                      <Button type="button" variant="outline">
                        Cancelar
                      </Button>
                    </DialogClose>
                    <Button
                      type="submit"
                      disabled={addingProduct}
                      className="bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900"
                    >
                        {addingProduct ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : editingProductId ? (
                          "Guardar cambios"
                        ) : (
                          "Crear producto"
                        )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#ff8800]" />
              </div>
            ) : products.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                No hay productos. Añade el primero con el botón &quot;Nuevo producto&quot;.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((p) => (
                  <div
                    key={p._id}
                    className="border rounded-lg p-3 flex items-center gap-3 hover:bg-gray-50/50"
                  >
                    <div className="w-14 h-14 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                      {p.image ? (
                        <Image
                          src={imageUrl(p.image).url()}
                          alt={p.name}
                          width={56}
                          height={56}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-sm font-semibold text-[#ff8800]">
                        {formatCurrency(p.price)}
                      </p>
                      {p.approvalStatus === "pending" && (
                        <Badge className="mt-1 bg-yellow-100 text-yellow-800">Pendiente de revisión</Badge>
                      )}
                      {p.approvalStatus === "rejected" && (
                        <Badge className="mt-1 bg-red-100 text-red-800">Rechazado</Badge>
                      )}
                      {pendingChanges[p._id] && !p.approvalStatus && (
                        <Badge className="mt-1 bg-blue-100 text-blue-800">Cambios pendientes de aprobación</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(p)} disabled={p.approvalStatus === "pending"}>
                      {p.approvalStatus === "pending" ? "Esperando..." : "Editar"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-6 text-center text-sm text-gray-500">
        <Link href="/" className="hover:text-[#ff8800]">
          ← Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
