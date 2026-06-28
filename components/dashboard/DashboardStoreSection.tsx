"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  return (
    <div className="space-y-6">
      {message ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informacion general</CardTitle>
            <CardDescription>Datos visibles y operativos de la tienda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nombre de la tienda</Label>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Telefono</Label>
                <Input
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
                <Label>Email</Label>
                <Input
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
              <Label>Encargado</Label>
              <Input
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
                <Label>Calle</Label>
                <Input
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
                <Label>Ciudad</Label>
                <Input
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
                <Label>Estado</Label>
                <Input
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
                <Label>Codigo postal</Label>
                <Input
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Servicio y delivery</CardTitle>
            <CardDescription>Tipos de servicio, estado y ajustes de entrega.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Radio de entrega</Label>
                <Input
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
                <Label>Pedido minimo</Label>
                <Input
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
                <Label>Minutos extra por alta demanda</Label>
                <Input
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

            <div className="flex justify-end">
              <Button
                type="button"
                className="bg-[#ff8800] text-gray-900 hover:bg-[#ff8800]/90"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Enviando..." : "Solicitar cambios"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Horarios</CardTitle>
          <CardDescription>Define los horarios operativos por dia.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {weekdays.map((day) => (
            <div key={day.key}>
              <Label>{day.label}</Label>
              <Input
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
        </CardContent>
      </Card>

      <RequestStatusList
        title="Historial de solicitudes"
        description="Seguimiento de cambios enviados al administrador."
        emptyMessage="No hay solicitudes de tienda registradas."
        items={historyItems}
      />
    </div>
  );
}
