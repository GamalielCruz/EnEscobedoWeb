"use client";

import Image from "next/image";
import { Package } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { imageUrl } from "@/lib/imageUrl";

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
      ? { label: "Pendiente", className: "bg-yellow-100 text-yellow-800" }
      : product.approvalStatus === "rejected"
        ? { label: "Rechazado", className: "bg-red-100 text-red-800" }
        : product.isVisible === false
          ? { label: "Inactivo", className: "bg-gray-100 text-gray-700" }
          : { label: "Activo", className: "bg-green-100 text-green-700" };

  return (
    <Card className="overflow-hidden border-gray-200 bg-white">
      <CardContent className="p-0">
        <div className="aspect-[4/3] bg-gray-100">
          {product.image ? (
            <Image
              src={imageUrl(product.image).url()}
              alt={product.name}
              width={480}
              height={360}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              <Package className="h-10 w-10" />
            </div>
          )}
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusLabel.className}>{statusLabel.label}</Badge>
            {hasPendingChanges && product.approvalStatus !== "pending" ? (
              <Badge className="bg-blue-100 text-blue-800">Solicitud pendiente</Badge>
            ) : null}
          </div>

          <div>
            <p className="line-clamp-2 text-lg font-semibold text-gray-900">{product.name}</p>
            <p className="mt-1 text-lg font-bold text-[#ff8800]">{formatCurrency(product.price)}</p>
            <p className="mt-1 text-sm text-gray-500">
              {product.categories?.map((category) => category.title).join(", ") || "Sin categoria"}
            </p>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Stock: {product.stock ?? "Sin control"}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEdit}
              disabled={product.approvalStatus === "pending"}
            >
              {product.approvalStatus === "pending" ? "En revision" : "Editar"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
