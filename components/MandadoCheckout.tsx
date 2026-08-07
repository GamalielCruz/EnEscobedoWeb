"use client";

import { SignInButton, useAuth, useUser } from "@clerk/nextjs";
import { ArrowLeft, Banknote, CheckCircle, CreditCard, Loader2, MapPin, PackageCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SegmentedTabs } from "./SegmentedTabs";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MandadoDraft } from "@/lib/mandado";

const PAYMENT_METHODS: Array<{ value: "card" | "cash"; label: string; icon: LucideIcon }> = [
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "cash", label: "Efectivo", icon: Banknote },
];

export default function MandadoCheckout({ draft }: { draft: MandadoDraft | null }) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [method, setMethod] = useState<"card" | "cash" | null>(null);
  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const stripeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPhone(String(user?.publicMetadata?.phone || localStorage.getItem("customerPhone") || ""));
  }, [user?.publicMetadata?.phone]);

  // Preferencias elegidas en el flujo de creación del mandado
  useEffect(() => {
    setRecipientName(String(draft?.recipientName || ""));
    setRecipientPhone(String(draft?.recipientPhone || "").replace(/\D/g, "").slice(0, 10));
  }, [draft?.recipientName, draft?.recipientPhone]);

  useEffect(() => {
    if (!clientSecret || !stripeContainerRef.current) return;
    let checkout: any = null;
    let active = true;
    (async () => {
      if (!(window as any).Stripe) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://js.stripe.com/v3/";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("No pudimos cargar el pago seguro."));
          document.head.appendChild(script);
        });
      }
      if (!active) return;
      const stripe = (window as any).Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");
      checkout = await stripe.initEmbeddedCheckout({ clientSecret });
      if (active && stripeContainerRef.current) checkout.mount(stripeContainerRef.current);
    })().catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos cargar el pago seguro."));
    return () => { active = false; checkout?.destroy(); };
  }, [clientSecret]);

  if (!draft) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-8">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <PackageCheck className="mx-auto h-12 w-12 text-gray-300" />
            <h1 className="mt-4 text-xl font-bold text-gray-900">No encontramos tu mandado</h1>
            <p className="mt-2 text-sm text-gray-500">Vuelve a elegir los puntos de inicio y entrega.</p>
            <button onClick={() => router.push("/?service=mandado")} className="mt-6 rounded-xl bg-[#eb1902] px-5 py-3 font-semibold text-white hover:bg-[#c11300]">
              Crear un mandado
            </button>
          </div>
        </div>
      </div>
    );
  }

  const digits = phone.replace(/\D/g, "").slice(-10);
  // El NIP SIEMPRE se envía al WhatsApp del cliente (remitente). El destinatario
  // solo recibe (opcional) la notificación `mandado__destinatario` (sin NIP).
  const recipientDigits = recipientPhone.replace(/\D/g, "").slice(0, 10);
  const ready = digits.length === 10 && method;
  const leaveCheckout = () => {
    sessionStorage.removeItem("mandadoCheckoutDraft");
    router.push("/?service=mandado");
  };
  const savePhone = () => {
    localStorage.setItem("customerPhone", digits);
    return fetch("/api/user/save-phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: digits, whatsappConsent: true }) }).catch(() => null);
  };
  const submit = async () => {
    if (!ready || !user) return;
    setLoading(true);
    setError("");
    const orderNumber = crypto.randomUUID();
    try {
      const response = await fetch(method === "card" ? "/api/mandado/checkout-session" : "/api/mandado/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          orderNumber,
          customerName: user.fullName || user.firstName || "Cliente",
          customerEmail: user.emailAddresses[0]?.emailAddress || "",
          phone: `52${digits}`,
          recipientPhone: recipientDigits,
          recipientName: recipientName.trim(),
          businessName: draft.businessName || "",
          originReference: draft.originReference || "",
          destinationReference: draft.destinationReference || "",
          destinationPerson: draft.destinationPerson || "",
          // Al continuar se aceptan de forma implícita los documentos legales.
          legalAccepted: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No pudimos procesar tu mandado.");
      await savePhone();
      if (method === "card") setClientSecret(result.clientSecret);
      else {
        sessionStorage.removeItem("mandadoCheckoutDraft");
        window.location.href = `/orders?order=${encodeURIComponent(result.orderNumber)}`;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos procesar tu mandado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-8">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Tu Carrito</h1>
          <p className="text-gray-600 mt-1">1 servicio</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-3">
            <button type="button" onClick={leaveCheckout} className="flex items-center gap-2 text-sm font-semibold text-gray-600 transition-colors hover:text-[#eb1902]">
              <ArrowLeft className="h-4 w-4" /> Editar mandado
            </button>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex gap-4">
                <div className="w-20 h-20 md:w-24 md:h-24 flex-shrink-0">
                  <Image src="/repartidor.png" alt="Servicio de mandado" width={96} height={96} className="object-contain w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base md:text-lg font-semibold text-gray-900 line-clamp-2">
                    {draft.mode === "purchase" ? "Comprar algo y llevártelo" : "Recoger algo y entregarlo"}
                  </h2>
                  <p className="text-lg md:text-xl font-bold text-gray-900 mt-1">${draft.price.toFixed(2)}</p>
                  <p className="text-sm text-gray-500">Servicio de mandado</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900">Datos del mandado</h2>
              <div className="mt-4 space-y-4">
                <RoutePoint label={draft.mode === "purchase" ? "Tienda / compra" : "Punto de inicio"} value={draft.origin.label} />
                {draft.businessName && <RoutePoint label="Negocio" value={draft.businessName} />}
                {draft.originReference && <RoutePoint label="Referencias de recolección" value={draft.originReference} />}
                <RoutePoint label="Punto de entrega" value={draft.destination.label} />
                {draft.destinationReference && <RoutePoint label="Referencias de entrega" value={draft.destinationReference} />}
                {draft.destinationPerson && <RoutePoint label="Persona que recibe" value={draft.destinationPerson} />}
              </div>
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="text-sm font-semibold text-gray-900">Solicitud</p>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{draft.details}</p>
                {draft.mode === "purchase" && <p className="mt-3 text-xs text-amber-700">Los productos se pagan por separado; aquí solo cubres el servicio de envío.</p>}
                {draft.pinEnabled && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-[#09193B]/5 p-3 text-xs leading-5 text-gray-700">
                    <span className="mt-0.5 shrink-0">🔒</span>
                    <span>
                      <strong>Entrega segura:</strong> el NIP se enviará a tu WhatsApp para que tú
                      decidas cuándo compartirlo con el destinatario. El sistema no lo envía
                      automáticamente a otra persona.
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[420px] xl:w-[480px] lg:sticky lg:top-24 h-fit">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 md:p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Resumen de Compra</h3>

              {isSignedIn ? (
                <div className="space-y-4 mt-6">
                  {!clientSecret ? (
                    <>
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 bg-[#eb1901] text-white rounded-full flex items-center justify-center text-sm">1</span>
                          Datos de contacto
                        </h4>
                        <label className="block rounded-xl border border-gray-200 bg-white p-4">
                          <span className="block text-sm font-semibold text-gray-900">Teléfono móvil</span>
                          <span className="mt-1 block text-xs text-gray-500">Recibirás aquí las actualizaciones de tu pedido.</span>
                          <div className="mt-3 flex items-center gap-2 rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2.5 focus-within:border-[#eb1902] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#eb1902]/20 transition-all">
                            <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">+52</span>
                            <div className="w-px h-4 bg-gray-300" />
                            <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="4421234567" className="min-w-0 flex-1 bg-transparent text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none" />
                          </div>
                        </label>

                        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
                          <span className="block text-sm font-semibold text-gray-900">Notificar al destinatario (opcional)</span>
                          <span className="mt-1 block text-xs text-gray-500">Recibirá una notificación por WhatsApp cuando tu mandado vaya en camino.</span>
                          <input
                            value={recipientName}
                            onChange={(event) => setRecipientName(event.target.value.slice(0, 60))}
                            placeholder="Nombre del destinatario"
                            className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#eb1902] focus:ring-2 focus:ring-[#eb1902]/20"
                          />
                          <div className="mt-2 flex items-center gap-2 rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2.5 focus-within:border-[#eb1902] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#eb1902]/20 transition-all">
                            <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">+52</span>
                            <div className="w-px h-4 bg-gray-300" />
                            <input value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="4421234567" className="min-w-0 flex-1 bg-transparent text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none" />
                          </div>
                          {recipientDigits.length > 0 && recipientDigits.length < 10 && (
                            <p className="mt-1.5 text-xs font-medium text-[#eb1902]">Ingresa los 10 dígitos del teléfono.</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                          <span className="w-6 h-6 bg-[#eb1902] text-white rounded-full flex items-center justify-center text-sm">2</span>
                          Método de pago
                        </h4>
                        <SegmentedTabs
                          value={method}
                          onChange={setMethod}
                          options={PAYMENT_METHODS}
                          layoutId="mandado-payment-pill"
                        />
                        <p className="text-xs text-gray-500">
                          {method === "card"
                            ? "Pago seguro en línea con tu tarjeta."
                            : method === "cash"
                              ? "Paga en efectivo al momento de la entrega."
                              : "Elige cómo quieres pagar."}
                        </p>
                      </div>

                      <div className="mb-4 p-4 border border-rose-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="w-5 h-5 text-[#70E000] flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-black">Todo listo</p>
                            <p className="text-sm text-gray-600 mt-1">{draft.destination.label}</p>
                            <p className="text-sm font-semibold mt-3">Servicio de mandado: ${draft.price.toFixed(2)} MXN</p>
                            <div className="flex items-baseline justify-between pt-3 border-t-2 border-rose-200 mt-3">
                              <span className="text-sm font-semibold text-gray-700">Total:</span>
                              <span className="text-2xl font-bold text-black">${draft.price.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {error && <div className="flex items-start gap-2 text-sm text-[#eb1902] font-medium bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</div>}

                      <button onClick={submit} disabled={!ready || loading} className="w-full bg-[#eb1902] text-white px-4 py-3.5 rounded-xl hover:bg-[#c11300] disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors font-semibold shadow-sm">
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : method === "cash" ? <Banknote className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                        {loading ? "Procesando..." : method === "card" ? "Pagar con tarjeta" : method === "cash" ? "Pagar al recibir (Efectivo)" : "Elige un método de pago"}
                      </button>

                      <p className="mt-3 text-center text-xs leading-5 text-gray-500">
                        Al continuar aceptas los{" "}
                        <Link className="font-medium text-gray-600 underline underline-offset-2 transition-colors hover:text-[#eb1902]" href="/legal/terminos-clientes" target="_blank">Términos y Condiciones</Link>, el{" "}
                        <Link className="font-medium text-gray-600 underline underline-offset-2 transition-colors hover:text-[#eb1902]" href="/legal/privacidad" target="_blank">Aviso de Privacidad</Link> y la{" "}
                        <Link className="font-medium text-gray-600 underline underline-offset-2 transition-colors hover:text-[#eb1902]" href="/legal/cancelaciones-reembolsos" target="_blank">Política de Cancelaciones</Link>.
                      </p>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
                        <span className="font-semibold block mb-1">Pago seguro con tarjeta:</span>
                        Completa los detalles de tu tarjeta para finalizar tu pedido.
                      </div>
                      <div ref={stripeContainerRef} id="stripe-checkout-container" className="mt-4 bg-white rounded-xl w-full min-h-[400px] -mx-1 sm:mx-0" />
                      <button onClick={() => setClientSecret(null)} className="w-full text-center text-sm font-semibold text-[#eb1902] hover:text-rose-800 underline pt-2">Cancelar y volver a métodos de pago</button>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-center py-2">
                      <Image src="/Powered by Stripe - blurple.svg" alt="Powered by Stripe" width={120} height={40} className="h-auto" />
                    </div>
                  </div>
                </div>
              ) : (
                <SignInButton mode="modal">
                  <button className="mt-6 w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">Inicia sesión para continuar</button>
                </SignInButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoutePoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#eb1902]" />
      <div>
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        <p className="mt-0.5 text-sm text-gray-800">{value}</p>
      </div>
    </div>
  );
}
