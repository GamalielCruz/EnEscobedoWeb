"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { DashboardClaimStoreView } from "@/components/dashboard/DashboardClaimStoreView";
import { DashboardHomeSection } from "@/components/dashboard/DashboardHomeSection";
import { DashboardOrdersSection } from "@/components/dashboard/DashboardOrdersSection";
import { DashboardProductsSection } from "@/components/dashboard/DashboardProductsSection";
import { DashboardRequestsSection } from "@/components/dashboard/DashboardRequestsSection";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardStoreSection } from "@/components/dashboard/DashboardStoreSection";
import type { SectionKey } from "@/components/dashboard/dashboard.types";
import { getStoreOperationalState } from "@/lib/storeOperationalState";
import { useDashboardData } from "@/components/dashboard/useDashboardData";

export default function DashboardPage() {
  const [section, setSection] = React.useState<SectionKey>("inicio");
  const [updatingOrderNumber, setUpdatingOrderNumber] = React.useState<string | null>(null);

  const {
    isLoaded,
    user,
    loadingStores,
    ownedStores,
    availableStores,
    loadingAvailableStores,
    claimingStoreId,
    selectedStoreId,
    setSelectedStoreId,
    selectedStore,
    storeConfig,
    savingStoreConfig,
    submittingStoreRequest,
    products,
    productOrdering,
    productsLoading,
    refreshingProducts,
    availableCategories,
    activeOrders,
    todayOrders,
    historyOrders,
    todayOrdersLoading,
    historyOrdersLoading,
    todayLastUpdate,
    historyLastUpdate,
    productRequests,
    storeRequests,
    pendingChanges,
    metrics,
    refreshAvailableStores,
    claimStore,
    refreshProducts,
    loadCategories,
    createCategory,
    saveStoreConfig,
    updateOrderStatus,
    uploadProductImage,
    submitProduct,
    updateProductAvailability,
    saveProductOrder,
    submitStoreChanges,
    refreshActiveOrders,
    refreshTodayOrders,
    refreshHistoryOrders,
  } = useDashboardData();

  const handleUpdateOrderStatus = async (
    orderId: string,
    orderNumber: string,
    status: string
  ) => {
    setUpdatingOrderNumber(orderNumber);
    try {
      await updateOrderStatus(orderId, orderNumber, status);
    } finally {
      setUpdatingOrderNumber(null);
    }
  };

  if (!isLoaded || loadingStores) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-gray-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-[#ff8800]" />
          <span>Cargando dashboard...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Inicia sesion</h1>
          <p className="mt-2 text-gray-600">
            Necesitas acceder con tu cuenta para ver el panel del dueno.
          </p>
        </div>
      </div>
    );
  }

  if (!selectedStore && ownedStores.length === 0) {
    return (
      <DashboardClaimStoreView
        loading={loadingAvailableStores}
        stores={availableStores}
        claimingStoreId={claimingStoreId}
        onClaimStore={claimStore}
        onReload={refreshAvailableStores}
      />
    );
  }

  const storeOperationalState = getStoreOperationalState(storeConfig);
  const isOpen = storeOperationalState.effectiveIsOpen;
  const highDemandMode = storeOperationalState.highDemandMode;

  return (
    <DashboardShell
      currentSection={section}
      onSectionChange={setSection}
      storeName={selectedStore?.name || "Mi tienda"}
      stores={ownedStores}
      selectedStoreId={selectedStoreId}
      onSelectStore={setSelectedStoreId}
      isOpen={isOpen}
      highDemandMode={highDemandMode}
    >
      {section === "inicio" ? (
        <DashboardHomeSection
          metrics={metrics}
          activeOrders={activeOrders}
          isOpen={isOpen}
          highDemandMode={highDemandMode}
          savingConfig={savingStoreConfig}
          onOperationalStatusChange={(nextValue) =>
            saveStoreConfig({
              isOpen: nextValue !== "closed",
              manualOperationalStatus: nextValue,
            })
          }
          manualOperationalStatus={storeOperationalState.manualOperationalStatus ?? "auto"}
          onToggleHighDemand={(nextValue) =>
            saveStoreConfig({ highDemandMode: nextValue })
          }
          onGoToOrders={() => setSection("pedidos")}
          onGoToProducts={() => setSection("productos")}
          onGoToStore={() => setSection("mi-tienda")}
        />
      ) : null}

      {section === "pedidos" ? (
        <DashboardOrdersSection
          activeOrders={activeOrders}
          todayOrders={todayOrders}
          historyOrders={historyOrders}
          currentOrdersLoading={todayOrdersLoading || historyOrdersLoading}
          currentLastUpdate={todayLastUpdate || historyLastUpdate}
          updatingOrderNumber={updatingOrderNumber}
          onRefreshActiveOrders={refreshActiveOrders}
          onRefreshTodayOrders={refreshTodayOrders}
          onRefreshHistoryOrders={refreshHistoryOrders}
          onUpdateOrderStatus={handleUpdateOrderStatus}
        />
      ) : null}

      {section === "productos" ? (
        <DashboardProductsSection
          key={selectedStoreId}
          products={products}
          productOrdering={productOrdering}
          pendingChanges={pendingChanges}
          loading={productsLoading}
          refreshing={refreshingProducts}
          availableCategories={availableCategories}
          loadCategories={loadCategories}
          onCreateCategory={createCategory}
          onRefresh={refreshProducts}
          onSubmitProduct={submitProduct}
          onUpdateAvailability={updateProductAvailability}
          onSaveProductOrder={saveProductOrder}
          onImageUpload={uploadProductImage}
        />
      ) : null}

      {section === "mi-tienda" ? (
        <DashboardStoreSection
          storeConfig={storeConfig}
          storeRequests={storeRequests}
          submitting={submittingStoreRequest}
          onSubmitChanges={submitStoreChanges}
        />
      ) : null}

      {section === "solicitudes" ? (
        <DashboardRequestsSection
          productRequests={productRequests}
          storeRequests={storeRequests}
        />
      ) : null}
    </DashboardShell>
  );
}

