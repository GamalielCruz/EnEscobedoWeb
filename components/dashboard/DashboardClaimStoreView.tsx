"use client";

import { Building2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

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
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <DashboardPanel>
        <DashboardPanelHeader align="spread">
          <div>
            <DashboardEyebrow>Acceso inicial</DashboardEyebrow>
            <DashboardTitle className="mt-1">Activa tu panel</DashboardTitle>
            <DashboardDescription className="mt-1">
              Aun no hay una tienda asociada a tu cuenta. Selecciona una tienda disponible para comenzar.
            </DashboardDescription>
          </div>
          <DashboardStatusPill tone="neutral">{stores.length} tiendas disponibles</DashboardStatusPill>
        </DashboardPanelHeader>
        <DashboardPanelBody className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-black/8 px-3 shadow-none"
              onClick={onReload}
              disabled={loading}
            >
              Recargar tiendas
            </Button>
          </div>

          {loading ? (
            <DashboardEmptyState
              title="Cargando tiendas disponibles"
              description="Espera un momento mientras consultamos las sucursales que puedes reclamar."
            />
          ) : stores.length === 0 ? (
            <DashboardEmptyState
              title="No hay tiendas para reclamar"
              description="Cuando exista una tienda disponible la veras aqui."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {stores.map((store) => (
                <DashboardPanel key={store._id} className="px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#fff1ef] text-[#850C22]">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{store.name}</p>
                        <p className="text-sm text-gray-500">Disponible para asociar</p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      className="h-9 rounded-lg bg-[#EB1902] px-3 text-white hover:bg-[#850C22]"
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
                  </div>
                </DashboardPanel>
              ))}
            </div>
          )}
        </DashboardPanelBody>
      </DashboardPanel>
    </div>
  );
}
