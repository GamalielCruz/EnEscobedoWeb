"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CommercialPlan,
  CommercialPlanId,
  CommercialSettings,
  EffectiveCommercialConditions,
} from "@/lib/commercial-rules";

type StoreRow = {
  _id: string;
  name?: string;
  commercialPlanId?: CommercialPlanId;
  commercialNotes?: string;
  commercialReviewRequired?: boolean;
  effective: EffectiveCommercialConditions;
  accumulatedCommission: number;
};

type Snapshot = { settings: CommercialSettings; stores: StoreRow[] };

const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value || 0);

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function PlanEditor({
  plan,
  onChange,
}: {
  plan: CommercialPlan;
  onChange: (plan: CommercialPlan) => void;
}) {
  const set = <K extends keyof CommercialPlan>(key: K, value: CommercialPlan[K]) => {
    const next = { ...plan, [key]: value };
    onChange(plan.id === "community" ? {
      ...next,
      commissionPercent: 0,
      monthlyCommissionCap: 0,
      serviceFeeMode: "normal",
      onlinePaymentsEnabled: false,
      premiumBadgeEnabled: false,
      bannerEligible: false,
      promotionalMessagesEnabled: false,
      deliveryBenefitEnabled: false,
      deliveryDiscountAmount: 0,
    } : next);
  };
  return (
    <Card className={plan.id === "premium" ? "border-[#850C22]/30" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {plan.name}
          <Badge variant={plan.id === "premium" ? "default" : "secondary"}>
            {plan.id === "premium" ? "Premium" : "Comunidad"}
          </Badge>
        </CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Comisión (%)</Label>
          <Input type="number" min="0" max="100" step="0.01" value={plan.commissionPercent} onChange={(e) => set("commissionPercent", Number(e.target.value))} />
        </div>
        <div>
          <Label>Tope mensual (0 = sin tope)</Label>
          <Input type="number" min="0" step="0.01" value={plan.monthlyCommissionCap} onChange={(e) => set("monthlyCommissionCap", Number(e.target.value))} />
        </div>
        <div>
          <Label>Tarifa de servicio</Label>
          <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={plan.serviceFeeMode} onChange={(e) => set("serviceFeeMode", e.target.value as CommercialPlan["serviceFeeMode"])}>
            <option value="normal">Normal</option>
            <option value="reduced">Reducida</option>
            <option value="free">Gratuita</option>
          </select>
        </div>
        <div>
          <Label>Descuento de envío</Label>
          <Input type="number" min="0" step="0.01" value={plan.deliveryDiscountAmount} onChange={(e) => set("deliveryDiscountAmount", Number(e.target.value))} />
        </div>
        <div>
          <Label>Quién absorbe el descuento</Label>
          <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={plan.deliveryBenefitAbsorbedBy} onChange={(e) => set("deliveryBenefitAbsorbedBy", e.target.value as CommercialPlan["deliveryBenefitAbsorbedBy"])}>
            <option value="platform">ElMenu</option>
            <option value="restaurant">Restaurante</option>
          </select>
        </div>
        <div className="space-y-2">
          <Toggle label="Pagos en línea" checked={plan.onlinePaymentsEnabled} onChange={(v) => set("onlinePaymentsEnabled", v)} />
          <Toggle label="Badge ElMenu Verificado" checked={plan.premiumBadgeEnabled} onChange={(v) => set("premiumBadgeEnabled", v)} />
          <Toggle label="Elegible para banner" checked={plan.bannerEligible} onChange={(v) => set("bannerEligible", v)} />
          <Toggle label="Frases para clientes" checked={plan.promotionalMessagesEnabled} onChange={(v) => set("promotionalMessagesEnabled", v)} />
          <Toggle label="Beneficio de envío" checked={plan.deliveryBenefitEnabled} onChange={(v) => set("deliveryBenefitEnabled", v)} />
        </div>
      </CardContent>
    </Card>
  );
}

export function CommercialAdmin() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<CommercialSettings | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [storeDraft, setStoreDraft] = useState<EffectiveCommercialConditions | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/commercial", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo cargar.");
    setSnapshot(data);
    setSettings(data.settings);
    setSelectedId((current) => current || data.stores[0]?._id || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((error) => {
      setMessage(error.message);
      setLoading(false);
    });
  }, [load]);

  const selected = useMemo(
    () => snapshot?.stores.find((store) => store._id === selectedId),
    [selectedId, snapshot]
  );

  useEffect(() => {
    if (!selected) return;
    setStoreDraft({ ...selected.effective });
    setNotes(selected.commercialNotes || "");
  }, [selected]);

  const save = async (body: unknown, confirmation?: string) => {
    if (confirmation && !window.confirm(confirmation)) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/commercial", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      setMessage("Cambios guardados. Aplicarán únicamente a pedidos futuros.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !snapshot || !settings) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const remaining =
    storeDraft?.monthlyCommissionCap && storeDraft.monthlyCommissionCap > 0
      ? Math.max(0, storeDraft.monthlyCommissionCap - (selected?.accumulatedCommission || 0))
      : null;

  return (
    <div className="space-y-5 px-4 sm:px-0">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Administración</p>
        <h1 className="mt-1 text-2xl font-semibold">Configuración comercial</h1>
        <p className="mt-1 text-sm text-gray-600">Costos, planes y condiciones efectivas por restaurante.</p>
      </div>
      {message ? <div role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</div> : null}

      <Tabs defaultValue="costs">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="costs">Costos generales</TabsTrigger>
          <TabsTrigger value="plans">Planes</TabsTrigger>
          <TabsTrigger value="stores">Restaurantes y planes</TabsTrigger>
        </TabsList>

        <TabsContent value="costs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tarifas al cliente</CardTitle>
              <CardDescription>El envío conserva su configuración actual por zonas y demanda.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Tarifa normal (MXN)</Label><Input type="number" min="0" step="0.01" value={settings.serviceFeeNormal} onChange={(e) => setSettings({ ...settings, serviceFeeNormal: Number(e.target.value) })} /><Toggle label="Activa" checked={settings.serviceFeeNormalEnabled} onChange={(value) => setSettings({ ...settings, serviceFeeNormalEnabled: value })} /></div>
              <div className="space-y-2"><Label>Tarifa reducida (MXN)</Label><Input type="number" min="0" step="0.01" value={settings.serviceFeeReduced} onChange={(e) => setSettings({ ...settings, serviceFeeReduced: Number(e.target.value) })} /><Toggle label="Activa" checked={settings.serviceFeeReducedEnabled} onChange={(value) => setSettings({ ...settings, serviceFeeReducedEnabled: value })} /></div>
            </CardContent>
          </Card>
          {settings.updatedAt ? <p className="text-xs text-gray-500">Última actualización: {new Date(settings.updatedAt).toLocaleString("es-MX")} · {settings.updatedBy || "administrador"}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => save({ type: "settings", settings }, "Los cambios afectarán pedidos futuros. ¿Continuar?")}>{saving && <Loader2 className="animate-spin" />}Guardar costos</Button>
            <Button asChild variant="outline"><Link href="/admin/configuracion/reparto">Administrar costos de envío</Link></Button>
          </div>
          <p className="text-xs text-gray-500">IVA no se muestra porque el flujo financiero actual registra impuesto en cero y no tiene configuración fiscal activa.</p>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <PlanEditor plan={settings.plans.community} onChange={(plan) => setSettings({ ...settings, plans: { ...settings.plans, community: plan } })} />
          <PlanEditor plan={settings.plans.premium} onChange={(plan) => setSettings({ ...settings, plans: { ...settings.plans, premium: plan } })} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => save({ type: "settings", settings }, "Estos valores serán los predeterminados de pedidos futuros. ¿Continuar?")}>{saving && <Loader2 className="animate-spin" />}Guardar planes</Button>
            <Button asChild variant="outline"><Link href="/studio/structure/promoBanner">Administrar banners <ExternalLink /></Link></Button>
          </div>
        </TabsContent>

        <TabsContent value="stores" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Plan y condiciones comerciales</CardTitle><CardDescription>Los valores individuales sobrescriben el plan.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Restaurante</Label>
                <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  {snapshot.stores.map((store) => <option key={store._id} value={store._id}>{store.name || store._id}{store.commercialReviewRequired || store.effective.reviewRequired ? " · revisar" : ""}</option>)}
                </select>
              </div>
              {selected?.effective.reviewRequired ? <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" />Conserva el comportamiento anterior hasta que guardes una asignación explícita.</div> : null}
              {storeDraft ? (
                <>
                  <div>
                    <Label>Plan</Label>
                    <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={storeDraft.id} onChange={(e) => {
                      const plan = settings.plans[e.target.value as CommercialPlanId];
                      setStoreDraft({ ...storeDraft, ...plan, serviceFee: plan.serviceFeeMode === "free" ? 0 : plan.serviceFeeMode === "reduced" ? settings.serviceFeeReducedEnabled ? settings.serviceFeeReduced : 0 : settings.serviceFeeNormalEnabled ? settings.serviceFeeNormal : 0, reviewRequired: false, legacyFallback: false, notes: storeDraft.notes });
                    }}>
                      <option value="community">Plan Comunidad</option>
                      <option value="premium">Plan Premium del 10%</option>
                    </select>
                  </div>
                  <PlanEditor plan={storeDraft} onChange={(plan) => setStoreDraft({ ...storeDraft, ...plan, serviceFee: plan.serviceFeeMode === "free" ? 0 : plan.serviceFeeMode === "reduced" ? settings.serviceFeeReducedEnabled ? settings.serviceFeeReduced : 0 : settings.serviceFeeNormalEnabled ? settings.serviceFeeNormal : 0 })} />
                  <div><Label>Observaciones o condiciones</Label><textarea className="min-h-24 w-full rounded-md border p-3 text-sm" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                  <Card className="bg-gray-50">
                    <CardHeader><CardTitle className="text-base">Vista previa efectiva</CardTitle></CardHeader>
                    <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <p><strong>Plan:</strong> {storeDraft.name}</p>
                      <p><strong>Comisión:</strong> {storeDraft.commissionPercent}%</p>
                      <p><strong>Tope:</strong> {storeDraft.monthlyCommissionCap ? money(storeDraft.monthlyCommissionCap) : "Sin tope"}</p>
                      <p><strong>Acumulada:</strong> {money(selected?.accumulatedCommission || 0)}</p>
                      <p><strong>Restante:</strong> {remaining == null ? "Sin tope" : money(remaining)}</p>
                      <p><strong>Tarifa:</strong> {storeDraft.serviceFeeMode}</p>
                      <p><strong>Online:</strong> {storeDraft.onlinePaymentsEnabled ? "Activo" : "Inactivo"}</p>
                      <p><strong>Badge:</strong> {storeDraft.premiumBadgeEnabled ? "Activo" : "Inactivo"}</p>
                      <p><strong>Banner:</strong> {storeDraft.bannerEligible ? "Elegible" : "No elegible"}</p>
                      <p><strong>Frases:</strong> {storeDraft.promotionalMessagesEnabled ? "Activas" : "Inactivas"}</p>
                      <p><strong>Envío:</strong> {storeDraft.deliveryBenefitEnabled ? `${money(storeDraft.deliveryDiscountAmount)} · absorbe ${storeDraft.deliveryBenefitAbsorbedBy === "platform" ? "ElMenu" : "restaurante"}` : "Sin beneficio"}</p>
                      <p><strong>Inicio:</strong> {selected?.effective.planStartedAt ? new Date(selected.effective.planStartedAt).toLocaleDateString("es-MX") : "Al guardar"}</p>
                      <p><strong>Tope alcanzado:</strong> {remaining === 0 ? "Sí" : "No"}</p>
                    </CardContent>
                  </Card>
                  <Button disabled={saving} onClick={() => save({ type: "store", storeId: selectedId, planId: storeDraft.id, overrides: storeDraft, notes }, `Cambiarás el plan y las condiciones de ${selected?.name || "este restaurante"}. Los pedidos históricos no cambiarán. ¿Continuar?`)}>
                    {saving ? <Loader2 className="animate-spin" /> : <Check />}Guardar asignación
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
