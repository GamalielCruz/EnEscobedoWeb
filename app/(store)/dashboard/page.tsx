"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import { useOrderNotifications, type Order, type OrderItem } from "@/hooks/useOrderNotifications";

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

export default function DashboardPage() {
  const { user } = useUser();
  const [ownedStores, setOwnedStores] = useState<OwnedStore[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"productos" | "pedidos" | "configuracion">("pedidos");
  const [storeConfig, setStoreConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [pendingStoreUpdate, setPendingStoreUpdate] = useState<any>(null);
  const [storeImageUploading, setStoreImageUploading] = useState<"image" | "coverImage" | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const [submittingStoreUpdate, setSubmittingStoreUpdate] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});

  const store = ownedStores && ownedStores.length === 1 ? ownedStores[0] : null;

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
      console.log(`[Dashboard] Refreshed ${data.products?.length ?? 0} products`);
    } catch (err) {
      console.error("Error refrescando productos:", err);
    } finally {
      setRefreshingProducts(false);
    }
  };

  // Hook de notificaciones de pedidos
  const {
    orders,
    isLoading: ordersLoading,
    lastUpdate,
    refresh: refreshOrders,
    updateOrderLocally,
  } = useOrderNotifications({
    storeId: store?._id ?? null,
    enabled: !!store?._id && tab === "pedidos",
    pollingInterval: 49000, // Cada 49s constantes
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
    if (!user?.id) {
      setLoading(false);
      setOwnedStores([]);
      return;
    }
    fetch("/api/my-stores")
      .then((res) => res.json())
      .then((data) => {
        setOwnedStores(data.stores ?? []);
        setLoading(false);
      })
      .catch(() => {
        setOwnedStores([]);
        setLoading(false);
      });
  }, [user?.id]);

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
    if (modalOpen && availableCategories.length === 0) {
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

    setConfigLoading(true);
    // Fetch current store config and any pending update requests
    Promise.all([
      fetch(`/api/dashboard/store-config?storeId=${store._id}`).then((res) => res.json()),
      fetch(`/api/dashboard/store-update-requests?storeId=${store._id}`).then((res) => res.json())
    ])
    .then(([configData, requestsData]) => {
      if (configData.store) {
        setStoreConfig(configData.store);
      }
      if (requestsData.items && requestsData.items.length > 0) {
        // Assuming the most recent pending request is relevant
        setPendingStoreUpdate(requestsData.items[0]);
      } else {
        setPendingStoreUpdate(null);
      }
    })
    .catch((err) => console.error("Error loading store config:", err))
    .finally(() => setConfigLoading(false));

  }, [store?._id, tab]);

  const handleStoreUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store?._id || !storeConfig || submittingStoreUpdate) return;

    setSubmittingStoreUpdate(true);

    // Identify changes
    // simplified: send the whole object as changes for now, or diff it. 
    // For this implementation, we'll send the editable fields.
    const changes = {
      name: storeConfig.name,
      contact: storeConfig.contact,
      operatingHours: storeConfig.operatingHours,
      serviceTypes: storeConfig.serviceTypes,
      address: storeConfig.address,
      image: storeConfig.image,
      coverImage: storeConfig.coverImage,
    };

    try {
      const res = await fetch("/api/dashboard/store-update-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store._id, changes }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitMessage("Solicitud de actualización enviada. Un administrador revisará los cambios.");
        setPendingStoreUpdate(data.request);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => setSubmitMessage(null), 5000);
      } else {
        alert(data.error || "Error al enviar solicitud");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    } finally {
        setSubmittingStoreUpdate(false);
    }
  };

  const handleStoreImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "image" | "coverImage") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStoreImageUploading(field);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/dashboard/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setStoreConfig((prev: any) => ({ ...prev, [field]: data.asset }));
      } else {
        alert(data.error || "Error al subir imagen");
      }
    } catch (err) {
      console.error(err);
      alert("Error al subir imagen");
    } finally {
      setStoreImageUploading(null);
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
        if (newProduct.categories.length > 0) changes.categories = newProduct.categories.map((c) => ({ _type: "reference", _ref: c }));
        if (newProduct.optionGroups.length > 0) changes.optionGroups = newProduct.optionGroups;

        const body = { productId: editingProductId, changes };
        console.log('[dashboard] create update request', body);
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
          categories: newProduct.categories.length > 0 ? newProduct.categories : undefined,
          optionGroups: newProduct.optionGroups.length > 0 ? newProduct.optionGroups : undefined,
        } as any;

        const res = await fetch("/api/dashboard/store-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        // Debug: log outgoing payload
        console.log('[dashboard] submit product', { method: 'POST', body });
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
    updateOrderLocally(orderId, { status });
    
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
        setTimeout(() => refreshOrders(), 500);
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

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-lg text-center">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <Store className="w-16 h-16 text-[#ff8800] mx-auto mb-4" />
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#ff8800]" />
      </div>
    );
  }

  if (!store || ownedStores?.length !== 1) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-lg text-center">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <LayoutDashboard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin restaurante asignado</h1>
          <p className="text-gray-600 mb-4">
            Tu cuenta no tiene un restaurante asignado como dueño. En Sanity Studio, abre tu tienda
            (ej: Tienda de Crepas) y pega <strong>exactamente</strong> este ID en el campo &quot;Usuario
            Dueño (ID de Clerk)&quot;:
          </p>
          <div className="mb-6 p-3 bg-gray-100 rounded-lg text-left">
            <p className="text-xs text-gray-500 mb-1">Tu Clerk User ID (cópialo completo):</p>
            <code
              className="text-sm font-mono text-gray-900 break-all cursor-pointer select-all"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                navigator.clipboard.writeText(user?.id ?? "");
                const original = target.textContent;
                target.textContent = "¡Copiado!";
                setTimeout(() => { target.textContent = original; }, 1500);
              }}
              title="Clic para copiar"
            >
              {user?.id}
            </code>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Luego guarda la tienda y recarga esta página. No añadas espacios ni caracteres extra.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/studio" target="_blank" rel="noopener">
              <Button variant="outline">Abrir Sanity Studio</Button>
            </Link>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Recargar
            </Button>
            <Link href="/">
              <Button variant="outline">Volver al inicio</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/" className="hover:text-[#ff8800]">
            Inicio
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-900 font-medium">Dashboard</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
          <LayoutDashboard className="w-8 h-8 text-[#ff8800]" />
          Panel de {store.name}
        </h1>
        <p className="text-gray-600 mt-1">
          Gestiona tus productos y pedidos desde aquí.
        </p>
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
          Configuración
        </Button>
      </div>

      {tab === "pedidos" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Pedidos de tu restaurante
                {lastUpdate && (
                  <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Actualizado: {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
              </CardTitle>
              <CardDescription>Revisa y actualiza el estado de los pedidos en tiempo real</CardDescription>
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
                onClick={refreshOrders}
                disabled={ordersLoading}
              >
                <RefreshCw className={`w-4 h-4 ${ordersLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#ff8800]" />
              </div>
            ) : orders.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                No hay pedidos aún para tu restaurante.
              </div>
            ) : (
              <div className="space-y-8">
                {/* Pedidos Activos */}
                <div>
                   <h3 className="font-semibold text-lg text-gray-800 mb-4 flex items-center gap-2">
                     <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                     </span>
                     Pedidos Activos
                   </h3>
                   {orders.filter(o => !['completed', 'cancelled', 'delivered', 'picked_up', 'failed'].includes(o.status)).length === 0 ? (
                      <div className="p-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No tienes pedidos activos en este momento.</p>
                        <p className="text-sm text-gray-400">Los nuevos pedidos aparecerán aquí automáticamente.</p>
                      </div>
                   ) : (
                      <div className="grid gap-4">
                        {orders.filter(o => !['completed', 'cancelled', 'delivered', 'picked_up', 'failed'].includes(o.status)).map(order => (
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
                                    <span className="flex items-center gap-1"><span className="opacity-50">📞</span> {order.customerInfo.phone}</span>
                                    <span className="flex items-center gap-1"><span className="opacity-50">📧</span> {order.customerInfo.email}</span>
                                </div>
                                
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mb-3">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detalle del pedido</p>
                                    <ul className="space-y-1">
                                        {order.items.map((i, idx) => (
                                            <li key={idx} className="text-sm text-gray-800 flex justify-between">
                                                <span>{i.quantity}x {i.productName}</span>
                                                <span className="text-gray-500">{formatCurrency(i.price)}</span>
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

                {/* Pedidos Anteriores */}
                {orders.filter(o => ['completed', 'cancelled', 'delivered', 'picked_up', 'failed'].includes(o.status)).length > 0 && (
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
                                    {order.customerInfo.name} • {order.items.length} productos • {formatCurrency(order.totalAmount)}
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
                            {availableCategories.map((cat) => (
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
                          {newProduct.optionGroups.map((group, groupIdx) => (
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

      {tab === "configuracion" && (
        <Card>
          <CardHeader>
            <CardTitle>Configuración de la Tienda</CardTitle>
            <CardDescription>
              Edita la información de tu tienda. Los cambios requieren aprobación de un administrador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#ff8800]" />
              </div>
            ) : !storeConfig ? (
              <div className="text-center py-8 text-gray-500">
                No se pudo cargar la configuración de la tienda.
              </div>
            ) : (
              <div className="space-y-6">
                {pendingStoreUpdate && (
                   <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 flex items-start gap-3">
                     <Clock className="w-5 h-5 mt-0.5" />
                     <div>
                       <p className="font-semibold">Tienes cambios pendientes de aprobación</p>
                       <p className="text-sm mt-1">
                         Has enviado una solicitud de actualización el {new Date(pendingStoreUpdate.submittedAt).toLocaleDateString()}. 
                         Un administrador revisará tus cambios pronto.
                       </p>
                     </div>
                   </div>
                )}
                
                <form onSubmit={handleStoreUpdateSubmit} className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="font-medium text-gray-900 flex items-center gap-2">
                        <Store className="w-4 h-4" /> Información Básica
                      </h3>
                      <div>
                        <Label htmlFor="store-name">Nombre de la Tienda</Label>
                        <Input 
                          id="store-name" 
                          value={storeConfig.name || ''} 
                          onChange={(e) => setStoreConfig({...storeConfig, name: e.target.value})}
                          required 
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                           <Label htmlFor="contact-phone">Teléfono</Label>
                           <Input 
                             id="contact-phone" 
                             value={storeConfig.contact?.phone || ''} 
                             onChange={(e) => setStoreConfig({
                               ...storeConfig, 
                               contact: { ...storeConfig.contact, phone: e.target.value } 
                             })}
                           />
                        </div>
                        <div>
                           <Label htmlFor="contact-email">Email</Label>
                           <Input 
                             id="contact-email" 
                             value={storeConfig.contact?.email || ''} 
                             onChange={(e) => setStoreConfig({
                               ...storeConfig, 
                               contact: { ...storeConfig.contact, email: e.target.value } 
                             })}
                           />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <h3 className="font-medium text-gray-900 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" /> Imágenes
                      </h3>
                      
                      {/* Main Image */}
                      <div>
                        <Label className="mb-2 block text-xs">Logo / Imagen Principal</Label>
                        <div className="flex items-center gap-4">
                           <div className="w-20 h-20 bg-gray-100 rounded-lg border overflow-hidden flex items-center justify-center shrink-0">
                              {storeConfig.image ? (
                                <Image 
                                  src={imageUrl(storeConfig.image).url()} 
                                  alt="Logo" 
                                  width={80} 
                                  height={80} 
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Store className="w-8 h-8 text-gray-300" />
                              )}
                           </div>
                           <div>
                              <Label htmlFor="upload-logo" className="cursor-pointer inline-flex items-center gap-2 text-sm text-[#ff8800] hover:underline">
                                 {storeImageUploading === 'image' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                 Cambiar Logo
                              </Label>
                              <input 
                                id="upload-logo" 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => handleStoreImageUpload(e, 'image')}
                                disabled={!!storeImageUploading}
                              />
                           </div>
                        </div>
                      </div>

                      {/* Cover Image */}
                      <div>
                        <Label className="mb-2 block text-xs">Imagen de Portada</Label>
                         <div className="w-full h-24 bg-gray-100 rounded-lg border overflow-hidden flex items-center justify-center relative">
                              {storeConfig.coverImage ? (
                                <Image 
                                  src={imageUrl(storeConfig.coverImage).url()} 
                                  alt="Cover" 
                                  width={300} 
                                  height={100} 
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-gray-400 text-xs">Sin portada</span>
                              )}
                              
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                  <Label htmlFor="upload-cover" className="cursor-pointer text-white text-xs font-medium hover:underline p-2">
                                     Cambiar Portada
                                  </Label>
                                  <input 
                                    id="upload-cover" 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => handleStoreImageUpload(e, 'coverImage')}
                                    disabled={!!storeImageUploading}
                                  />
                              </div>
                           </div>
                           {storeImageUploading === 'coverImage' && <p className="text-xs text-[#ff8800] mt-1">Subiendo...</p>}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Address */}
                  <div className="space-y-4">
                     <h3 className="font-medium text-gray-900">Dirección</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                           <Label htmlFor="addr-street">Calle y Número</Label>
                           <Input 
                             id="addr-street" 
                             value={storeConfig.address?.street || ''} 
                             onChange={(e) => setStoreConfig({
                               ...storeConfig, 
                               address: { ...storeConfig.address, street: e.target.value } 
                             })}
                           />
                        </div>
                        <div>
                           <Label htmlFor="addr-city">Ciudad</Label>
                           <Input 
                             id="addr-city" 
                             value={storeConfig.address?.city || ''} 
                             onChange={(e) => setStoreConfig({
                               ...storeConfig, 
                               address: { ...storeConfig.address, city: e.target.value } 
                             })}
                           />
                        </div>
                        <div>
                           <Label htmlFor="addr-colonia">Colonia / Estado</Label>
                           <Input 
                             id="addr-state" 
                             value={storeConfig.address?.state || ''} 
                             onChange={(e) => setStoreConfig({
                               ...storeConfig, 
                               address: { ...storeConfig.address, state: e.target.value } 
                             })}
                           />
                        </div>
                        <div>
                            <Label htmlFor="addr-cp">Código Postal</Label>
                           <Input 
                             id="addr-cp" 
                             value={storeConfig.address?.postalCode || ''} 
                             onChange={(e) => setStoreConfig({
                               ...storeConfig, 
                               address: { ...storeConfig.address, postalCode: e.target.value } 
                             })}
                           />
                        </div>
                     </div>
                  </div>

                  <Separator />

                  {/* Operating Hours */}
                  <div className="space-y-4">
                     <h3 className="font-medium text-gray-900 flex items-center gap-2">
                       <Clock className="w-4 h-4" /> Horarios de Atención
                     </h3>
                     <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                          const label = { 'monday': 'Lunes', 'tuesday': 'Martes', 'wednesday': 'Miércoles', 'thursday': 'Jueves', 'friday': 'Viernes', 'saturday': 'Sábado', 'sunday': 'Domingo' }[day];
                          return (
                            <div key={day}>
                              <Label htmlFor={`hours-${day}`} className="text-xs text-gray-500">{label}</Label>
                              <Input 
                                id={`hours-${day}`}
                                className="h-8 text-sm"
                                value={storeConfig.operatingHours?.[day] || ''}
                                onChange={(e) => setStoreConfig({
                                  ...storeConfig,
                                  operatingHours: { ...storeConfig.operatingHours, [day]: e.target.value }
                                })}
                                placeholder="9:00 - 18:00"
                              />
                            </div>
                          );
                        })}
                     </div>
                  </div>

                  <Separator />

                  {/* Service Types */}
                  <div className="space-y-4">
                     <h3 className="font-medium text-gray-900 flex items-center gap-2">
                       <Package className="w-4 h-4" /> Tipos de Servicio
                     </h3>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-center gap-2 border p-3 rounded bg-gray-50">
                            <Checkbox 
                                id="service-delivery"
                                checked={storeConfig.serviceTypes?.delivery || false}
                                onCheckedChange={(checked) => setStoreConfig({
                                  ...storeConfig,
                                  serviceTypes: { ...storeConfig.serviceTypes, delivery: !!checked }
                                })}
                            />
                            <Label htmlFor="service-delivery">Entrega a Domicilio</Label>
                        </div>
                        <div className="flex items-center gap-2 border p-3 rounded bg-gray-50">
                             <Checkbox 
                                id="service-pickup"
                                checked={storeConfig.serviceTypes?.pickup || false}
                                onCheckedChange={(checked) => setStoreConfig({
                                  ...storeConfig,
                                  serviceTypes: { ...storeConfig.serviceTypes, pickup: !!checked }
                                })}
                            />
                            <Label htmlFor="service-pickup">Recoger en Tienda</Label>
                        </div>
                     </div>

                     {storeConfig.serviceTypes?.delivery && (
                        <div className="grid grid-cols-2 gap-4 mt-2 p-4 border rounded-lg">
                           <div>
                              <Label htmlFor="delivery-radius">Radio de Entrega (km)</Label>
                              <Input 
                                id="delivery-radius"
                                type="number"
                                value={storeConfig.serviceTypes?.deliveryRadius || ''}
                                onChange={(e) => setStoreConfig({
                                  ...storeConfig,
                                  serviceTypes: { ...storeConfig.serviceTypes, deliveryRadius: parseFloat(e.target.value) }
                                })}
                              />
                           </div>
                           <div>
                              <Label htmlFor="min-order">Pedido Mínimo (MXN)</Label>
                              <Input 
                                id="min-order"
                                type="number"
                                value={storeConfig.serviceTypes?.minimumOrderDelivery || ''}
                                onChange={(e) => setStoreConfig({
                                  ...storeConfig,
                                  serviceTypes: { ...storeConfig.serviceTypes, minimumOrderDelivery: parseFloat(e.target.value) }
                                })}
                              />
                           </div>
                        </div>
                     )}
                  </div>

                  <div className="flex justify-end pt-4">
                     <Button 
                       type="submit" 
                       className="bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900"
                       disabled={!!pendingStoreUpdate || submittingStoreUpdate}
                     >
                       {submittingStoreUpdate ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Enviando...
                          </>
                       ) : pendingStoreUpdate ? (
                          "Solicitud Pendiente"
                       ) : (
                          "Guardar y Solicitar Aprobación"
                       )}
                     </Button>
                  </div>
                </form>
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
