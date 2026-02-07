"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Package, Clock, CheckCircle, XCircle, Phone, Mail, MapPin } from "lucide-react";

interface ClickCollectOrder {
  _id: string;
  orderNumber: string;
  pickupCode: string;
  customerInfo: {
    name: string;
    email: string;
    phone: string;
  };
  storeInfo: {
    storeName: string;
    storeAddress: string;
    storePhone?: string;
  };
  items: Array<{
    _key: string;
    productName: string;
    productId: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  estimatedPickupDate: string;
  readyAt?: string;
  pickedUpAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const statusConfig = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  pending_pickup: { label: 'Pendiente de Recoger', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  processing: { label: 'Procesando', color: 'bg-blue-100 text-blue-800', icon: Package },
  ready_for_pickup: { label: 'Listo para Recoger', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  completed: { label: 'Completado', color: 'bg-gray-100 text-gray-800', icon: CheckCircle },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: XCircle },
};

export default function ClickCollectOrdersAdmin() {
  const [orders, setOrders] = useState<ClickCollectOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const url = selectedStatus === 'all' 
        ? `/api/click-collect-orders?t=${Date.now()}`
        : `/api/click-collect-orders?status=${selectedStatus}&t=${Date.now()}`;
      
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      const data = await response.json();
      
      if (data.success) {
        setOrders(data.data.orders || []);
      } else {
        setError(data.error || 'Error cargando órdenes');
      }
    } catch (err) {
      setError('Error de conexión');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderNumber: string, newStatus: string) => {
    try {
      setUpdating(orderNumber);
      
      const response = await fetch('/api/click-collect-orders', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderNumber,
          status: newStatus,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Actualizar la orden en el estado local
        setOrders(prevOrders =>
          prevOrders.map(order =>
            order.orderNumber === orderNumber
              ? { ...order, status: newStatus, updatedAt: data.data.updatedAt }
              : order
          )
        );
      } else {
        alert(`Error actualizando orden: ${data.error}`);
      }
    } catch (err) {
      console.error('Error updating order:', err);
      alert('Error de conexión al actualizar orden');
    } finally {
      setUpdating(null);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [selectedStatus]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const getStatusActions = (order: ClickCollectOrder) => {
    const actions = [];
    
    if (order.status === 'pending') {
      actions.push(
        <Button
          key="processing"
          size="sm"
          variant="outline"
          onClick={() => updateOrderStatus(order.orderNumber, 'processing')}
          disabled={updating === order.orderNumber}
        >
          Procesar
        </Button>
      );
    }
    
    if (order.status === 'processing') {
      actions.push(
        <Button
          key="ready"
          size="sm"
          variant="default"
          onClick={() => updateOrderStatus(order.orderNumber, 'ready_for_pickup')}
          disabled={updating === order.orderNumber}
        >
          Marcar Listo
        </Button>
      );
    }
    
    if (order.status === 'ready_for_pickup') {
      actions.push(
        <Button
          key="completed"
          size="sm"
          variant="default"
          onClick={() => updateOrderStatus(order.orderNumber, 'completed')}
          disabled={updating === order.orderNumber}
        >
          Completar
        </Button>
      );
    }
    
    if (['pending', 'processing'].includes(order.status)) {
      actions.push(
        <Button
          key="cancel"
          size="sm"
          variant="destructive"
          onClick={() => updateOrderStatus(order.orderNumber, 'cancelled')}
          disabled={updating === order.orderNumber}
        >
          Cancelar
        </Button>
      );
    }
    
    return actions;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Órdenes Click & Collect</h1>
          <p className="text-gray-600">Gestiona las órdenes de recogida en tienda</p>
        </div>
        <Button onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'all', label: 'Todas' },
          { value: 'pending', label: 'Pendientes' },
          { value: 'pending_pickup', label: 'Pendientes de Recoger' },
          { value: 'processing', label: 'Procesando' },
          { value: 'ready_for_pickup', label: 'Listas' },
          { value: 'completed', label: 'Completadas' },
          { value: 'cancelled', label: 'Canceladas' },
        ].map((filter) => (
          <Button
            key={filter.value}
            variant={selectedStatus === filter.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedStatus(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700">❌ {error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Cargando órdenes...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Órdenes */}
      {!loading && !error && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No hay órdenes para mostrar</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            orders.map((order) => {
              const statusInfo = statusConfig[order.status as keyof typeof statusConfig];
              const StatusIcon = statusInfo?.icon || Package;
              
              return (
                <Card key={order._id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <span>Orden {order.orderNumber}</span>
                          <Badge className={statusInfo?.color || 'bg-gray-100 text-gray-800'}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo?.label || order.status}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Código de recogida: <strong>{order.pickupCode}</strong>
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{formatCurrency(order.totalAmount)}</p>
                        <p className="text-sm text-gray-600">{order.items.length} productos</p>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {/* Información del cliente */}
                    <div>
                      <h4 className="font-semibold mb-2">👤 Cliente</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{order.customerInfo.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span>{order.customerInfo.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <span>{order.customerInfo.phone}</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Información de la tienda */}
                    <div>
                      <h4 className="font-semibold mb-2">🏪 Tienda</h4>
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="font-medium">{order.storeInfo.storeName}</p>
                          <p className="text-gray-600">{order.storeInfo.storeAddress}</p>
                          {order.storeInfo.storePhone && (
                            <p className="text-gray-600">{order.storeInfo.storePhone}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Productos */}
                    <div>
                      <h4 className="font-semibold mb-2">📦 Productos</h4>
                      <div className="space-y-2">
                        {order.items.map((item) => (
                          <div key={item._key} className="flex justify-between items-center text-sm">
                            <div>
                              <span className="font-medium">{item.productName}</span>
                              <span className="text-gray-600 ml-2">x{item.quantity}</span>
                            </div>
                            <span>{formatCurrency(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Fechas importantes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-medium">📅 Creada:</p>
                        <p className="text-gray-600">{formatDate(order.createdAt)}</p>
                      </div>
                      <div>
                        <p className="font-medium">📅 Estimada para recoger:</p>
                        <p className="text-gray-600">{formatDate(order.estimatedPickupDate)}</p>
                      </div>
                      {order.readyAt && (
                        <div>
                          <p className="font-medium">✅ Lista desde:</p>
                          <p className="text-gray-600">{formatDate(order.readyAt)}</p>
                        </div>
                      )}
                      {order.pickedUpAt && (
                        <div>
                          <p className="font-medium">📦 Recogida:</p>
                          <p className="text-gray-600">{formatDate(order.pickedUpAt)}</p>
                        </div>
                      )}
                    </div>

                    {/* Notas */}
                    {order.notes && (
                      <>
                        <Separator />
                        <div>
                          <p className="font-medium">📝 Notas:</p>
                          <p className="text-gray-600 text-sm">{order.notes}</p>
                        </div>
                      </>
                    )}

                    {/* Acciones */}
                    <Separator />
                    <div className="flex gap-2 flex-wrap">
                      {getStatusActions(order)}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}