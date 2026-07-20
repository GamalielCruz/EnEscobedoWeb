"use client";

import * as React from "react";

import DeliveryZonesAdmin from "@/components/DeliveryZonesAdmin";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  DashboardDescription,
  DashboardEyebrow,
  DashboardPanel,
  DashboardPanelBody,
  DashboardPanelHeader,
  DashboardStatusPill,
  DashboardTitle,
} from "./dashboard.design";
import { weekdays } from "./dashboard.constants";
import { RequestStatusList } from "./RequestStatusList";
import type { StoreConfig, StoreRequest, StoreSettingsDraft } from "./dashboard.types";
import { buildStoreChangesPayload, buildStoreSettingsDraft } from "./dashboard.utils";

type DashboardStoreSectionProps = {
  storeConfig: StoreConfig | null;
  storeRequests: StoreRequest[];
  submitting: boolean;
  onSubmitChanges: (changes: Record<string, unknown>) => Promise<boolean>;
};

export function DashboardStoreSection({
  storeConfig,
  storeRequests,
  submitting,
  onSubmitChanges,
}: DashboardStoreSectionProps) {
  const [draft, setDraft] = React.useState<StoreSettingsDraft>(() =>
    buildStoreSettingsDraft(storeConfig)
  );
  const [message, setMessage] = React.useState<string | null>(null);
  const pendingOwnDeliveryRequest = storeRequests.some(
    (request) => request.status === "pending" && typeof request.changes?.hasOwnDelivery === "boolean"
  );

  React.useEffect(() => {
    setDraft(buildStoreSettingsDraft(storeConfig));
  }, [storeConfig]);

  const historyItems = storeRequests.map((request) => ({
    id: request._id,
    title: request.store?.name || "Tienda",
    subtitle: "Solicitud de actualizacion",
    status: request.status,
    date: request.submittedAt,
    rejectionReason: request.rejectionReason,
    details: Object.keys(request.changes || {}).map((key) => `${key} actualizado`),
  }));

  const handleSubmit = async () => {
    const changes = buildStoreChangesPayload(storeConfig, draft);
    if (Object.keys(changes).length === 0) {
      setMessage("No hay cambios para enviar.");
      return;
    }

    const success = await onSubmitChanges(changes);
    setMessage(success ? "Solicitud enviada correctamente." : "No se pudo enviar la solicitud.");
  };

  const requestOwnDelivery = async (enabled: boolean) => {
    const success = await onSubmitChanges({ hasOwnDelivery: enabled });
    setMessage(success ? "Solicitud de reparto enviada correctamente." : "No se pudo enviar la solicitud.");
  };

  return (
    <div className="space-y-5">
      <DashboardPanel tone="subtle">
        <DashboardPanelBody className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <DashboardEyebrow>Configuracion</DashboardEyebrow>
            <DashboardTitle className="mt-1 text-[17px]">Mi tienda</DashboardTitle>
            <DashboardDescription className="mt-1">
              Agrupa datos operativos, disponibilidad y delivery antes de enviar cambios al administrador.
            </DashboardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DashboardStatusPill tone={draft.isOpen ? "success" : "danger"}>
              {draft.isOpen ? "Abierta" : "Cerrada"}
            </DashboardStatusPill>
            <DashboardStatusPill tone={draft.highDemandMode ? "warning" : "neutral"}>
              {draft.highDemandMode ? "Alta demanda" : "Operacion normal"}
            </DashboardStatusPill>
            <DashboardStatusPill tone="neutral">
              {storeRequests.filter((request) => request.status === "pending").length} pendientes
            </DashboardStatusPill>
          </div>
        </DashboardPanelBody>
      </DashboardPanel>

      {message ? (
        <div className="rounded-xl border border-[#20096F]/10 bg-[#eff2ff] px-4 py-3 text-sm text-[#20096F]">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardPanel>
          <DashboardPanelHeader>
            <DashboardEyebrow>Perfil</DashboardEyebrow>
            <DashboardTitle className="text-[17px]">Informacion general</DashboardTitle>
            <DashboardDescription>Datos visibles y operativos del negocio.</DashboardDescription>
          </DashboardPanelHeader>
          <DashboardPanelBody className="space-y-4">
            <div>
              <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                Nombre de la tienda
              </Label>
              <Input
                className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Telefono
                </Label>
                <Input
                  className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                  value={draft.contact.phone}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      contact: { ...current.contact, phone: event.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Email
                </Label>
                <Input
                  className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                  value={draft.contact.email}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      contact: { ...current.contact, email: event.target.value },
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                Encargado
              </Label>
              <Input
                className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                value={draft.contact.manager}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    contact: { ...current.contact, manager: event.target.value },
                  }))
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Calle
                </Label>
                <Input
                  className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                  value={draft.address.street}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      address: { ...current.address, street: event.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Ciudad
                </Label>
                <Input
                  className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                  value={draft.address.city}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      address: { ...current.address, city: event.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Estado
                </Label>
                <Input
                  className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                  value={draft.address.state}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      address: { ...current.address, state: event.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Codigo postal
                </Label>
                <Input
                  className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                  value={draft.address.postalCode}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      address: { ...current.address, postalCode: event.target.value },
                    }))
                  }
                />
              </div>
            </div>
          </DashboardPanelBody>
        </DashboardPanel>

        <DashboardPanel>
          <DashboardPanelHeader>
            <DashboardEyebrow>Operacion</DashboardEyebrow>
            <DashboardTitle className="text-[17px]">Servicio y delivery</DashboardTitle>
            <DashboardDescription>Disponibilidad, tipos de servicio y parametros de entrega.</DashboardDescription>
          </DashboardPanelHeader>
          <DashboardPanelBody className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-black/6 bg-[#fafafb] px-3 py-3">
                <div className="flex items-center gap-2">
                <Checkbox
                  id="draft-is-open"
                  checked={draft.isOpen}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, isOpen: Boolean(checked) }))
                  }
                />
                  <Label htmlFor="draft-is-open">Tienda abierta</Label>
                </div>
                <p className="mt-2 text-[13px] text-gray-600">
                  Si esta desactivada, el cliente no deberia poder generar pedidos nuevos.
                </p>
              </div>
              <div className="rounded-xl border border-black/6 bg-[#fafafb] px-3 py-3">
                <div className="flex items-center gap-2">
                <Checkbox
                  id="draft-high-demand"
                  checked={draft.highDemandMode}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      highDemandMode: Boolean(checked),
                      serviceTypes: {
                        ...current.serviceTypes,
                        onDemand: Boolean(checked),
                      },
                    }))
                  }
                />
                  <Label htmlFor="draft-high-demand">Alta demanda</Label>
                </div>
                <p className="mt-2 text-[13px] text-gray-600">
                  Informa retrasos y suma minutos al estimado cuando la cocina va saturada.
                </p>
              </div>
              <div className="rounded-xl border border-black/6 bg-[#fafafb] px-3 py-3">
                <div className="flex items-center gap-2">
                <Checkbox
                  id="draft-delivery"
                  checked={draft.serviceTypes.delivery}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      serviceTypes: { ...current.serviceTypes, delivery: Boolean(checked) },
                    }))
                  }
                />
                  <Label htmlFor="draft-delivery">Entrega a domicilio</Label>
                </div>
                <p className="mt-2 text-[13px] text-gray-600">Mantiene habilitado el flujo de delivery.</p>
              </div>
              <div className="rounded-xl border border-black/6 bg-[#fafafb] px-3 py-3">
                <div className="flex items-center gap-2">
                <Checkbox
                  id="draft-pickup"
                  checked={draft.serviceTypes.pickup}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      serviceTypes: { ...current.serviceTypes, pickup: Boolean(checked) },
                    }))
                  }
                />
                  <Label htmlFor="draft-pickup">Recoger en tienda</Label>
                </div>
                <p className="mt-2 text-[13px] text-gray-600">Permite pedidos para recoger en sucursal.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Radio de entrega
                </Label>
                <Input
                  className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                  type="number"
                  value={draft.serviceTypes.deliveryRadius}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      serviceTypes: {
                        ...current.serviceTypes,
                        deliveryRadius: Number(event.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Pedido minimo
                </Label>
                <Input
                  className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                  type="number"
                  value={draft.serviceTypes.minimumOrderDelivery}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      serviceTypes: {
                        ...current.serviceTypes,
                        minimumOrderDelivery: Number(event.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  Minutos extra por alta demanda
                </Label>
                <Input
                  className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                  type="number"
                  value={draft.serviceTypes.onDemandExtraMinutes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      serviceTypes: {
                        ...current.serviceTypes,
                        onDemandExtraMinutes: Number(event.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border border-black/6 bg-[#fafafb] px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {storeConfig?.hasOwnDelivery ? "Repartidores propios habilitados" : "¿Cuentas con repartidores propios?"}
                  </p>
                  <p className="mt-1 text-[13px] text-gray-600">
                    {storeConfig?.hasOwnDelivery
                      ? "El costo de envio corresponde a tu restaurante y se calcula con tus zonas."
                      : "Solicita administrar tus propias zonas y costos de entrega."}
                  </p>
                  <p className="mt-1 text-[13px] text-gray-600">
                    Comision de El Menu sobre productos: {storeConfig?.platformCommissionPercent != null
                      ? `${storeConfig.platformCommissionPercent}%`
                      : "segun convenio"}.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting || pendingOwnDeliveryRequest}
                  onClick={() => requestOwnDelivery(!storeConfig?.hasOwnDelivery)}
                >
                  {pendingOwnDeliveryRequest
                    ? "Solicitud pendiente"
                    : storeConfig?.hasOwnDelivery
                      ? "Solicitar reparto de El Menu"
                      : "Solicitar entregas propias"}
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                className="h-10 rounded-lg bg-[#EB1902] px-4 text-white hover:bg-[#850C22]"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Enviando..." : "Solicitar cambios"}
              </Button>
            </div>
          </DashboardPanelBody>
        </DashboardPanel>
      </div>

      {storeConfig?.hasOwnDelivery ? (
        <DashboardPanel>
          <DashboardPanelBody className="py-5">
            <DeliveryZonesAdmin
              storeId={storeConfig._id}
              center={
                typeof storeConfig.coordinates?.latitude === "number" &&
                typeof storeConfig.coordinates?.longitude === "number"
                  ? { lat: storeConfig.coordinates.latitude, lng: storeConfig.coordinates.longitude }
                  : undefined
              }
            />
          </DashboardPanelBody>
        </DashboardPanel>
      ) : null}

      <DashboardPanel>
        <DashboardPanelHeader>
          <DashboardEyebrow>Horarios</DashboardEyebrow>
          <DashboardTitle className="text-[17px]">Disponibilidad semanal</DashboardTitle>
          <DashboardDescription>Define los horarios operativos por dia y mantenlos claros para el admin.</DashboardDescription>
        </DashboardPanelHeader>
        <DashboardPanelBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {weekdays.map((day) => (
            <div key={day.key}>
              <Label className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                {day.label}
              </Label>
              <Input
                className="mt-1 h-10 rounded-lg border-black/8 shadow-none"
                value={draft.operatingHours[day.key as keyof StoreSettingsDraft["operatingHours"]]}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    operatingHours: {
                      ...current.operatingHours,
                      [day.key]: event.target.value,
                    },
                  }))
                }
              />
            </div>
          ))}
        </DashboardPanelBody>
      </DashboardPanel>

      <RequestStatusList
        title="Historial de solicitudes"
        description="Seguimiento de cambios enviados al administrador."
        emptyMessage="No hay solicitudes de tienda registradas."
        items={historyItems}
      />
    </div>
  );
}
