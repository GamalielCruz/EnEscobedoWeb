"use client";

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
    <div className="grid gap-6 xl:grid-cols-2">
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
  );
}
