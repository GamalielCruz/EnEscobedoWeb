"use client";

import { Loader2, Store, Zap } from "lucide-react";

import {
  DashboardDescription,
  DashboardEyebrow,
  DashboardPanel,
  DashboardPanelBody,
  DashboardPanelHeader,
  DashboardStatusPill,
  DashboardTitle,
} from "./dashboard.design";

type DashboardQuickTogglesProps = {
  isOpen: boolean;
  manualOperationalStatus: "open" | "closed" | "auto";
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
    <div className="flex items-center justify-between gap-4 rounded-xl border border-black/6 bg-[#fafafb] px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${iconClassName}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-gray-600">{description}</p>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${
          active
            ? "border-[#EB1902]/15 bg-[#EB1902]"
            : "border-gray-200 bg-gray-200"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            active ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export function DashboardQuickToggles({
  isOpen,
  manualOperationalStatus,
  highDemandMode,
  saving,
  onToggleOpen,
  onToggleHighDemand,
}: DashboardQuickTogglesProps) {
  return (
    <DashboardPanel>
      <DashboardPanelHeader>
        <DashboardEyebrow>Operacion</DashboardEyebrow>
        <div className="flex items-center gap-2">
          <DashboardTitle className="text-[17px]">Controles rapidos</DashboardTitle>
          {saving ? <Loader2 className="h-4 w-4 animate-spin text-[#EB1902]" /> : null}
        </div>
        <DashboardDescription>
          Ajusta el estado de la tienda sin entrar a configuracion avanzada.
        </DashboardDescription>
      </DashboardPanelHeader>
      <DashboardPanelBody className="space-y-3">
        <ToggleCard
          title={isOpen ? "Tienda Abierta" : "Tienda Cerrada"}
          description="Cuando esta cerrada no acepta nuevos pedidos."
          active={isOpen}
          disabled={saving}
          onToggle={() => onToggleOpen(!isOpen)}
          icon={<Store className="h-5 w-5" />}
          iconClassName={isOpen ? "bg-[#20096F]/10 text-[#20096F]" : "bg-[#EB1902]/10 text-[#EB1902]"}
        />
        <ToggleCard
          title={highDemandMode ? "Alta Demanda Activa" : "Alta Demanda Inactiva"}
          description="Muestra un aviso de demoras y ajusta el tiempo estimado."
          active={highDemandMode}
          disabled={saving}
          onToggle={() => onToggleHighDemand(!highDemandMode)}
          icon={<Zap className="h-5 w-5" />}
          iconClassName="bg-[#fff3f4] text-[#850C22]"
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <DashboardStatusPill tone={isOpen ? "success" : "danger"}>
            {isOpen ? "Recibiendo pedidos" : "Pausada"}
          </DashboardStatusPill>
          <DashboardStatusPill tone={highDemandMode ? "warning" : "neutral"}>
            {isOpen && highDemandMode ? "Demoras visibles al cliente" : "Operacion normal"}
          </DashboardStatusPill>
        </div>
      </DashboardPanelBody>
    </DashboardPanel>
  );
}
