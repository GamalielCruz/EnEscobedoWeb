"use client";

import * as React from "react";
import {
  Check,
  ListOrdered,
  Plus,
  RefreshCw,
  Save,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SortableOrderList } from "@/components/SortableOrderList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { imageUrl } from "@/lib/imageUrl";
import { orderProducts } from "@/lib/product-order";

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
import type {
  CategoryOption,
  CategoryOrdering,
  Product,
  ProductFormState,
  ProductOrdering,
} from "./dashboard.types";
import { createEmptyProductForm, productToFormState } from "./dashboard.utils";

type DashboardProductsSectionProps = {
  products: Product[];
  productOrdering: ProductOrdering;
  pendingChanges: Record<string, boolean>;
  loading: boolean;
  refreshing: boolean;
  availableCategories: CategoryOption[];
  categoryOrdering: CategoryOrdering;
  loadCategories: () => Promise<void>;
  onCreateCategory: (title: string) => Promise<CategoryOption | null>;
  onRefresh: () => void;
  onSubmitProduct: (payload: { editingProductId: string | null; formState: ProductFormState }) => Promise<boolean>;
  onUpdateAvailability: (productId: string, isVisible: boolean, stock?: number) => Promise<boolean>;
  onSaveProductOrder: (categoryId: string | null, productIds: string[]) => Promise<boolean>;
  onSaveCategoryOrder: (categoryIds: string[]) => Promise<boolean>;
  onImageUpload: (file: File) => Promise<{ _type: string; asset: { _type: string; _ref: string } } | null>;
};

