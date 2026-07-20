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

import {
  DashboardDescription,
  DashboardEmptyState,
  DashboardEyebrow,
  DashboardPanel,
  DashboardPanelBody,
  DashboardPanelHeader,
  DashboardStatusPill,
  DashboardTitle,
} from "./dashboard.design";
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
  onCreateCategory: (title: string) => Promise<CategoryOption | null>;
  onRefresh: () => void;
  onSubmitProduct: (payload: { editingProductId: string | null; formState: ProductFormState }) => Promise<boolean>;
  onUpdateAvailability: (productId: string, isVisible: boolean, stock?: number) => Promise<boolean>;
  onImageUpload: (file: File) => Promise<{ _type: string; asset: { _type: string; _ref: string } } | null>;
};

export function DashboardProductsSection({
  products,
  pendingChanges,
  loading,
  refreshing,
  availableCategories,
  loadCategories,
  onCreateCategory,
  onRefresh,
  onSubmitProduct,
  onUpdateAvailability,
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

  const handleUpdateAvailability = async (product: Product, nextVisible: boolean) => {
    if (nextVisible && Number(product.stock ?? 0) <= 0) {
      const value = window.prompt(
        "Este producto no tiene inventario disponible.\nAgrega existencias antes de publicarlo."
      );
      if (value == null) return;
      const stock = Number(value);
      if (!Number.isFinite(stock) || stock <= 0) {
        alert("Ingresa una cantidad mayor a cero.");
        return;
      }
      if (await onUpdateAvailability(product._id, true, Math.floor(stock))) {
        alert("Producto publicado.");
      }
      return;
    }

    if (await onUpdateAvailability(product._id, nextVisible)) {
      alert(nextVisible ? "Producto publicado." : "Producto oculto.");
    }
  };

  return (
    <>
      <DashboardPanel>
        <DashboardPanelHeader align="spread" className="gap-4">
          <div>
            <DashboardEyebrow>Catalogo</DashboardEyebrow>
            <DashboardTitle className="mt-1">Productos</DashboardTitle>
            <DashboardDescription className="mt-1">
              Administra disponibilidad, cambios pendientes y nuevos productos desde una sola vista.
            </DashboardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DashboardStatusPill tone="neutral">{products.length} totales</DashboardStatusPill>
            <DashboardStatusPill tone="accent">
              {Object.values(pendingChanges).filter(Boolean).length} con cambios pendientes
            </DashboardStatusPill>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-black/8 px-3 shadow-none hover:bg-gray-50"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Button
              type="button"
              className="h-9 rounded-lg bg-[#EB1902] px-3 text-white hover:bg-[#850C22]"
              onClick={handleOpenCreate}
            >
              <Plus className="h-4 w-4" />
              Agregar producto
            </Button>
          </div>
        </DashboardPanelHeader>

        <DashboardPanelBody className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                Filtro de categoria
              </p>
              <DashboardDescription className="mt-1 text-[13px]">
                Reduce ruido y enfocate en una parte del menu.
              </DashboardDescription>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-full rounded-lg border-black/8 bg-white shadow-none sm:w-[240px]">
                <SelectValue placeholder="Filtrar por categoria" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-black/8 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
                <SelectItem value="all">Todas las categorias</SelectItem>
                {availableCategories.map((category) => (
                  <SelectItem key={category._id} value={category._id}>
                    {category.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <DashboardEmptyState
              title="Cargando productos"
              description="Estamos preparando el catalogo para esta tienda."
            />
          ) : filteredProducts.length === 0 ? (
            <DashboardEmptyState
              title="Sin productos para este filtro"
              description="Prueba otra categoria o agrega nuevos productos al menu."
            />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  hasPendingChanges={Boolean(pendingChanges[product._id])}
                  onEdit={() => handleOpenEdit(product)}
                  onUpdateAvailability={(nextVisible) => handleUpdateAvailability(product, nextVisible)}
                />
              ))}
            </div>
          )}
        </DashboardPanelBody>
      </DashboardPanel>

      <ProductEditorDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        formState={formState}
        setFormState={setFormState}
        availableCategories={availableCategories}
        onCreateCategory={onCreateCategory}
        editingProductId={editingProductId}
        submitting={submitting}
        uploadingImage={uploadingImage}
        onSubmit={handleSubmit}
        onImageUpload={handleImageUpload}
      />
    </>
  );
}
