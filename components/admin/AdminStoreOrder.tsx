"use client";

import * as React from "react";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { Check, Save, Undo2 } from "lucide-react";

import { SortableOrderList } from "@/components/SortableOrderList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { imageUrl } from "@/lib/imageUrl";

export type HomepageStore = {
  _id: string;
  name?: string | null;
  image?: SanityImageSource;
  address?: { city?: string | null } | null;
};

export function AdminStoreOrder({ stores }: { stores: HomepageStore[] }) {
  const [savedIds, setSavedIds] = React.useState(() => stores.map((store) => store._id));
  const [draftIds, setDraftIds] = React.useState(() => stores.map((store) => store._id));
  const [saving, setSaving] = React.useState(false);
  const hasChanges = draftIds.join("\u0000") !== savedIds.join("\u0000");
  const storesById = new Map(stores.map((store) => [store._id, store]));
  const orderedStores = draftIds
    .map((storeId) => storesById.get(storeId))
    .filter((store): store is HomepageStore => Boolean(store));

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/store-order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeIds: draftIds }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(data.error || "No se pudo guardar el orden");
        return;
      }
      setSavedIds([...draftIds]);
    } catch {
      alert("No se pudo guardar el orden");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Orden de tiendas en portada</CardTitle>
            <CardDescription className="mt-1">
              La primera tienda aparece primero en la pagina principal. Los filtros y la paginacion conservan este orden.
            </CardDescription>
          </div>
          <div
            className={
              "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium " +
              (hasChanges
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800")
            }
          >
            {!hasChanges ? <Check className="h-3.5 w-3.5" /> : null}
            {hasChanges ? "Borrador sin guardar" : "Orden guardado"}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {orderedStores.length > 0 ? (
          <SortableOrderList
            items={orderedStores.map((store) => ({
              id: store._id,
              label: store.name || "Tienda sin nombre",
              description: store.address?.city || undefined,
              imageUrl: store.image
                ? imageUrl(store.image).width(96).height(96).url()
                : undefined,
            }))}
            order={draftIds}
            onReorder={setDraftIds}
          />
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-500">
            No hay tiendas activas para ordenar.
          </p>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={!hasChanges || saving}
            onClick={() => setDraftIds([...savedIds])}
          >
            <Undo2 className="h-4 w-4" />
            Descartar
          </Button>
          <Button
            type="button"
            className="bg-[#ff8800] text-gray-950 hover:bg-[#ff8800]/90"
            disabled={!hasChanges || saving}
            onClick={save}
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar orden"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
