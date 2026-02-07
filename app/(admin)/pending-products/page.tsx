"use client";

import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
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

type PendingProduct = {
  _id: string;
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

const ADMIN_USERS = [
  "user_392Q7p9ahx7GuGwIit2aWNeWaak",
];

export default function PendingProductsPage() {
  const { user, isLoaded } = useUser();
  const { redirectToSignIn } = useClerk();
  const [items, setItems] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRejectId, setSelectedRejectId] = useState<string | null>(null);

  const isAdmin = user?.id && ADMIN_USERS.includes(user.id);

  useEffect(() => {
    if (!isLoaded) return;
    
    if (!user) {
      redirectToSignIn();
      return;
    }

    if (!isAdmin) {
      setLoading(false);
      return;
    }

    fetchPendingProducts();

    // Auto-refresh every 5 seconds to catch updates from other admins or approvals
    const interval = setInterval(() => {
      fetchPendingProducts();
    }, 5000);

    return () => clearInterval(interval);
  }, [isLoaded, user, isAdmin, redirectToSignIn]);

  const fetchPendingProducts = async () => {
    try {
      setLoading(true);
      // Force fresh data by adding cache-busting query param and headers
      const res = await fetch(`/api/dashboard/product-update-requests?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.items ?? []);
        console.log(`[PendingProducts] Fetched ${data.items?.length ?? 0} items`);
      } else if (res.status === 401) {
        redirectToSignIn();
      }
    } catch (err) {
      console.error("Error fetching pending products:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      console.log(`[handleApprove] Approving request: ${id}`);
      const res = await fetch(`/api/dashboard/product-update-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      console.log(`[handleApprove] Response status: ${res.status}, success: ${data.success}`);
      
      if (data.success) {
        console.log(`[handleApprove] Approval successful, removing from list`);
        setItems((prev) => prev.filter((item) => item._id !== id));
        // Refetch after a short delay to ensure Sanity has updated
        setTimeout(() => {
          console.log(`[handleApprove] Refetching after approval`);
          fetchPendingProducts();
        }, 500);
      } else if (res.status === 400 && (data.error?.includes("already approved") || data.error?.includes("Status actual: approved"))) {
        // Already approved, just remove from list silently
        console.log(`[handleApprove] Item already approved (${id}), removing from list silently`);
        setItems((prev) => prev.filter((item) => item._id !== id));

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
      const res = await fetch(
        `/api/dashboard/product-update-requests/${selectedRejectId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason || undefined }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setItems((prev) => prev.filter((item) => item._id !== selectedRejectId));
        setRejectDialogOpen(false);
        setSelectedRejectId(null);
        setRejectReason("");
        // Refetch after a short delay to ensure Sanity has updated
        setTimeout(() => fetchPendingProducts(), 500);
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

  if (!isLoaded) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-lg text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#ff8800]" />
        <p className="text-gray-600 mt-4">Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-lg text-center">
        <p className="text-gray-600">Inicia sesión para acceder al panel.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-lg text-center">
        <p className="text-gray-600 mb-4">No tienes permisos para acceder a este panel.</p>
        <Link href="/">
          <Button variant="outline">Volver a inicio</Button>
        </Link>
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
        <h1 className="text-3xl font-bold text-gray-900">Productos Pendientes de Aprobación</h1>
        <p className="text-gray-600 mt-1">
          Revisa y aprueba cambios y nuevos productos enviados por los dueños.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pendientes ({items.length})</CardTitle>
          <CardDescription>
            Estos productos están esperando tu aprobación antes de ser publicados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#ff8800]" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              No hay productos pendientes de aprobación.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
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
                        {item.status === "pending" && (
                          <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>
                        )}
                        {item.status === "rejected" && (
                          <Badge className="bg-red-100 text-red-800">Rechazado</Badge>
                        )}
                        {item.rejectionReason && (
                          <p className="text-xs text-red-600 max-w-xs text-right">Razón: {item.rejectionReason}</p>
                        )}
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
                        onClick={() => handleApprove(item._id)}
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
