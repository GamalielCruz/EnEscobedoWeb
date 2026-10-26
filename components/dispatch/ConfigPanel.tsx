"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { DispatchConfig, DispatchMode } from "@/lib/dispatch/dispatch-config";

type Props = {
  config: DispatchConfig | null;
  loading: boolean;
  saving: boolean;
  onSave: (config: DispatchConfig) => void;
};

function NumberField({
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <Label className="text-xs font-bold text-[#09193B] dark:text-slate-200">{label}</Label>
      <p className="mb-1 text-[10px] text-slate-400 dark:text-slate-500">{hint}</p>
      <div className="relative">
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 rounded-lg border-slate-200 pr-10 text-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-slate-200 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} className="mt-0.5 border-slate-300 dark:border-slate-600" />
      <span>
        <span className="block text-xs font-bold text-[#09193B] dark:text-slate-200">{label}</span>
        <span className="block text-[10px] text-slate-400 dark:text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

export function ConfigPanel({ config, loading, saving, onSave }: Props) {
  const [draft, setDraft] = useState<DispatchConfig | null>(config);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  if (loading && !config) {
    return (
      <div className="w-full space-y-4 rounded-xl border border-black/6 bg-white p-5 dark:border-white/10 dark:bg-[#0d1526]">
        <Skeleton className="h-6 w-52" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!draft) return null;

  const modes: DispatchMode[] = ["auto", "manual", "assisted"];

  return (
    <div className="w-full overflow-y-auto rounded-xl border border-black/6 bg-white p-5 dark:border-white/10 dark:bg-[#0d1526]">
      <div className="mb-4 flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-[#EB1902]" />
        <div>
          <h2 className="text-sm font-bold text-[#09193B] dark:text-white">Configuración del Dispatch Center</h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Estos parámetros controlan el algoritmo de asignación y las reglas de capacidad.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Columna 1: modo y distancias */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 p-4 dark:border-white/10">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Modo de operación</p>
            <div className="grid grid-cols-3 gap-2">
              {modes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraft({ ...draft, mode: m })}
                  className={`rounded-lg border-2 px-2 py-2 text-center text-[11px] font-bold transition-all ${
                    draft.mode === m
                      ? "border-[#EB1902] bg-rose-50/50 text-[#EB1902] dark:bg-rose-500/10 dark:text-rose-300"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-white/10 dark:text-slate-400"
                  }`}
                >
                  {m === "auto" ? "Automático" : m === "manual" ? "Manual" : "Asistido"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-400 dark:text-slate-500">
              {draft.mode === "auto"
                ? "El algoritmo ofrece pedidos automáticamente por WhatsApp."
                : draft.mode === "manual"
                  ? "Sin ofertas automáticas: todo se asigna desde el Dispatch Center."
                  : "El sistema recomienda al mejor repartidor y tú confirmas."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Distancia máxima"
              hint="Máx. ruta origen → destino"
              value={draft.maxDistanceKm}
              suffix="km"
              onChange={(v) => setDraft({ ...draft, maxDistanceKm: v })}
            />
            <NumberField
              label="Radio de búsqueda"
              hint="Búsqueda de repartidores"
              value={draft.searchRadiusKm}
              suffix="km"
              onChange={(v) => setDraft({ ...draft, searchRadiusKm: v })}
            />
            <NumberField
              label="Máx. pedidos / repartidor"
              hint="Capacidad simultánea"
              value={draft.maxOrdersPerDriver}
              onChange={(v) => setDraft({ ...draft, maxOrdersPerDriver: Math.max(1, Math.round(v)) })}
            />
            <NumberField
              label="Escalar a los"
              hint="Minutos sin repartidor"
              value={draft.maxWaitMinutesBeforeEscalate}
              suffix="min"
              onChange={(v) => setDraft({ ...draft, maxWaitMinutesBeforeEscalate: Math.max(1, Math.round(v)) })}
            />
          </div>
        </div>

        {/* Columna 2: reglas */}
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Prioridades y mezcla</p>
          <ToggleField
            label="Priorizar Mandados"
            hint="Los mandados se asignan antes que los pedidos de restaurante."
            checked={draft.prioritizeMandados}
            onChange={(v) => setDraft({ ...draft, prioritizeMandados: v })}
          />
          <ToggleField
            label="Priorizar Restaurantes"
            hint="Los pedidos de restaurante se asignan antes que los mandados."
            checked={draft.prioritizeRestaurants}
            onChange={(v) => setDraft({ ...draft, prioritizeRestaurants: v })}
          />
          <ToggleField
            label="Permitir múltiples pedidos"
            hint="Un repartidor puede llevar más de un pedido a la vez."
            checked={draft.allowMultipleOrders}
            onChange={(v) => setDraft({ ...draft, allowMultipleOrders: v })}
          />
          <ToggleField
            label="Mezclar restaurantes"
            hint="Un repartidor puede combinar pedidos de restaurantes distintos."
            checked={draft.allowMixStores}
            onChange={(v) => setDraft({ ...draft, allowMixStores: v })}
          />
          <ToggleField
            label="Mezclar Mandados"
            hint="Un repartidor puede combinar varios mandados."
            checked={draft.allowMixMandados}
            onChange={(v) => setDraft({ ...draft, allowMixMandados: v })}
          />
          <ToggleField
            label="Restaurante + Mandado"
            hint="Permite que un repartidor combine restaurantes con mandados."
            checked={draft.allowMixRestaurantMandado}
            onChange={(v) => setDraft({ ...draft, allowMixRestaurantMandado: v })}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            Guardado
          </span>
        )}
        <Button
          type="button"
          onClick={() => {
            onSave(draft);
            setSaved(true);
          }}
          disabled={saving}
          className="bg-[#EB1902] text-white transition hover:bg-[#c81502]"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar configuración
        </Button>
        {draft.mode === "manual" && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            En modo manual no se envían ofertas automáticas.
          </span>
        )}
      </div>
    </div>
  );
}
