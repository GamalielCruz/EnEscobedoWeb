"use client";

import * as React from "react";
import { Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ProductCard } from "./ProductCard";
import { ProductEditorDialog } from "./ProductEditorDialog";
import type { CategoryOption, Product, ProductFormState } from "./dashboard.types";
import { createEmptyProductForm, productToFormState } from "./dashboard.utils";

type DashboardProductsSectionProps = {
  products: Product[];
  pendingChanges: Record<string, boolean>;
  loading: boolean;
  refreshing: boolean;
  availableCategories: CategoryOption[];
  loadCategories: () => Promise<void>;
  onRefresh: () => void;
  onSubmitProduct: (payload: { editingProductId: string | null; formState: ProductFormState }) => Promise<boolean>;
  onImageUpload: (file: File) => Promise<{ _type: string; asset: { _type: string; _ref: string } } | null>;
};

export function DashboardProductsSection({
  products,
  pendingChanges,
  loading,
  refreshing,
  availableCategories,
  loadCategories,
  onRefresh,
  onSubmitProduct,
  onImageUpload,
}: DashboardProductsSectionProps) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingProductId, setEditingProductId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [formState, setFormState] = React.useState<ProductFormState>(createEmptyProductForm());

  const filteredProducts = React.useMemo(
    () =>
      products.filter((product) => {
        if (categoryFilter === "all") return true;
        return product.categories?.some((category) => category._id === categoryFilter);
      }),
    [products, categoryFilter]
  );

  const handleOpenCreate = async () => {
    await loadCategories();
    setEditingProductId(null);
    setFormState(createEmptyProductForm());
    setModalOpen(true);
  };

  const handleOpenEdit = async (product: Product) => {
    await loadCategories();
    setEditingProductId(product._id);
    setFormState(productToFormState(product));
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const success = await onSubmitProduct({ editingProductId, formState });
    setSubmitting(false);
    if (success) {
      setModalOpen(false);
      setEditingProductId(null);
      setFormState(createEmptyProductForm());
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const image = await onImageUpload(file);
    setUploadingImage(false);
    if (image) {
      setFormState((current) => ({ ...current, image }));
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Productos</CardTitle>
              <CardDescription>
                Organiza tu menu, detecta solicitudes pendientes y agrega nuevos productos.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
              <Button
                type="button"
                className="bg-[#ff8800] text-gray-900 hover:bg-[#ff8800]/90"
                onClick={handleOpenCreate}
              >
                <Plus className="h-4 w-4" />
                Agregar producto
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full bg-white sm:w-[220px]">
                <SelectValue placeholder="Filtrar por categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorias</SelectItem>
                {availableCategories.map((category) => (
                  <SelectItem key={category._id} value={category._id}>
                    {category.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center text-gray-500">
              Cargando productos...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center text-gray-500">
              No hay productos para la categoria seleccionada.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  hasPendingChanges={Boolean(pendingChanges[product._id])}
                  onEdit={() => handleOpenEdit(product)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ProductEditorDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        formState={formState}
        setFormState={setFormState}
        availableCategories={availableCategories}
        editingProductId={editingProductId}
        submitting={submitting}
        uploadingImage={uploadingImage}
        onSubmit={handleSubmit}
        onImageUpload={handleImageUpload}
      />
    </>
  );
}
