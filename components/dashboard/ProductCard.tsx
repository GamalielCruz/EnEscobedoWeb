"use client";

import Image from "next/image";
import { Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { imageUrl } from "@/lib/imageUrl";

import { DashboardDescription, DashboardPanel, DashboardStatusPill } from "./dashboard.design";
import type { Product } from "./dashboard.types";
import { formatCurrency } from "./dashboard.utils";

type ProductCardProps = {
  product: Product;
  hasPendingChanges: boolean;
  onEdit: () => void;
};

export function ProductCard({ product, hasPendingChanges, onEdit }: ProductCardProps) {
  const statusLabel =
    product.approvalStatus === "pending"
      ? { label: "Pendiente", className: "border border-amber-200 bg-amber-50 text-amber-800" }
      : product.approvalStatus === "rejected"
        ? { label: "Rechazado", className: "border border-[#EB1902]/10 bg-[#fff1ef] text-[#EB1902]" }
        : product.isVisible === false
          ? { label: "Inactivo", className: "border border-gray-200 bg-gray-50 text-gray-700" }
          : { label: "Activo", className: "border border-[#20096F]/10 bg-[#eff2ff] text-[#20096F]" };

  return (
    <DashboardPanel className="overflow-hidden">
      <div className="grid min-h-[176px] md:grid-cols-[108px_minmax(0,1fr)]">
        <div className="relative flex items-center justify-center border-b border-black/6 bg-[#fafafb] md:border-b-0 md:border-r">
          {product.image ? (
            <Image
              src={imageUrl(product.image).url()}
              alt={product.name}
              width={180}
              height={180}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              <Package className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <DashboardStatusPill className={statusLabel.className}>{statusLabel.label}</DashboardStatusPill>
            {hasPendingChanges && product.approvalStatus !== "pending" ? (
              <DashboardStatusPill tone="accent">Solicitud pendiente</DashboardStatusPill>
            ) : null}
          </div>

          <div className="mt-3 min-w-0">
            <p className="line-clamp-2 text-[16px] font-semibold tracking-[-0.01em] text-gray-950">
              {product.name}
            </p>
            <p className="mt-1 text-[17px] font-semibold text-gray-950">{formatCurrency(product.price)}</p>
            <DashboardDescription className="mt-1 text-[13px]">
              {product.categories?.map((category) => category.title).join(", ") || "Sin categoria"}
            </DashboardDescription>
          </div>

          <div className="mt-4 grid gap-2 border-t border-black/6 pt-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                Inventario
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {product.stock ?? "Sin control"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                Visibilidad
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {product.isVisible === false ? "Oculto" : "Publicado"}
              </p>
            </div>
            <div className="flex items-end justify-start sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-black/8 px-3 shadow-none"
              onClick={onEdit}
              disabled={product.approvalStatus === "pending"}
            >
              {product.approvalStatus === "pending" ? "En revision" : "Editar"}
            </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardPanel>
  );
}
