"use client";

import * as React from "react";
import { Copy, ExternalLink, MapPinned, Phone, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { statusConfig } from "./dashboard.constants";
import {
  DashboardDescription,
  DashboardPanel,
  DashboardStatusPill,
} from "./dashboard.design";
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
  onRefresh?: () => void;
};

function isTechnicalItemNote(note?: string) {
  return /^unitBasePrice=.*lineTotal=/i.test(String(note || "").trim());
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error("Error copiando texto:", error);
  }
}

export function OrderCard({ order, compact = false, updating = false, onUpdateStatus, onRefresh }: OrderCardProps) {
  const [pin, setPin] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const [verifyingPin, setVerifyingPin] = React.useState(false);
  const status = statusConfig[order.status] ?? {
    label: order.status,
    color: "border border-gray-200 bg-gray-50 text-gray-700",
  };
  const addressLabel = buildAddressLabel(order);
  const quickActions = getOrderQuickActions(order);
  const itemSummary = `${order.items?.length || 0} productos`;
  const orderCode = order.pickupCode || order.orderNumber.slice(-8);
  const channelLabel =
    order.deliveryMethod === "home_delivery" ? "Entrega a domicilio" : "Recoger en tienda";
  const requiresDeliveryPin = order.fulfillmentProvider === "restaurant_delivery" && order.status === "shipped" && order.deliveryVerificationStatus !== "verified";

  async function verifyDeliveryPin(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin)) return setPinError("Ingresa los 6 dígitos.");
    setVerifyingPin(true);
    setPinError("");
    try {
      const response = await fetch(`/api/orders/${order._id}/verify-delivery-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo verificar el PIN.");
      setPin("");
      onRefresh?.();
    } catch (error) {
      setPinError(error instanceof Error ? error.message : "No se pudo verificar el PIN.");
    } finally {
      setVerifyingPin(false);
    }
  }

  if (compact) {
    return (
      <DashboardPanel className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <DashboardStatusPill className={status.color}>{status.label}</DashboardStatusPill>
              <DashboardStatusPill tone="neutral">
                {order.deliveryMethod === "home_delivery" ? "Delivery" : "Pickup"}
              </DashboardStatusPill>
              <span className="text-[11px] font-mono text-gray-400">#{orderCode}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-gray-950">{order.customerInfo.name}</p>
            <DashboardDescription className="mt-1 text-[13px]">
              {itemSummary} Â· {formatCurrency(order.totalAmount)}
            </DashboardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">{formatDate(order.createdAt)}</p>
            <p className="mt-1 text-xs text-gray-500">{channelLabel}</p>
          </div>
        </div>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel className="overflow-hidden">
      <div className="border-b border-black/6 px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[260px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <DashboardStatusPill className={status.color}>{status.label}</DashboardStatusPill>
              <DashboardStatusPill tone="neutral">
                {order.deliveryMethod === "home_delivery" ? "Delivery" : "Pickup"}
              </DashboardStatusPill>
              <span className="text-[11px] font-mono text-gray-400">#{orderCode}</span>
            </div>
            <div className="mt-3">
              <p className="text-[17px] font-semibold tracking-[-0.01em] text-gray-950">
                {order.customerInfo.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[13px] text-gray-600">
                <span>{order.customerInfo.email || "Sin correo"}</span>
                <button
                  type="button"
                  onClick={() => order.customerInfo.phone && copyToClipboard(order.customerInfo.phone)}
                  className="inline-flex items-center gap-1 rounded-full border border-black/8 px-2.5 py-1 hover:bg-gray-50"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {order.customerInfo.phone || "Sin telefono"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex w-full max-w-sm flex-col items-start gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <DashboardStatusPill tone="neutral">{itemSummary}</DashboardStatusPill>
              <DashboardStatusPill tone="neutral">{channelLabel}</DashboardStatusPill>
              <DashboardStatusPill tone="brand">{formatCurrency(order.totalAmount)}</DashboardStatusPill>
            </div>
            <DashboardDescription className="text-[13px]">
              Recibido {formatDate(order.createdAt)}
            </DashboardDescription>
            <div className="flex w-full flex-wrap gap-2">
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
                    size="sm"
                    variant={
                      action.variant === "destructive"
                        ? "destructive"
                        : action.variant === "secondary"
                          ? "outline"
                          : "default"
                    }
                    className={
                      action.variant === "primary"
                        ? "h-8 rounded-lg bg-[#EB1902] px-3 text-white hover:bg-[#850C22]"
                        : action.variant === "secondary"
                          ? "h-8 rounded-lg border-black/8 px-3 shadow-none"
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
            {requiresDeliveryPin ? (
              <form onSubmit={verifyDeliveryPin} className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3">
                <label htmlFor={`delivery-pin-${order._id}`} className="text-xs font-semibold text-amber-950">PIN de entrega</label>
                <div className="mt-2 flex gap-2">
                  <Input
                    id={`delivery-pin-${order._id}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    aria-describedby={pinError ? `delivery-pin-error-${order._id}` : undefined}
                    className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 font-mono text-lg tracking-[0.25em] outline-none focus:border-[#EB1902]"
                  />
                  <Button type="submit" disabled={verifyingPin || pin.length !== 6} className="bg-[#EB1902] text-white hover:bg-[#850C22]">
                    {verifyingPin ? "Validando…" : "Confirmar entrega"}
                  </Button>
                </div>
                {pinError ? <p id={`delivery-pin-error-${order._id}`} role="alert" className="mt-2 text-xs font-medium text-red-700">{pinError}</p> : null}
                <p className="mt-2 text-xs text-amber-900">Solicítalo después de entregar físicamente el pedido.</p>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="px-5 py-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
            Detalle del pedido
          </p>
          <ul className="divide-y divide-black/6">
            {(order.items || []).map((item, index) => (
              <li key={`${item.productId}-${index}`} className="py-3 text-sm text-gray-700 first:pt-0 last:pb-0">
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-gray-900">
                    {item.quantity}x {item.productName}
                  </span>
                  <span className="text-sm font-medium text-gray-700">{formatCurrency(item.price)}</span>
                </div>

                {item.customizations?.length ? (
                  <div className="mt-1.5 space-y-1 pl-3 text-[13px] text-gray-600">
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

                {item.notes && !isTechnicalItemNote(item.notes) ? (
                  <p className="mt-1.5 pl-3 text-[13px] italic text-amber-700">{item.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-black/6 pt-3">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-lg font-semibold tracking-[-0.01em] text-[#850C22]">
              {formatCurrency(order.totalAmount)}
            </span>
          </div>
        </div>

        <div className="border-t border-black/6 bg-[#fafafb] px-5 py-4 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                Canal y tiempo
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900">{channelLabel}</p>
              <p className="mt-1 text-sm text-gray-600">{formatDate(order.createdAt)}</p>
            </div>

            {addressLabel ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Entrega
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-700">{addressLabel}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-black/8 px-3 shadow-none"
                    onClick={() => copyToClipboard(addressLabel)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </Button>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLabel)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/8 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <MapPinned className="h-3.5 w-3.5" />
                    Google Maps
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DashboardPanel>
  );
}
