"use client";

import { DashboardPanel, DashboardPanelBody, DashboardStatusPill } from "./dashboard.design";
import { RequestStatusList } from "./RequestStatusList";
import type { ProductRequest, StoreRequest } from "./dashboard.types";
import { extractPlainTextFromBlocks, formatCurrency } from "./dashboard.utils";

type DashboardRequestsSectionProps = {
  productRequests: ProductRequest[];
  storeRequests: StoreRequest[];
};

export function DashboardRequestsSection({
  productRequests,
  storeRequests,
}: DashboardRequestsSectionProps) {
  const totalPending =
    productRequests.filter((request) => request.status === "pending").length +
    storeRequests.filter((request) => request.status === "pending").length;

  const mappedProductRequests = productRequests.map((request) => ({
    id: request._id,
    title: request.product?.name || "Producto",
    subtitle: request.product?.affiliateStore?.name || "Tienda sin nombre",
    status: request.status || "pending",
    date: request.submittedAt,
    rejectionReason: request.rejectionReason,
    details: [
      request.changes?.name ? `Nombre: ${request.changes.name}` : "",
      request.changes?.price != null ? `Precio: ${formatCurrency(Number(request.changes.price))}` : "",
      request.changes?.stock != null ? `Stock: ${request.changes.stock}` : "",
      request.changes?.description
        ? `Descripcion: ${extractPlainTextFromBlocks(request.changes.description).slice(0, 80)}`
        : "",
      Array.isArray(request.changes?.categories)
        ? `Categorias actualizadas: ${request.changes?.categories.length}`
        : "",
      Array.isArray(request.changes?.optionGroups)
        ? `Grupos de opciones: ${request.changes?.optionGroups.length}`
        : "",
    ].filter(Boolean),
  }));

  const mappedStoreRequests = storeRequests.map((request) => ({
    id: request._id,
    title: request.store?.name || "Tienda",
    subtitle: "Cambios de configuracion de la tienda",
    status: request.status,
    date: request.submittedAt,
    rejectionReason: request.rejectionReason,
    details: Object.keys(request.changes || {}).map((key) => {
      if (key === "isOpen") return "Estado operativo actualizado";
      if (key === "highDemandMode") return "Modo Alta Demanda actualizado";
      if (key === "serviceTypes") return "Tipos de servicio modificados";
      if (key === "operatingHours") return "Horarios actualizados";
      if (key === "contact") return "Contacto actualizado";
      if (key === "address") return "Direccion actualizada";
      return `${key} actualizado`;
    }),
  }));

  return (
    <div className="space-y-4">
      <DashboardPanel tone="subtle">
        <DashboardPanelBody className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-950">Flujo de solicitudes</p>
            <p className="mt-1 text-sm text-gray-600">
              Consulta cambios enviados, revisa aprobaciones y detecta rechazos sin cambiar de vista.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DashboardStatusPill tone={totalPending > 0 ? "warning" : "neutral"}>
              {totalPending} pendientes
            </DashboardStatusPill>
            <DashboardStatusPill tone="accent">{productRequests.length} de productos</DashboardStatusPill>
            <DashboardStatusPill tone="neutral">{storeRequests.length} de tienda</DashboardStatusPill>
          </div>
        </DashboardPanelBody>
      </DashboardPanel>

      <div className="grid gap-4 xl:grid-cols-2">
      <RequestStatusList
        title="Solicitudes de productos"
        description="Productos nuevos o cambios enviados para aprobacion."
        emptyMessage="No hay solicitudes de productos."
        items={mappedProductRequests}
      />
      <RequestStatusList
        title="Solicitudes de tienda"
        description="Cambios operativos y de configuracion enviados al admin."
        emptyMessage="No hay solicitudes de tienda."
        items={mappedStoreRequests}
      />
      </div>
    </div>
  );
}
