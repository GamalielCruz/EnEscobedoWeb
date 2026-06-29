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

type ManualOperationalStatus = "open" | "closed" | "auto";

type DashboardQuickTogglesProps = {
  isOpen: boolean;
  manualOperationalStatus: ManualOperationalStatus;
  highDemandMode: boolean;
  saving: boolean;
  onOperationalStatusChange: (nextValue: ManualOperationalStatus) => void;
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

const operationalOptions: Array<{ value: ManualOperationalStatus; label: string }> = [
  { value: "closed", label: "Cerrada" },
  { value: "open", label: "Abierta" },
  { value: "auto", label: "Horario" },
];

function getOperationalCopy(manualOperationalStatus: ManualOperationalStatus, isOpen: boolean) {
  if (manualOperationalStatus === "open") {
    return {
      title: "Apertura manual activa",
      description: "La tienda permanece abierta hasta que la cambies o elijas horario.",
      pill: "Abierta manual",
    };
  }

  if (manualOperationalStatus === "closed") {
    return {
      title: "Cierre manual activo",
      description: "La tienda no acepta pedidos nuevos hasta volver a abrirla o usar horario.",
      pill: "Cerrada manual",
    };
  }

  return {
    title: isOpen ? "Siguiendo horario: abierta" : "Siguiendo horario: cerrada",
    description: "Respeta los horarios configurados automaticamente.",
    pill: "Modo horario",
  };
}

export function DashboardQuickToggles({
  isOpen,
  manualOperationalStatus,
  highDemandMode,
  saving,
  onOperationalStatusChange,
  onToggleHighDemand,
}: DashboardQuickTogglesProps) {
  const operationalCopy = getOperationalCopy(manualOperationalStatus, isOpen);

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
        <div className="rounded-xl border border-black/6 bg-[#fafafb] px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${isOpen ? "bg-[#20096F]/10 text-[#20096F]" : "bg-[#EB1902]/10 text-[#EB1902]"}`}>
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{operationalCopy.title}</p>
              <p className="mt-0.5 text-[13px] leading-5 text-gray-600">{operationalCopy.description}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {operationalOptions.map((option) => {
                  const active = manualOperationalStatus === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={saving}
                      onClick={() => onOperationalStatusChange(option.value)}
                      className={`h-10 rounded-lg border px-3 text-sm font-medium transition-colors ${
                        active
                          ? "border-[#EB1902] bg-[#fff3f0] text-[#850C22]"
                          : "border-black/8 bg-white text-gray-700 hover:bg-gray-50"
                      } disabled:opacity-50`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
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
          <DashboardStatusPill tone="neutral">{operationalCopy.pill}</DashboardStatusPill>
          <DashboardStatusPill tone={highDemandMode ? "warning" : "neutral"}>
            {isOpen && highDemandMode ? "Demoras visibles al cliente" : "Operacion normal"}
          </DashboardStatusPill>
        </div>
      </DashboardPanelBody>
    </DashboardPanel>
  );
}
