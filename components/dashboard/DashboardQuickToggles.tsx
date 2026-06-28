"use client";

import { Loader2, Store, Zap } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DashboardQuickTogglesProps = {
  isOpen: boolean;
  highDemandMode: boolean;
  saving: boolean;
  onToggleOpen: (nextValue: boolean) => void;
  onToggleHighDemand: (nextValue: boolean) => void;
};

function ToggleCard({
  title,
  description,
  active,
  disabled,
  onToggle,
  icon,
  iconClassName,
}: {
  title: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  iconClassName: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-full ${iconClassName}`}>
          {icon}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{title}</p>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
          active ? "bg-[#ff8800]" : "bg-gray-300"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
            active ? "translate-x-7" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export function DashboardQuickToggles({
  isOpen,
  highDemandMode,
  saving,
  onToggleOpen,
  onToggleHighDemand,
}: DashboardQuickTogglesProps) {
  return (
    <Card className="border-orange-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          Switches Express
          {saving ? <Loader2 className="h-4 w-4 animate-spin text-[#ff8800]" /> : null}
        </CardTitle>
        <CardDescription>Cambia el estado operativo visible para el cliente en segundos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleCard
          title={isOpen ? "Tienda Abierta" : "Tienda Cerrada"}
          description="Cuando esta cerrada no acepta nuevos pedidos."
          active={isOpen}
          disabled={saving}
          onToggle={() => onToggleOpen(!isOpen)}
          icon={<Store className="h-5 w-5" />}
          iconClassName={isOpen ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}
        />
        <ToggleCard
          title={highDemandMode ? "Alta Demanda Activa" : "Alta Demanda Inactiva"}
          description="Muestra un aviso de demoras y ajusta el tiempo estimado."
          active={highDemandMode}
          disabled={saving}
          onToggle={() => onToggleHighDemand(!highDemandMode)}
          icon={<Zap className="h-5 w-5" />}
          iconClassName="bg-orange-100 text-[#eb1902]"
        />
      </CardContent>
    </Card>
  );
}
