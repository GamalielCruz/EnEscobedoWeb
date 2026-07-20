"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, Package } from "lucide-react";
import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";
import DeliveryZonesAdmin from "@/components/DeliveryZonesAdmin";

type PendingProduct = {
  _id: string;
  source?: "request" | "product";
  product?: { _id: string; name?: string; affiliateStore?: { _id: string; name: string } } | null;
  submittedBy?: string;
  submittedAt?: string;
  status?: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  changes?: {
    name?: string;
    price?: number;
    stock?: number;
    description?: any;
    image?: unknown;
    categories?: any[];
    optionGroups?: any[];
  } | null;
};

type PendingStoreUpdate = {
  _id: string;
  store: { _id: string; name: string };
  submittedBy: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  changes?: any;
};

export default function PendingProductsPage() {
  const [productItems, setProductItems] = useState<PendingProduct[]>([]);
  const [storeItems, setStoreItems] = useState<PendingStoreUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"products" | "stores" | "delivery">("products");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRejectId, setSelectedRejectId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 60 seconds to catch updates from other admins or approvals
    const interval = setInterval(() => {
      fetchData(false);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const timestamp = Date.now();
      const headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      };

      const [updatesRes, productsRes, storesRes] = await Promise.all([
        fetch(`/api/dashboard/product-update-requests?t=${timestamp}`, { cache: "no-store", headers }),
        fetch(`/api/dashboard/pending-products?t=${timestamp}`, { cache: "no-store", headers }),
        fetch(`/api/dashboard/store-update-requests?t=${timestamp}`, { cache: "no-store", headers })
      ]);

      if (updatesRes.status === 401 || productsRes.status === 401 || storesRes.status === 401) {
        throw new Error("Sesion expirada");
      }

      const updatesData = await updatesRes.json();
      const productsData = await productsRes.json();
      const storesData = await storesRes.json();

      if (updatesData.success && productsData.success) {
        const newProducts = (productsData.items ?? []).map((product: any) => ({
          _id: product._id,
          source: "product" as const,
          product: { _id: product._id, name: product.name, affiliateStore: product.affiliateStore },
          submittedBy: product.submittedBy,
          submittedAt: product.submittedAt,
          status: "pending" as const,
          changes: product.pendingChanges ?? product,
        }));
        setProductItems([
          ...(updatesData.items ?? []).map((item: PendingProduct) => ({ ...item, source: "request" as const })),
          ...newProducts,
        ].sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? ""))));
      }
      if (storesData.success) {
        setStoreItems(storesData.items ?? []);
      }
    } catch (err) {
      console.error("Error fetching pending items:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleApprove = async (id: string, type: "product" | "store") => {
    setApprovingId(id);
    const product = productItems.find((item) => item._id === id);
    const endpoint = type === "product" 
      ? `/api/dashboard/${product?.source === "product" ? "pending-products" : "product-update-requests"}/${id}/approve`
      : `/api/dashboard/store-update-requests/${id}/approve`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      
      if (data.success) {
        if (type === "product") {
            setProductItems((prev) => prev.filter((item) => item._id !== id));
        } else {
            setStoreItems((prev) => prev.filter((item) => item._id !== id));
        }
        // Refetch after a short delay
        setTimeout(() => fetchData(false), 500);
      } else if (res.status === 400 && (data.error?.includes("already approved") || data.error?.includes("Status actual: approved"))) {
        if (type === "product") {
            setProductItems((prev) => prev.filter((item) => item._id !== id));
        } else {
            setStoreItems((prev) => prev.filter((item) => item._id !== id));
        }
      } else {
        alert(data.error || "Error al aprobar");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectClick = (id: string) => {
    setSelectedRejectId(id);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedRejectId) return;
    setRejectingId(selectedRejectId);
    try {
      const isProduct = productItems.some(i => i._id === selectedRejectId);
      const product = productItems.find((item) => item._id === selectedRejectId);
      const endpoint = isProduct 
        ? `/api/dashboard/${product?.source === "product" ? "pending-products" : "product-update-requests"}/${selectedRejectId}/reject`
        : `/api/dashboard/store-update-requests/${selectedRejectId}/reject`;

      const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason || undefined }),
        }
      );
      const data = await res.json();
      if (data.success) {
        if (isProduct) {
            setProductItems((prev) => prev.filter((item) => item._id !== selectedRejectId));
        } else {
            setStoreItems((prev) => prev.filter((item) => item._id !== selectedRejectId));
        }
        setRejectDialogOpen(false);
        setSelectedRejectId(null);
        setRejectReason("");
        // Refetch after a short delay
        setTimeout(() => fetchData(false), 500);
      } else {
        alert(data.error || "Error al rechazar");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    } finally {
      setRejectingId(null);
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-lg text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#ff8800]" />
        <p className="text-gray-600 mt-4">Cargando...</p>
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
          <span className="text-gray-900 font-medium">Panel de Aprobación</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Solicitudes de Aprobación</h1>
        <p className="text-gray-600 mt-1">
          Revisa y aprueba cambios enviados por los dueños de tiendas.
        </p>
      </div>

      <Tabs defaultValue="products" value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="products">
                <Package className="w-4 h-4 mr-2" />
                Productos ({productItems.length})
            </TabsTrigger>
            <TabsTrigger value="stores">
                <Store className="w-4 h-4 mr-2" />
                Tiendas ({storeItems.length})
            </TabsTrigger>
            <TabsTrigger value="delivery">
                <Store className="w-4 h-4 mr-2" />
                Envios
            </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
            <Card>
                <CardHeader>
                <CardTitle>Productos Pendientes</CardTitle>
                <CardDescription>
                    Nuevos productos o actualizaciones de productos existentes.
                </CardDescription>
                </CardHeader>
                <CardContent>
                {loading ? (
                    <div className="py-12 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#ff8800]" />
                    </div>
                ) : productItems.length === 0 ? (
                    <div className="py-12 text-center text-gray-500">
                    No hay productos pendientes.
                    </div>
                ) : (
                    <div className="space-y-4">
                    {productItems.map((item) => (
                        <div
                        key={item._id}
                        className="border rounded-lg p-4 hover:bg-gray-50/50 transition-colors"
                        >
                        <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <p className="font-semibold text-gray-900 text-lg">{item.product?.name || 'Producto'}</p>
                                <p className="text-sm text-gray-600">
                                Tienda: {item.product?.affiliateStore?.name || "Desconocida"}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                Enviado: {item.submittedAt ? formatDate(item.submittedAt) : '—'}
                                </p>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                                <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>
                            </div>
                            </div>

                            {/* Show pending changes */}
                            {item.changes && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                                <p className="font-medium text-blue-900 mb-2">Cambios propuestos:</p>
                                <ul className="space-y-1 text-blue-800">
                                {item.changes.name && (
                                    <li>• Nombre: <strong>{String(item.changes.name)}</strong></li>
                                )}
                                {item.changes.price != null && (
                                    <li>• Precio: <strong>{formatCurrency(Number(item.changes.price))}</strong></li>
                                )}
                                {item.changes.stock != null && (
                                    <li>• Stock: <strong>{item.changes.stock}</strong></li>
                                )}
                                {item.changes.description && (
                                    <li>• Descripción: <strong>{String((item.changes.description as any)[0]?.children?.[0]?.text ?? '').substring(0, 50)}...</strong></li>
                                )}
                                {item.changes.categories && Array.isArray(item.changes.categories) && (
                                    <li>• Categorías: <strong>{item.changes.categories.length} agregadas</strong></li>
                                )}
                                {item.changes.optionGroups && Array.isArray(item.changes.optionGroups) && (
                                    <li>• Grupos de opciones: <strong>{item.changes.optionGroups.length} agregados</strong></li>
                                )}
                                </ul>
                            </div>
                            )}

                            <div className="flex gap-2 justify-end">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRejectClick(item._id)}
                                disabled={rejectingId === item._id}
                            >
                                {rejectingId === item._id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                <XCircle className="w-4 h-4 mr-1" />
                                )}
                                Rechazar
                            </Button>
                            <Button
                                className="bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900"
                                size="sm"
                                onClick={() => handleApprove(item._id, "product")}
                                disabled={approvingId === item._id}
                            >
                                {approvingId === item._id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                <CheckCircle className="w-4 h-4 mr-1" />
                                )}
                                Aprobar
                            </Button>
                            </div>
                        </div>
                        </div>
                    ))}
                    </div>
                )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="stores">
            <Card>
                <CardHeader>
                <CardTitle>Tiendas Pendientes</CardTitle>
                <CardDescription>
                    Actualizaciones de configuración de tiendas (horarios, contacto, imágenes).
                </CardDescription>
                </CardHeader>
                <CardContent>
                {loading ? (
                    <div className="py-12 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#ff8800]" />
                    </div>
                ) : storeItems.length === 0 ? (
                    <div className="py-12 text-center text-gray-500">
                    No hay actualizaciones de tienda pendientes.
                    </div>
                ) : (
                    <div className="space-y-4">
                    {storeItems.map((item) => (
                        <div
                        key={item._id}
                        className="border rounded-lg p-4 hover:bg-gray-50/50 transition-colors"
                        >
                        <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <p className="font-semibold text-gray-900 text-lg">{item.store?.name || 'Tienda'}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                Enviado: {item.submittedAt ? formatDate(item.submittedAt) : '—'}
                                </p>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                                <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>
                            </div>
                            </div>

                            {/* Show pending changes */}
                            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                                <p className="font-medium text-blue-900 mb-2">Cambios detectados:</p>
                                <ul className="space-y-1 text-blue-800">
                                {Object.keys(item.changes || {}).map((key) => {
                                    if (key === 'image') {
                                        return (
                                            <li key={key} className="flex flex-col gap-2">
                                                <span>• Logo: <strong>Actualizado</strong></span>
                                                <div className="w-16 h-16 rounded overflow-hidden border border-gray-200 relative">
                                                    <Image 
                                                        src={urlFor(item.changes[key]).url()} 
                                                        alt="Nuevo Logo"
                                                        fill
                                                        className="object-cover"
                                                    />
                                                </div>
                                            </li>
                                        );
                                    }
                                    if (key === 'coverImage') {
                                         return (
                                            <li key={key} className="flex flex-col gap-2">
                                                <span>• Portada: <strong>Actualizada</strong></span>
                                                <div className="w-full h-24 rounded overflow-hidden border border-gray-200 relative max-w-xs">
                                                    <Image 
                                                        src={urlFor(item.changes[key]).url()} 
                                                        alt="Nueva Portada"
                                                        fill
                                                        className="object-cover"
                                                    />
                                                </div>
                                            </li>
                                        );
                                    }
                                    if (key === 'operatingHours') return <li key={key}>• Horarios: <strong>Modificados</strong></li>;
                                    if (key === 'serviceTypes') return <li key={key}>• Tipos de Servicio: <strong>Modificados</strong></li>;
                                    if (key === 'contact') return <li key={key}>• Contacto: <strong>Actualizado</strong></li>;
                                    if (key === 'address') return <li key={key}>• Dirección: <strong>Actualizada</strong></li>;
                                    return <li key={key}>• {key}: <strong>{String(item.changes[key])}</strong></li>;
                                })}
                                </ul>
                            </div>

                            <div className="flex gap-2 justify-end">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRejectClick(item._id)}
                                disabled={rejectingId === item._id}
                            >
                                {rejectingId === item._id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                <XCircle className="w-4 h-4 mr-1" />
                                )}
                                Rechazar
                            </Button>
                            <Button
                                className="bg-[#ff8800] hover:bg-[#ff8800]/90 text-gray-900"
                                size="sm"
                                onClick={() => handleApprove(item._id, "store")}
                                disabled={approvingId === item._id}
                            >
                                {approvingId === item._id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                <CheckCircle className="w-4 h-4 mr-1" />
                                )}
                                Aprobar
                            </Button>
                            </div>
                        </div>
                        </div>
                    ))}
                    </div>
                )}
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="delivery">
          <DeliveryZonesAdmin />
        </TabsContent>
        </Tabs>

      {/* Reject Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rechazar producto</DialogTitle>
            <DialogDescription>
              Por favor, explica por qué rechazas este producto. El dueño verá este motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reason">Motivo del rechazo (opcional)</Label>
              <Textarea
                id="reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ej: Imagen de baja calidad, precio no válido, información incompleta..."
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              onClick={handleRejectSubmit}
              disabled={rejectingId !== null}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {rejectingId ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
