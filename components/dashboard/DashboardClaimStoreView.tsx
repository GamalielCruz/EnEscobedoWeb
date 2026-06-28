"use client";

import { Building2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type StoreOption = {
  _id: string;
  name: string;
};

type DashboardClaimStoreViewProps = {
  loading: boolean;
  stores: StoreOption[];
  claimingStoreId: string | null;
  onClaimStore: (storeId: string) => void;
  onReload: () => void;
};

export function DashboardClaimStoreView({
  loading,
  stores,
  claimingStoreId,
  onClaimStore,
  onReload,
}: DashboardClaimStoreViewProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Activa tu panel</CardTitle>
          <CardDescription>
            Aun no hay una tienda asociada a tu cuenta. Selecciona una tienda disponible para comenzar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onReload} disabled={loading}>
              Recargar tiendas
            </Button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
              Cargando tiendas disponibles...
            </div>
          ) : stores.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
              No hay tiendas disponibles para reclamar.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {stores.map((store) => (
                <Card key={store._id} className="border-gray-200">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-[#ff8800]">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{store.name}</p>
                        <p className="text-sm text-gray-500">Disponible para asociar</p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      className="bg-[#ff8800] text-gray-900 hover:bg-[#ff8800]/90"
                      disabled={claimingStoreId === store._id}
                      onClick={() => onClaimStore(store._id)}
                    >
                      {claimingStoreId === store._id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Asociando
                        </>
                      ) : (
                        "Reclamar"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
