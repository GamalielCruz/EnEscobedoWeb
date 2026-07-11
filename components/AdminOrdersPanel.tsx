"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle,
  Clock,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";

type AdminOrder = {
  _id: string;
  orderNumber: string;
  orderType?: "delivery" | "pickup";
  fulfillmentType: "delivery" | "pickup";
  pickupCode?: string;
  customerInfo?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  deliveryAddress?: {
    street?: string;
    city?: string;
    state?: string;
  } | null;
  storeInfo?: {
    storeName?: string;
    storeAddress?: string;
    storePhone?: string;
  };
  items: Array<{
    _key: string;
    productName?: string;
    quantity: number;
    price?: number;
    notes?: string;
  }>;
  totalAmount: number;
  paymentMethod?: string;
  status: string;
  estimatedPickupDate?: string;
  readyAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

const statusConfig: Record<
  string,
  { label: string; className: string; icon: typeof Clock }
> = {
  pending: { label: "Pendiente", className: "bg-yellow-100 text-yellow-800", icon: Clock },
  paid: { label: "Pagado", className: "bg-blue-100 text-blue-800", icon: ShoppingBag },
  pending_delivery: { label: "Pendiente entrega", className: "bg-yellow-100 text-yellow-800", icon: Clock },
  pending_pickup: { label: "Pendiente de recoger", className: "bg-yellow-100 text-yellow-800", icon: Clock },
  processing: { label: "Procesando", className: "bg-blue-100 text-blue-800", icon: Package },
  shipped: { label: "Enviado", className: "bg-indigo-100 text-indigo-800", icon: Truck },
  ready_for_pickup: { label: "Listo para recoger", className: "bg-green-100 text-green-800", icon: CheckCircle },
  delivered: { label: "Entregado", className: "bg-gray-100 text-gray-800", icon: CheckCircle },
  picked_up: { label: "Recogido", className: "bg-gray-100 text-gray-800", icon: CheckCircle },
  completed: { label: "Completado", className: "bg-gray-100 text-gray-800", icon: CheckCircle },
  cancelled: { label: "Cancelado", className: "bg-red-100 text-red-800", icon: XCircle },
  failed: { label: "Fallido", className: "bg-red-100 text-red-800", icon: XCircle },
};

const statusFilterOptions = [
  { value: "all", label: "Todos los estados" },
  { value: "pending", label: "Pendiente" },
  { value: "paid", label: "Pagado" },
  { value: "pending_delivery", label: "Pendiente entrega" },
  { value: "pending_pickup", label: "Pendiente pickup" },
  { value: "processing", label: "Procesando" },
  { value: "shipped", label: "Enviado" },
  { value: "ready_for_pickup", label: "Listo para recoger" },
  { value: "delivered", label: "Entregado" },
  { value: "picked_up", label: "Recogido" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
];

const typeFilterOptions = [
  { value: "all", label: "Todos" },
  { value: "delivery", label: "Delivery" },
  { value: "pickup", label: "Pickup" },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount ?? 0);
}

function formatDate(date?: string) {
  if (!date) {
    return "Sin fecha";
  }

  return new Date(date).toLocaleString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isTechnicalItemNote(note?: string) {
  return /^unitBasePrice=.*lineTotal=/i.test(String(note || "").trim());
}

function formatDeliveryAddress(order: AdminOrder) {
  const address = order.deliveryAddress;
  if (!address) {
    return "Sin direccion";
  }

  return [address.street, address.city, address.state].filter(Boolean).join(", ");
}

function getStatusActions(order: AdminOrder) {
  if (order.fulfillmentType === "pickup") {
    switch (order.status) {
      case "pending":
      case "pending_pickup":
      case "processing":
      case "paid":
        return [
          { label: "Orden lista", status: "ready_for_pickup", variant: "default" as const },
          { label: "Cancelar", status: "cancelled", variant: "destructive" as const },
        ];
      case "ready_for_pickup":
        return [{ label: "Marcar recogido", status: "picked_up", variant: "default" as const }];
      default:
        return [];
    }
  }

  switch (order.status) {
    case "pending":
    case "paid":
    case "pending_delivery":
      return [
        { label: "Procesar", status: "processing", variant: "outline" as const },
        { label: "Cancelar", status: "cancelled", variant: "destructive" as const },
      ];
    case "processing":
      return [{ label: "Marcar enviado", status: "shipped", variant: "default" as const }];
    case "shipped":
      return [{ label: "Marcar entregado", status: "delivered", variant: "default" as const }];
    default:
      return [];
  }
}

export default function AdminOrdersPanel() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);

  const stats = useMemo(() => {
    const delivery = orders.filter((order) => order.fulfillmentType === "delivery").length;
    const pickup = orders.filter((order) => order.fulfillmentType === "pickup").length;
    const open = orders.filter((order) => !["cancelled", "completed", "delivered", "picked_up", "failed"].includes(order.status)).length;

    return { total: orders.length, delivery, pickup, open };
  }, [orders]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedType !== "all") {
        params.set("type", selectedType);
      }
      if (selectedStatus !== "all") {
        params.set("status", selectedStatus);
      }
      if (query.trim()) {
        params.set("q", query.trim());
      }
      params.set("limit", "150");

      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Error cargando pedidos");
        setOrders([]);
        return;
      }

      setOrders(data.orders ?? []);
    } catch (err) {
      console.error("Error fetching admin orders:", err);
      setError("Error de conexion");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderNumber: string, status: string) => {
    try {
      setUpdatingOrder(orderNumber);
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderNumber, status }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || "No se pudo actualizar el pedido");
        return;
      }

      await fetchOrders();
    } catch (err) {
      console.error("Error updating admin order:", err);
      alert("Error de conexion al actualizar el pedido");
    } finally {
      setUpdatingOrder(null);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [selectedType, selectedStatus, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-gray-600">
            Vista unificada para delivery y pickup del panel administrativo.
          </p>
        </div>
        <Button onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle>{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Abiertos</CardDescription>
            <CardTitle>{stats.open}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Delivery</CardDescription>
            <CardTitle>{stats.delivery}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pickup</CardDescription>
            <CardTitle>{stats.pickup}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Busca por numero de orden, cliente, pickup code o tienda.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setQuery(searchValue);
                }
              }}
              placeholder="Buscar pedido, cliente o tienda"
              className="pl-9"
            />
          </div>
          <select
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {typeFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {statusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => setQuery(searchValue)}
            disabled={loading}
          >
            Buscar
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Cargando pedidos...</span>
          </CardContent>
        </Card>
      ) : null}

      {!loading && !error && orders.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-600">
            No hay pedidos para los filtros seleccionados.
          </CardContent>
        </Card>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {orders.map((order) => {
            const statusInfo = statusConfig[order.status] ?? {
              label: order.status,
              className: "bg-gray-100 text-gray-800",
              icon: Package,
            };
            const StatusIcon = statusInfo.icon;
            const actions = getStatusActions(order);

            return (
              <Card key={order._id}>
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>Orden {order.orderNumber}</CardTitle>
                        <Badge className={statusInfo.className}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusInfo.label}
                        </Badge>
                        <Badge variant="outline">
                          {order.fulfillmentType === "pickup" ? "Pickup" : "Delivery"}
                        </Badge>
                      </div>
                      <CardDescription>
                        {order.fulfillmentType === "pickup"
                          ? `Codigo de recogida: ${order.pickupCode || "Sin codigo"}`
                          : `Metodo de pago: ${order.paymentMethod || "No especificado"}`}
                      </CardDescription>
                    </div>
                    <div className="text-left lg:text-right">
                      <p className="text-2xl font-bold">{formatCurrency(order.totalAmount)}</p>
                      <p className="text-sm text-gray-600">{order.items.length} productos</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Cliente</p>
                      <p className="text-sm text-gray-600">{order.customerInfo?.name || "Sin nombre"}</p>
                      <p className="text-sm text-gray-600">{order.customerInfo?.email || "Sin email"}</p>
                      <p className="text-sm text-gray-600">{order.customerInfo?.phone || "Sin telefono"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Tienda</p>
                      <p className="text-sm text-gray-600">{order.storeInfo?.storeName || "Sin tienda"}</p>
                      <p className="text-sm text-gray-600">{order.storeInfo?.storeAddress || "Sin direccion"}</p>
                      <p className="text-sm text-gray-600">{order.storeInfo?.storePhone || "Sin telefono"}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-sm font-semibold text-gray-900">Productos</p>
                      <div className="space-y-2">
                        {order.items.map((item) => (
                          <div key={item._key} className="flex items-start justify-between gap-4 text-sm">
                            <div>
                              <p className="font-medium text-gray-900">
                                {item.productName || "Producto sin nombre"} x{item.quantity}
                              </p>
                              {item.notes && !isTechnicalItemNote(item.notes) ? (
                                <p className="text-gray-500">Nota: {item.notes}</p>
                              ) : null}
                            </div>
                            <span className="text-gray-600">
                              {formatCurrency((item.price ?? 0) * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Fechas</p>
                        <p className="text-sm text-gray-600">Creada: {formatDate(order.createdAt)}</p>
                        {order.fulfillmentType === "pickup" ? (
                          <p className="text-sm text-gray-600">
                            Estimada: {formatDate(order.estimatedPickupDate)}
                          </p>
                        ) : null}
                        {order.readyAt ? (
                          <p className="text-sm text-gray-600">Lista: {formatDate(order.readyAt)}</p>
                        ) : null}
                        {order.pickedUpAt ? (
                          <p className="text-sm text-gray-600">Recogida: {formatDate(order.pickedUpAt)}</p>
                        ) : null}
                        {order.deliveredAt ? (
                          <p className="text-sm text-gray-600">Entregada: {formatDate(order.deliveredAt)}</p>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Destino</p>
                        {order.fulfillmentType === "delivery" ? (
                          <div className="flex items-start gap-2 text-sm text-gray-600">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{formatDeliveryAddress(order)}</span>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">
                            Recoleccion en tienda con codigo {order.pickupCode || "pendiente"}.
                          </p>
                        )}
                      </div>
                      {order.notes ? (
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Notas</p>
                          <p className="text-sm text-gray-600">{order.notes}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {actions.length > 0 ? (
                    <>
                      <Separator />
                      <div className="flex flex-wrap gap-2">
                        {actions.map((action) => (
                          <Button
                            key={`${order.orderNumber}-${action.status}`}
                            variant={action.variant}
                            size="sm"
                            disabled={updatingOrder === order.orderNumber}
                            onClick={() => updateOrderStatus(order.orderNumber, action.status)}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
