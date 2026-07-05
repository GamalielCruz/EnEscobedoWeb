"use client";

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
  void loading;
  void stores;
  void claimingStoreId;
  void onClaimStore;
  void onReload;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <DashboardPanel>
        <DashboardPanelHeader align="spread">
          <div>
            <DashboardEyebrow>Acceso restringido</DashboardEyebrow>
            <DashboardTitle className="mt-1">No tienes una tienda asignada</DashboardTitle>
            <DashboardDescription className="mt-1">
              Esta cuenta no tiene permiso para entrar al dashboard de ninguna tienda. Si necesitas acceso, pide al administrador que te asigne la sucursal correcta.
            </DashboardDescription>
          </div>
          <DashboardStatusPill tone="neutral">Sin acceso</DashboardStatusPill>
        </DashboardPanelHeader>
        <DashboardPanelBody>
          <DashboardEmptyState
            title="Tu cuenta todavia no tiene sucursal"
            description="El dashboard solo se habilita para usuarios que ya son duenos o administradores de una tienda."
          />
        </DashboardPanelBody>
      </DashboardPanel>
    </div>
  );
}
