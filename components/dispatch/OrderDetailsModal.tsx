"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, Package, UtensilsCrossed } from "lucide-react";
import { formatWaitingTime, shortOrderCode } from "@/lib/dispatch/dispatch-format";
import type { DispatchOrderCard } from "@/lib/dispatch/dispatch-core";

type Props = {
  order: DispatchOrderCard | null;
  onClose: () => void;
};

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <span className={`min-w-0 text-right text-[11px] font-medium text-slate-700 dark:text-slate-200 ${mono ? "break-all font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function OrderDetailsModal({ order, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!order) return null;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const priorityLabel = { urgent: "Urgente", high: "Alta", normal: "Normal" }[order.priority];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto dark:border-white/10 dark:bg-[#0d1526]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            {order.serviceKind === "mandado" ? (
              <Package className="h-4 w-4 text-violet-500" />
            ) : (
              <UtensilsCrossed className="h-4 w-4 text-orange-500" />
            )}
            Pedido #{shortOrderCode(order.orderNumber)}
          </DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            Identificador completo disponible aquí para soporte y auditoría.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 space-y-0.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              UUID completo
            </span>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 break-all font-mono text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                {order.orderNumber}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy(order.orderNumber)}
                className="h-6 shrink-0 gap-1 px-2 text-[10px] dark:bg-white/5 dark:text-slate-200"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
          <Row label="ID Sanity" value={order._id} mono />
        </div>

        <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 px-3 dark:divide-white/10 dark:border-white/10">
          <Row label="Tipo" value={order.serviceKind === "mandado" ? "Mandado" : "Restaurante"} />
          <Row label="Prioridad" value={priorityLabel} />
          <Row label="Estado dispatch" value={order.dispatchStatus || "—"} mono />
          <Row label="Estado pedido" value={order.orderStatus || "—"} mono />
          <Row label="Origen" value={order.storeName || "—"} />
          <Row label="Destino" value={order.destLabel || "—"} />
          <Row
            label="Coordenadas"
            value={
              order.storeLat != null && order.destLat != null
                ? `${order.storeLat}, ${order.storeLng} → ${order.destLat}, ${order.destLng}`
                : "No disponibles"
            }
            mono
          />
          <Row label="Esperando" value={formatWaitingTime(order.waitingMinutes)} />
          <Row label="Distancia ruta" value={order.routeKm != null ? `${order.routeKm} km` : "Sin estimar"} />
          <Row label="Total" value={`$${order.totalPrice.toFixed(2)}`} />
          <Row label="Pago" value={order.paymentLabel} />
          <Row label="Repartidor" value={order.driverName ?? (order.recommendedDriverName ? `Rec: ${order.recommendedDriverName} · ${order.recommendedScore}%` : "Sin asignar")} />
          <Row
            label="Programado"
            value={
              order.fulfillmentTiming === "scheduled" && order.scheduledSlot?.startAt
                ? new Date(order.scheduledSlot.startAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
                : "No"
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
