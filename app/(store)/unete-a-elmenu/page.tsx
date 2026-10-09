import type { Metadata } from "next";
import { ArrowRight, Check, ChevronDown, MessageCircle, Smartphone, Store } from "lucide-react";

const WHATSAPP_URL =
  "https://wa.me/524462562451?text=Hola%2C%20quiero%20conocer%20ElMenu%20y%20registrar%20mi%20restaurante.";

export const metadata: Metadata = {
  title: "Únete a ElMenu",
  description:
    "Convierte mensajes sueltos en pedidos claros y administra tu restaurante desde el celular.",
};

const benefits = [
  "Comparte tu menú por WhatsApp, redes sociales o código QR.",
  "Recibe productos, extras, entrega y pago en una sola comanda.",
  "Reduce preguntas, errores y mensajes desordenados.",
  "Administra pedidos y estados desde tu celular.",
];

const comparison = [
  {
    feature: "Costo mensual",
    community: "$0",
    premium: "$0",
    detail: "Ninguno de los dos planes cobra una mensualidad fija.",
  },
  {
    feature: "Comisión de ElMenu",
    community: "0%",
    premium: "Configurable",
    detail: "Premium inicia en 10% y puede tener porcentaje y tope mensual acordados con cada restaurante.",
  },
  {
    feature: "Pagos en línea",
    community: "No",
    premium: "Sí",
    detail: "Premium puede recibir pagos en línea mediante la integración existente de Stripe.",
  },
  {
    feature: "Tarifa de servicio al cliente",
    community: "Normal",
    premium: "Flexible",
    detail: "En Premium puede configurarse como normal, reducida o gratuita.",
  },
  {
    feature: "ElMenu Verificado",
    community: "No",
    premium: "Disponible",
    detail: "El badge indica participación en el Plan Premium; no certifica calidad sanitaria o legal.",
  },
  {
    feature: "Frases para clientes",
    community: "No",
    premium: "Disponible",
    detail: "Mensajes breves configurados en Sanity que rotan cada 5 segundos en la tarjeta del restaurante.",
  },
  {
    feature: "Promociones y envío",
    community: "Estándar",
    premium: "Configurable",
    detail: "Premium puede ser elegible para banners y beneficios de envío cuando el administrador los configura expresamente.",
  },
];

export default function JoinElMenuPage() {
  return (
    <main className="bg-[#f5f5f7] text-[#1d1d1f]">
      <section className="px-5 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="font-semibold text-[#eb1901]">ElMenu para restaurantes</p>
            <h1 className="mt-4 text-5xl font-black tracking-[-0.045em] sm:text-7xl">
              Únete a ElMenu
            </h1>
            <p className="mt-6 max-w-2xl text-2xl font-semibold leading-tight sm:text-4xl">
              Más pedidos. Menos mensajes.
            </p>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#6e6e73]">
              Convierte conversaciones sueltas en pedidos claros, listos para preparar.
              Tu cliente compra sin descargar una app y tú mantienes el control desde el celular.
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#eb1901] px-7 py-3.5 font-semibold text-white transition hover:bg-[#c91702] focus:outline-none focus:ring-2 focus:ring-[#eb1901] focus:ring-offset-4"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              Hablar por WhatsApp
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <p className="mt-3 text-sm text-[#6e6e73]">WhatsApp: 446 256 2451</p>
          </div>

          <div className="rounded-[2rem] bg-white p-7 shadow-[0_20px_70px_rgba(0,0,0,0.08)] sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0ed] text-[#eb1901]">
              <Store className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 className="mt-6 text-2xl font-black">Tu restaurante, listo para vender en línea</h2>
            <ul className="mt-7 space-y-5">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex gap-3 text-[#515154]">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="font-semibold text-[#eb1901]">Planes para cada etapa</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
              Compara y elige con claridad
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-[#6e6e73]">
              Abre cada opción con la flecha para conocer cómo beneficia al restaurante y a sus clientes.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-3xl border border-black/10">
            <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_2rem] gap-4 bg-[#1d1d1f] px-6 py-4 text-sm font-semibold text-white sm:grid">
              <span>Característica</span>
              <span>Plan Comunidad</span>
              <span>Plan Premium</span>
              <span className="sr-only">Detalle</span>
            </div>
            {comparison.map((row) => (
              <details key={row.feature} className="group border-t border-black/10 first:border-t-0">
                <summary className="relative grid cursor-pointer list-none grid-cols-2 items-center gap-3 px-5 py-5 marker:hidden sm:grid-cols-[1.4fr_0.8fr_0.8fr_2rem] sm:px-6">
                  <strong className="col-span-2 text-base sm:col-span-1">{row.feature}</strong>
                  <span className="text-sm">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#86868b] sm:hidden">Comunidad</span>
                    {row.community}
                  </span>
                  <span className="text-sm font-semibold text-[#eb1901]">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#86868b] sm:hidden">Premium</span>
                    {row.premium}
                  </span>
                  <ChevronDown className="absolute right-5 h-5 w-5 transition-transform group-open:rotate-180 sm:static" aria-hidden="true" />
                </summary>
                <p className="border-t border-black/5 bg-[#f5f5f7] px-5 py-4 text-sm leading-6 text-[#515154] sm:px-6">
                  {row.detail}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f5f5f7] px-5 py-20 text-center">
        <Smartphone className="mx-auto h-10 w-10 text-[#eb1901]" aria-hidden="true" />
        <h2 className="mx-auto mt-6 max-w-4xl text-4xl font-black tracking-[-0.04em] sm:text-6xl">
          Tú cocinas. ElMenu te ayuda a ponerlo en línea.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#6e6e73]">
          Escríbenos por WhatsApp. Revisamos tu menú, configuramos tu tienda y te
          enseñamos a manejarla desde el celular.
        </p>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#1d1d1f] px-7 py-3.5 font-semibold text-white transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-[#1d1d1f] focus:ring-offset-4"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Quiero unirme a ElMenu
        </a>
      </section>
    </main>
  );
}
