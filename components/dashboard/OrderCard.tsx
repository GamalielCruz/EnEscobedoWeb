"use client";

import { Copy, ExternalLink, MapPinned, Phone, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { statusConfig } from "./dashboard.constants";
import type { DashboardOrder } from "./dashboard.types";
import {
  buildAddressLabel,
  formatCurrency,
  formatDate,
  getCustomizationTitle,
  getOrderQuickActions,
} from "./dashboard.utils";

type OrderCardProps = {
  order: DashboardOrder;
  compact?: boolean;
  updating?: boolean;
  onUpdateStatus?: (orderId: string, orderNumber: string, status: string) => void;
};

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error("Error copiando texto:", error);
  }
}

export function OrderCard({ order, compact = false, updating = false, onUpdateStatus }: OrderCardProps) {
  const status = statusConfig[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-700" };
  const addressLabel = buildAddressLabel(order);
  const quickActions = getOrderQuickActions(order);

  if (compact) {
    return (
      <Card className="border-gray-200 bg-white">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="min-w-[220px] flex-1">
            <div className="flex items-center gap-2">
              <Badge className={status.color}>{status.label}</Badge>
              <span className="text-xs font-mono text-gray-400">#{order.pickupCode || order.orderNumber.slice(-8)}</span>
            </div>
            <p className="mt-2 font-semibold text-gray-900">{order.customerInfo.name}</p>
            <p className="text-sm text-gray-600">
              {order.items?.length || 0} productos • {formatCurrency(order.totalAmount)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">{formatDate(order.createdAt)}</p>
            <p className="text-xs text-gray-500">
              {order.deliveryMethod === "home_delivery" ? "Entrega a domicilio" : "Recoger en tienda"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-gray-200 bg-white">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[260px] flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className={status.color}>{status.label}</Badge>
              <Badge variant="outline" className="border-orange-100 bg-orange-50 text-[#ff8800]">
                {order.deliveryMethod === "home_delivery" ? "Domicilio" : "Pickup"}
              </Badge>
              <span className="text-xs font-mono text-gray-400">#{order.pickupCode || order.orderNumber.slice(-8)}</span>
            </div>

            <div className="mb-4">
              <p className="text-lg font-bold text-gray-900">{order.customerInfo.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <span>{order.customerInfo.email || "Sin correo"}</span>
                <button
                  type="button"
                  onClick={() => order.customerInfo.phone && copyToClipboard(order.customerInfo.phone)}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 hover:bg-gray-50"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {order.customerInfo.phone || "Sin telefono"}
                </button>
              </div>
            </div>

            {addressLabel ? (
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Entrega</p>
                <p className="mt-1 text-sm text-blue-900">{addressLabel}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-blue-200 bg-white text-blue-700 hover:bg-blue-100"
                    onClick={() => copyToClipboard(addressLabel)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </Button>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLabel)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    <MapPinned className="h-3.5 w-3.5" />
                    Google Maps
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Detalle del pedido
              </p>
              <ul className="space-y-3">
                {(order.items || []).map((item, index) => (
                  <li key={`${item.productId}-${index}`} className="text-sm text-gray-700">
                    <div className="flex justify-between gap-4">
                      <span>
                        {item.quantity}x {item.productName}
                      </span>
                      <span className="font-medium">{formatCurrency(item.price)}</span>
                    </div>

                    {item.customizations?.length ? (
                      <div className="mt-1 space-y-1 pl-4 text-xs text-gray-600">
                        {item.customizations.map((custom, customIndex) => (
                          <div key={`${custom.title}-${customIndex}`}>
                            <span className="font-medium">{getCustomizationTitle(custom, item)}:</span>{" "}
                            {custom.options?.map((option, optionIndex) => (
                              <span key={`${option.label}-${optionIndex}`}>
                                {option.label}
                                {option.priceDelta ? ` (+${formatCurrency(option.priceDelta)})` : ""}
                                {optionIndex < (custom.options?.length || 0) - 1 ? ", " : ""}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {item.notes ? (
                      <p className="mt-1 pl-4 text-xs italic text-amber-700">{item.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-lg font-bold text-[#ff8800]">{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
          </div>

          <div className="w-full max-w-xs space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tiempo</p>
              <p className="mt-2 text-sm font-medium text-gray-800">{formatDate(order.createdAt)}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Acciones</p>
              <div className="grid gap-2">
                {quickActions.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <ShoppingBag className="h-4 w-4" />
                    Sin acciones pendientes
                  </div>
                ) : (
                  quickActions.map((action) => (
                    <Button
                      key={action.status}
                      type="button"
                      variant={action.variant === "destructive" ? "destructive" : action.variant === "secondary" ? "outline" : "default"}
                      className={
                        action.variant === "primary"
                          ? "bg-[#ff8800] text-gray-900 hover:bg-[#ff8800]/90"
                          : undefined
                      }
                      disabled={updating}
                      onClick={() => onUpdateStatus?.(order._id, order.orderNumber, action.status)}
                    >
                      {action.label}
                    </Button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
