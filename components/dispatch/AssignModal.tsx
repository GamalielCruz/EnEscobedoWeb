"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Hand, Loader2, Package, UtensilsCrossed } from "lucide-react";
import type { DispatchDriverCard, DispatchOrderCard } from "@/lib/dispatch/dispatch-core";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";

type Props = {
  draft: { order: DispatchOrderCard; driver: DispatchDriverCard; isReassign: boolean } | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AssignModal({ draft, busy, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="dark:border-white/10 dark:bg-[#0d1526]">
        {draft && (
          <>
            <DialogHeader>
              <DialogTitle className="dark:text-white">
                {draft.isReassign ? "Reasignar pedido" : "¿Deseas asignar esta orden?"}
              </DialogTitle>
              <DialogDescription className="dark:text-slate-400">
                {draft.isReassign
                  ? "El pedido pasará del repartidor actual al nuevo repartidor. Se notificará a ambos por WhatsApp."
                  : "Se confirmará la asignación y se notificará al repartidor por WhatsApp."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-bold text-[#EB1902]">
                  <span>Pedido #{shortOrderCode(draft.order.orderNumber)}</span>
                </p>
                <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {draft.order.serviceKind === "mandado" ? (
                    <Package className="h-3 w-3 shrink-0 text-violet-500" />
                  ) : (
                    <UtensilsCrossed className="h-3 w-3 shrink-0 text-orange-500" />
                  )}
                  <span className="truncate">{draft.order.storeName}</span>
                </p>
                <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{draft.order.destLabel}</p>
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                  ${draft.order.totalPrice.toFixed(2)} · {draft.order.paymentLabel} · {draft.order.routeKm != null ? `${draft.order.routeKm} km` : "s/ruta"}
                </p>
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EB1902] text-white">
                  <ArrowRight className="h-4 w-4" />
                </span>
                {draft.isReassign && draft.order.driverName && (
                  <span className="text-[9px] font-medium text-red-500">de #{draft.order.driverName}</span>
                )}
              </div>

              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-xs font-bold text-[#09193B] dark:text-white">
                  <Hand className="h-3.5 w-3.5 shrink-0 text-[#EB1902]" />
                  <span className="truncate">{draft.driver.name}</span>
                </p>
                <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{draft.driver.phone}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  {draft.driver.activeOrders.length} pedido(s) activo(s)
                  {draft.driver.rating != null ? ` · ★ ${draft.driver.rating.toFixed(1)}` : ""}
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="dark:bg-white/5 dark:text-slate-200">
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="bg-[#EB1902] text-white shadow-sm transition hover:bg-[#c81502]"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {draft.isReassign ? "Confirmar reasignación" : "Confirmar asignación"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