export function DashboardProductsSection({
  products,
  productOrdering,
  pendingChanges,
  loading,
  refreshing,
  availableCategories,
  categoryOrdering,
  loadCategories,
  onCreateCategory,
  onRefresh,
  onSubmitProduct,
  onUpdateAvailability,
  onSaveProductOrder,
  onSaveCategoryOrder,
  onImageUpload,
}: DashboardProductsSectionProps) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingProductId, setEditingProductId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [orderingType, setOrderingType] = React.useState<"products" | "categories" | null>(null);
  const [savingOrder, setSavingOrder] = React.useState(false);
  const [draftIds, setDraftIds] = React.useState<string[]>([]);
  const [formState, setFormState] = React.useState<ProductFormState>(createEmptyProductForm());
  const isOrdering = orderingType !== null;
  const isCategoryOrdering = orderingType === "categories";

  const filteredProducts = products.filter((product) => {
    if (categoryFilter === "all") return true;
    return product.categories?.some((category) => category._id === categoryFilter);
  });
  const preferredIds =
    categoryFilter === "all"
      ? productOrdering.all
      : productOrdering.categories[categoryFilter] ?? [];
  const orderedProducts = orderProducts(filteredProducts, preferredIds);
  const savedIds = orderedProducts.map((product) => product._id);
  const hasOrderChanges =
    isOrdering && draftIds.join("\u0000") !== savedIds.join("\u0000");
  const productsById = new Map(orderedProducts.map((product) => [product._id, product]));
  const draftProducts = draftIds
    .map((productId) => productsById.get(productId))
    .filter((product): product is Product => Boolean(product));
  const orderedCategories = orderProducts(availableCategories, categoryOrdering);
  const savedCategoryIds = orderedCategories.map((category) => category._id);
  const hasCategoryOrderChanges = isCategoryOrdering && draftIds.join("\u0000") !== savedCategoryIds.join("\u0000");

  const handleCategoryChange = (nextCategory: string) => {
    setCategoryFilter(nextCategory);
    const nextProducts = products.filter(
      (product) =>
        nextCategory === "all" ||
        product.categories?.some((category) => category._id === nextCategory)
    );
    const nextPreferredIds =
      nextCategory === "all"
        ? productOrdering.all
        : productOrdering.categories[nextCategory] ?? [];
    setDraftIds(orderProducts(nextProducts, nextPreferredIds).map((product) => product._id));
  };

  const handleOpenOrdering = () => {
    setDraftIds(savedIds);
    setOrderingType("products");
  };

  const handleOpenCategoryOrdering = () => {
    setDraftIds(savedCategoryIds);
    setOrderingType("categories");
  };

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    await (isCategoryOrdering
      ? onSaveCategoryOrder(draftIds)
      : onSaveProductOrder(categoryFilter === "all" ? null : categoryFilter, draftIds));
    setSavingOrder(false);
  };

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
    if (image) setFormState((current) => ({ ...current, image }));
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
              Administra disponibilidad, cambios pendientes y el orden del menu.
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
              onClick={() => {
                if (isOrdering) {
                  setDraftIds(isCategoryOrdering ? savedCategoryIds : savedIds);
                  setOrderingType(null);
                } else handleOpenOrdering();
              }}
              disabled={savingOrder}
            >
              <ListOrdered className="h-4 w-4" />
              {isOrdering ? "Salir del orden" : "Ordenar productos"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-black/8 px-3 shadow-none hover:bg-gray-50"
              onClick={() => {
                if (isCategoryOrdering) {
                  setDraftIds(savedCategoryIds);
                  setOrderingType(null);
                } else handleOpenCategoryOrdering();
              }}
              disabled={savingOrder || (isOrdering && !isCategoryOrdering)}
            >
              <ListOrdered className="h-4 w-4" />
              {isCategoryOrdering ? "Salir del orden" : "Ordenar categorías"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-black/8 px-3 shadow-none hover:bg-gray-50"
              onClick={onRefresh}
              disabled={refreshing || isOrdering}
            >
              <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
              Actualizar
            </Button>
            <Button
              type="button"
              className="h-9 rounded-lg bg-[#EB1902] px-3 text-white hover:bg-[#850C22]"
              onClick={handleOpenCreate}
              disabled={isOrdering}
            >
              <Plus className="h-4 w-4" />
              Agregar producto
            </Button>
          </div>
        </DashboardPanelHeader>

        <DashboardPanelBody className="space-y-4">
          {isCategoryOrdering ? (
            <div className="rounded-2xl border border-[#20096F]/10 bg-[#f7f7ff] p-3 sm:p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <DashboardStatusPill tone={hasCategoryOrderChanges ? "accent" : "neutral"}>
                    {hasCategoryOrderChanges ? "Borrador sin guardar" : <><Check className="h-3.5 w-3.5" /> Orden guardado</>}
                  </DashboardStatusPill>
                  <DashboardDescription className="mt-2 text-[13px]">
                    Arrastra las categorías para definir el orden en que aparecen en el menú.
                  </DashboardDescription>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="rounded-lg border-black/8 bg-white shadow-none" disabled={!hasCategoryOrderChanges || savingOrder} onClick={() => setDraftIds(savedCategoryIds)}>
                    <Undo2 className="h-4 w-4" /> Descartar
                  </Button>
                  <Button type="button" className="rounded-lg bg-[#20096F] text-white hover:bg-[#180752]" disabled={!hasCategoryOrderChanges || savingOrder} onClick={handleSaveOrder}>
                    <Save className="h-4 w-4" /> {savingOrder ? "Guardando..." : "Guardar orden"}
                  </Button>
                </div>
              </div>
              <SortableOrderList
                items={orderedCategories.map((category) => ({ id: category._id, label: category.title }))}
                order={draftIds}
                onReorder={setDraftIds}
              />
            </div>
          ) : null}

          {!isCategoryOrdering ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                {isOrdering ? "Orden para" : "Filtro de categoria"}
              </p>
              <DashboardDescription className="mt-1 text-[13px]">
                {isOrdering
                  ? "Todo define el orden principal; cada categoria puede tener el suyo."
                  : "Reduce ruido y enfocate en una parte del menu."}
              </DashboardDescription>
            </div>
            <Select
              value={categoryFilter}
              onValueChange={handleCategoryChange}
              disabled={savingOrder || hasOrderChanges}
            >
              <SelectTrigger className="h-9 w-full rounded-lg border-black/8 bg-white shadow-none sm:w-[240px]">
                <SelectValue placeholder="Selecciona una categoria" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-black/8 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
                <SelectItem value="all">
                  {isOrdering ? "Todo (orden principal)" : "Todas las categorias"}
                </SelectItem>
                {availableCategories.map((category) => (
                  <SelectItem key={category._id} value={category._id}>
                    {category.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          ) : null}

          {orderingType === "products" && orderedProducts.length > 0 ? (
            <div className="rounded-2xl border border-[#20096F]/10 bg-[#f7f7ff] p-3 sm:p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <DashboardStatusPill tone={hasOrderChanges ? "accent" : "neutral"}>
                      {hasOrderChanges ? (
                        "Borrador sin guardar"
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Orden guardado
                        </>
                      )}
                    </DashboardStatusPill>
                  </div>
                  <DashboardDescription className="mt-2 text-[13px]">
                    Arrastra desde el asa o usa las flechas. El primer producto aparece hasta arriba.
                  </DashboardDescription>
                  {hasOrderChanges ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Guarda o descarta para cambiar de categoria.
                    </p>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-lg border-black/8 bg-white shadow-none"
                    disabled={!hasOrderChanges || savingOrder}
                    onClick={() => setDraftIds(savedIds)}
                  >
                    <Undo2 className="h-4 w-4" />
                    Descartar
                  </Button>
                  <Button
                    type="button"
                    className="rounded-lg bg-[#20096F] text-white hover:bg-[#180752]"
                    disabled={!hasOrderChanges || savingOrder}
                    onClick={handleSaveOrder}
                  >
                    <Save className="h-4 w-4" />
                    {savingOrder ? "Guardando..." : "Guardar orden"}
                  </Button>
                </div>
              </div>

              <SortableOrderList
                items={draftProducts.map((product) => ({
                  id: product._id,
                  label: product.name,
                  imageUrl: product.image
                    ? imageUrl(product.image).width(96).height(96).url()
                    : undefined,
                }))}
                order={draftIds}
                onReorder={setDraftIds}
              />
            </div>
          ) : isCategoryOrdering ? null : loading ? (
            <DashboardEmptyState
              title="Cargando productos"
              description="Estamos preparando el catalogo para esta tienda."
            />
          ) : orderedProducts.length === 0 ? (
            <DashboardEmptyState
              title="Sin productos para este filtro"
              description="Prueba otra categoria o agrega nuevos productos al menu."
            />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {orderedProducts.map((product) => (
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
