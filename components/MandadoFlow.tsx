"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Box,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  ShoppingBasket,
} from "lucide-react";
import MandadoLocationPicker from "./MandadoLocationPicker";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { calculateMandadoQuote, type MandadoAddressPoint, type MandadoMode, type MandadoPointQuote } from "@/lib/mandado";

type Mode = MandadoMode;
type Step = "mode" | "origin" | "destination" | "details" | "summary";
type AddressPoint = MandadoAddressPoint;
type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; price: number }
  | { status: "outside"; point: "origin" | "destination" | null }
  | { status: "error" };

export default function MandadoFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [step, setStep] = useState<Step>("mode");
  const [origin, setOrigin] = useState<AddressPoint | null>(null);
  const [destination, setDestination] = useState<AddressPoint | null>(null);
  const [draftAddress, setDraftAddress] = useState<AddressPoint | null>(null);
  const [details, setDetails] = useState("");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });

  const selectMode = (nextMode: Mode) => {
    setMode(nextMode);
    setStep("origin");
    setDraftAddress(null);
  };

  const saveAddress = () => {
    if (!draftAddress) return;
    if (step === "origin") {
      setOrigin(draftAddress);
      setStep("destination");
      setDraftAddress(destination);
    } else {
      setDestination(draftAddress);
      setStep("details");
      setDraftAddress(null);
    }
  };

  useEffect(() => {
    if (step !== "summary" || !origin || !destination) return;

    let cancelled = false;
    setQuote({ status: "loading" });
    const getQuote = (point: AddressPoint) =>
      fetch("/api/delivery-pricing/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: point.lat, lng: point.lng }),
      }).then(async (response) => {
        if (!response.ok) throw new Error("quote");
        const data = await response.json();
        return data.quote as MandadoPointQuote;
      });

    Promise.all([getQuote(origin), getQuote(destination)])
      .then(([originQuote, destinationQuote]) => {
        if (cancelled) return;
        const result = calculateMandadoQuote(originQuote, destinationQuote);
        setQuote(result.allowed
          ? { status: "ready", price: result.finalPrice }
          : { status: "outside", point: result.outsidePoint });
      })
      .catch(() => {
        if (!cancelled) setQuote({ status: "error" });
      });

    return () => { cancelled = true; };
  }, [destination, origin, step]);

  if (step === "mode") {
    return (
      <section className="py-4 sm:py-6">
        <div className="grid items-center gap-4 px-2 sm:grid-cols-[1fr_220px] sm:px-5">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-[#eb1901]">{"Mandados El Men\u00fa"}</p>
            <h2 className="text-2xl font-black tracking-tight text-[#09193B] sm:text-3xl">{"\u00bfQu\u00e9 necesitas hoy?"}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              {"Env\u00edanos por algo o deja que compremos por ti. T\u00fa eliges el punto de inicio y la entrega."}
            </p>
          </div>
          <Image src="/repartidor.png" alt={"Repartidor de El Men\u00fa haciendo un mandado"} width={240} height={180} className="mx-auto h-36 w-auto object-contain sm:h-40" priority={false} />
        </div>

        <div className="mt-5 grid divide-y divide-slate-200 border-y border-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <ServiceCard icon={Box} title="Recoger algo y entregarlo" description="Pasamos por un paquete, documento u objeto y lo llevamos a donde indiques." onClick={() => selectMode("pickup")} />
          <ServiceCard icon={ShoppingBasket} title={"Comprar algo y llev\u00e1rtelo"} description="Compramos por ti en una tienda. El costo de los productos se paga por separado." onClick={() => selectMode("purchase")} />
        </div>
      </section>
    );
  }

  if (step === "origin" || step === "destination") {
    const isOrigin = step === "origin";
    return (
      <FlowCard onBack={() => {
        if (isOrigin) {
          setDraftAddress(null);
          setStep("mode");
        } else {
          setDraftAddress(origin);
          setStep("origin");
        }
      }}>
        <p className="text-sm font-bold text-[#eb1901]">Paso {isOrigin ? "1" : "2"} de 3</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-[#09193B]">
          {isOrigin
            ? mode === "purchase" ? "\u00bfD\u00f3nde debemos comprar?" : "\u00bfD\u00f3nde recogemos?"
            : "\u00bfD\u00f3nde lo entregamos?"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">Busca una dirección, usa tu ubicación o marca el punto exacto en el mapa.</p>
        <div className="mt-6">
          <MandadoLocationPicker
            key={step}
            label={isOrigin ? "Punto de inicio" : "Punto de entrega"}
            initialValue={draftAddress}
            onChange={setDraftAddress}
          />
        </div>
        <Button onClick={saveAddress} disabled={!draftAddress} className="mt-6 h-12 w-full rounded-full bg-[#eb1901] text-base hover:bg-[#c91602]">
          Continuar <ChevronRight />
        </Button>
      </FlowCard>
    );
  }

  if (step === "details") {
    return (
      <FlowCard onBack={() => setStep("destination")}>
        <p className="text-sm font-bold text-[#eb1901]">Paso 3 de 3</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-[#09193B]">
          {mode === "purchase" ? "\u00bfQu\u00e9 debemos comprar?" : "\u00bfQu\u00e9 debemos recoger?"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {mode === "purchase"
            ? "Escribe productos, cantidades y cualquier indicaci\u00f3n \u00fatil. Te confirmaremos el total antes de comprar."
            : "Cu\u00e9ntanos qu\u00e9 es, con qui\u00e9n recogerlo y cualquier indicaci\u00f3n para el repartidor."}
        </p>
        <Textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder={mode === "purchase" ? "Ej. 2 litros de leche, pan integral y 1 kg de manzanas..." : "Ej. Un paquete peque\u00f1o a nombre de Ana..."}
          className="mt-5 min-h-32 rounded-2xl border-slate-200 p-4 text-base"
          maxLength={800}
        />
        <Button onClick={() => setStep("summary")} disabled={!details.trim()} className="mt-6 h-12 w-full rounded-full bg-[#eb1901] text-base hover:bg-[#c91602]">
          Calcular mi mandado <ChevronRight />
        </Button>
      </FlowCard>
    );
  }

  return (
    <FlowCard onBack={() => setStep("details")}>
      <p className="text-sm font-bold text-[#eb1901]">Resumen</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-[#09193B]">{"Tu mandado est\u00e1 casi listo"}</h2>
      <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
        <AddressSummary label={mode === "purchase" ? "Comprar en" : "Recoger en"} point={origin!} onEdit={() => { setDraftAddress(origin); setStep("origin"); }} />
        <AddressSummary label="Entregar en" point={destination!} onEdit={() => { setDraftAddress(destination); setStep("destination"); }} />
      </div>

      <div className="border-b border-slate-200 px-1 py-4 text-sm text-slate-700">
        <p className="font-bold text-[#09193B]">Tu solicitud</p>
        <p className="mt-1 whitespace-pre-line">{details}</p>
      </div>

      {quote.status === "loading" || quote.status === "idle" ? (
        <div className="mt-5 flex items-center justify-center gap-2 border-y border-rose-200 bg-rose-50/60 p-5 font-semibold text-[#eb1901]">
          <Loader2 className="animate-spin" /> {"Calculando cobertura y costo\u2026"}
        </div>
      ) : quote.status === "outside" ? (
        <div className="mt-5 border-y border-amber-200 bg-amber-50 p-5">
          <p className="font-bold text-amber-950">{"Todav\u00eda no llegamos hasta ah\u00ed"}</p>
          <p className="mt-1 text-sm leading-5 text-amber-800">Por ahora solo realizamos mandados dentro de nuestras zonas activas. Cambia {quote.point === "origin" ? "el punto de inicio" : "el punto de entrega"} para continuar.</p>
        </div>
      ) : quote.status === "error" ? (
        <div className="mt-5 border-y border-red-200 bg-red-50 p-5 text-sm text-red-800">No pudimos calcular el costo en este momento. Intenta de nuevo en unos segundos.</div>
      ) : (
        <>
          <div className="mt-5 border-y border-slate-200 py-5">
            <p className="text-sm text-slate-500">{"Costo estimado del env\u00edo"}</p>
            <p className="mt-1 text-3xl font-black text-[#09193B]">${quote.price.toFixed(2)} MXN</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{"Productos o pagos en tienda no est\u00e1n incluidos."}</p>
          </div>
          <Button onClick={() => {
            sessionStorage.setItem("mandadoCheckoutDraft", JSON.stringify({ mode, origin, destination, details: details.trim(), price: quote.price }));
            router.push("/basket?service=mandado");
          }} className="mt-5 h-12 w-full rounded-full bg-[#eb1901] text-base hover:bg-[#c91602]">
            Continuar al checkout <ChevronRight />
          </Button>
        </>
      )}
    </FlowCard>
  );
}

function ServiceCard({ icon: Icon, title, description, onClick }: { icon: typeof Box; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-28 w-full min-w-0 items-center gap-4 px-2 py-5 text-left transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#eb1901] sm:px-5">
      <Icon className="h-8 w-8 shrink-0 text-[#eb1901]" />
      <span className="min-w-0 flex-1">
        <span className="block font-black text-[#09193B]">{title}</span>
        <span className="mt-1 block break-words text-sm leading-5 text-slate-600">{description}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#eb1901] transition-transform group-hover:translate-x-1" />
    </button>
  );
}

function FlowCard({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <section className="mx-auto max-w-2xl px-1 py-4 sm:px-4 sm:py-6">
      <button type="button" onClick={onBack} aria-label="Volver" className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-[#09193B] transition hover:bg-slate-200"><ArrowLeft /></button>
      {children}
    </section>
  );
}

function AddressSummary({ label, point, onEdit }: { label: string; point: AddressPoint; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-3 p-4">
      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#eb1901]" />
      <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-[#09193B]">{point.label}</p></div>
      <button type="button" onClick={onEdit} aria-label={`Editar ${label}`} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-[#eb1901]"><Pencil className="h-4 w-4" /></button>
    </div>
  );
}

