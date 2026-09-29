"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Check,
  ChefHat,
  Clock3,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  Store,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

const WHATSAPP_URL =
  "https://wa.me/524462562451?text=Hola%2C%20quiero%20conocer%20ElMenu%20y%20registrar%20mi%20restaurante.";

const steps = [
  {
    actor: "Más alcance, cero descargas",
    title: "Tu restaurante listo para vender donde ya están tus clientes.",
    description:
      "Comparte tu menú por WhatsApp, redes sociales o código QR. El cliente entra al instante y puede pedir sin instalar nada.",
    action: "Abrir el menú",
  },
  {
    actor: "Decisiones más rápidas",
    title: "Las fotos y los precios hacen la venta por ti.",
    description:
      "Tu cliente entiende qué vendes, cuánto cuesta y cómo se ve. Menos preguntas; más intención de compra.",
    action: "Agregar al pedido",
  },
  {
    actor: "Menos errores en cocina",
    title: "Cada detalle queda escrito antes de llegar a cocina.",
    description:
      "Salsas, extras e indicaciones se capturan con opciones claras. Ya no necesitas descifrar audios ni mensajes sueltos.",
    action: "Guardar opciones",
  },
  {
    actor: "Más confianza para comprar",
    title: "El cliente confirma sabiendo exactamente cuánto pagará.",
    description:
      "Dirección, envío, forma de pago y total aparecen antes de ordenar. Sin cobros inesperados ni confusiones.",
    action: "Enviar pedido",
  },
  {
    actor: "Una operación más clara",
    title: "Recibes una comanda, no una conversación desordenada.",
    description:
      "Productos, extras, total, entrega y pago llegan juntos a tu panel. También recibes el aviso por WhatsApp.",
    action: "Aceptar pedido",
  },
  {
    actor: "Tu negocio, tus tiempos",
    title: "Mantienes el control sin dejar la cocina.",
    description:
      "Acepta pedidos y actualiza su estado desde el celular. El cliente recibe avances sin tener que preguntarte.",
    action: "Volver a comenzar",
  },
];

export default function DemoPage() {
  const [step, setStep] = useState(0);
  const reduceMotion = useReducedMotion();
  const go = (nextStep: number) =>
    setStep(Math.min(Math.max(nextStep, 0), steps.length - 1));
  const advance = () => (step === steps.length - 1 ? setStep(0) : go(step + 1));

  return (
    <main className="bg-[#f5f5f7] text-[#1d1d1f]">
      <section className="flex min-h-[78vh] items-center px-5 py-20 text-center">
        <div className="mx-auto max-w-5xl">
          <p className="text-lg font-semibold text-[#eb1901]">ElMenu para restaurantes</p>
          <h1 className="mt-5 text-5xl font-black tracking-[-0.045em] sm:text-7xl lg:text-8xl">
            Más pedidos.
            <br />
            Menos mensajes.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-xl leading-8 text-[#6e6e73] sm:text-2xl">
            ElMenu convierte conversaciones sueltas en pedidos claros, listos
            para preparar.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#tutorial"
              className="inline-flex items-center gap-2 rounded-full bg-[#eb1901] px-7 py-3.5 font-semibold text-white transition hover:bg-[#c91702] focus:outline-none focus:ring-2 focus:ring-[#eb1901] focus:ring-offset-4"
            >
              Ver cómo vende ElMenu
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 font-semibold text-[#1d1d1f] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#1d1d1f] focus:ring-offset-4"
            >
              <MessageCircle className="h-5 w-5 text-[#16a34a]" />
              Hablar por WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section id="tutorial" className="scroll-mt-16 px-3 pb-24 sm:px-6">
        <div
          className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-white shadow-[0_20px_70px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-[#eb1901]"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") go(step - 1);
            if (event.key === "ArrowRight") advance();
          }}
          aria-label="Tutorial interactivo de ElMenu. Usa las flechas izquierda y derecha para navegar."
        >
          <div className="flex items-center gap-4 border-b border-black/5 px-5 py-5 sm:px-8">
            <span className="shrink-0 text-sm font-semibold text-[#6e6e73]">
              {String(step + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
            </span>
            <div className="flex flex-1 gap-1.5" aria-label="Progreso del tutorial">
              {steps.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => go(index)}
                  aria-label={`Ir al paso ${index + 1}: ${item.actor}`}
                  aria-current={index === step ? "step" : undefined}
                  className={`h-1.5 flex-1 rounded-full transition ${
                    index <= step ? "bg-[#eb1901]" : "bg-[#dedede]"
                  }`}
                />
              ))}
            </div>
            <span className="hidden shrink-0 text-sm font-semibold text-[#6e6e73] sm:block">
              {steps[step].actor}
            </span>
          </div>

          <div className="relative min-h-[760px] sm:min-h-[720px]">
            <AnimatePresence mode="wait">
              <motion.article
                key={step}
                initial={reduceMotion ? false : { opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -24 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="grid min-h-[760px] items-center gap-12 px-6 py-14 sm:min-h-[720px] sm:px-12 lg:grid-cols-[0.88fr_1.12fr] lg:px-20"
              >
                <div className="mx-auto max-w-xl lg:mx-0">
                  <p className="text-base font-semibold text-[#eb1901]">{steps[step].actor}</p>
                  <h2
                    className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl"
                    aria-live="polite"
                  >
                    {steps[step].title}
                  </h2>
                  <p className="mt-6 text-lg leading-8 text-[#6e6e73] sm:text-xl">
                    {steps[step].description}
                  </p>
                  <button
                    type="button"
                    onClick={advance}
                    className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#1d1d1f] px-6 py-3 font-semibold text-white transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-[#1d1d1f] focus:ring-offset-4"
                  >
                    {steps[step].action}
                    {step === steps.length - 1 ? (
                      <RotateCcw className="h-4 w-4" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div className="flex min-h-[430px] items-center justify-center">
                  <Scene step={step} onAdvance={advance} reduceMotion={Boolean(reduceMotion)} />
                </div>
              </motion.article>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between border-t border-black/5 px-5 py-5 sm:px-8">
            <button
              type="button"
              onClick={() => go(step - 1)}
              disabled={step === 0}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-[#f5f5f7] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </button>
            <p className="hidden text-sm text-[#86868b] sm:block">
              También puedes usar las flechas del teclado
            </p>
            <button
              type="button"
              onClick={advance}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-[#f5f5f7]"
            >
              {step === steps.length - 1 ? "Reiniciar" : "Siguiente"}
              {step === steps.length - 1 ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-24 text-center">
        <div className="mx-auto max-w-5xl">
          <p className="text-lg font-semibold text-[#eb1901]">Lo que realmente cambia</p>
          <h2 className="mt-5 text-5xl font-black tracking-[-0.045em] sm:text-7xl">
            Tu cliente deja de preguntar.
            <br />
            Empieza a pedir.
          </h2>
          <p className="mx-auto mt-7 max-w-2xl text-xl leading-8 text-[#6e6e73]">
            Menos mensajes que contestar. Menos errores que corregir. Más tiempo
            para atender tu restaurante.
          </p>
        </div>
      </section>

      <section className="bg-[#1d1d1f] px-5 py-24 text-center text-white">
        <div className="mx-auto max-w-4xl">
          <Store className="mx-auto h-10 w-10 text-[#ff4b37]" />
          <h2 className="mt-7 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
            Tú cocinas. Nosotros te ayudamos a ponerlo en línea.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#a1a1a6]">
            Escríbenos por WhatsApp. Revisamos tu menú, configuramos tu tienda y
            te enseñamos a manejarla desde el celular.
          </p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#eb1901] px-7 py-3.5 font-semibold text-white transition hover:bg-[#ff311b] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-4 focus:ring-offset-[#1d1d1f]"
          >
            <MessageCircle className="h-5 w-5" />
            Quiero registrar mi restaurante
          </a>
          <p className="mt-4 text-sm text-[#86868b]">WhatsApp: 446 256 2451</p>
        </div>
      </section>
    </main>
  );
}

function Scene({
  step,
  onAdvance,
  reduceMotion,
}: {
  step: number;
  onAdvance: () => void;
  reduceMotion: boolean;
}) {
  if (step === 0) {
    return (
      <Phone>
        <div className="flex min-h-[430px] flex-col items-center justify-center px-6 text-center">
          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <QrCode className="h-32 w-32 text-[#1d1d1f]" strokeWidth={1.4} />
          </div>
          <p className="mt-6 text-2xl font-black">Horneao°</p>
          <p className="mt-2 text-sm text-[#6e6e73]">Menú digital · Pedro Escobedo</p>
          <button
            type="button"
            onClick={onAdvance}
            className="mt-6 rounded-full bg-[#eb1901] px-5 py-2.5 text-sm font-bold text-white"
          >
            Abrir menú
          </button>
        </div>
      </Phone>
    );
  }

  if (step === 1) {
    return (
      <Phone>
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#86868b]">Populares</p>
          <div className="mt-4 overflow-hidden rounded-[1.6rem] bg-white shadow-sm">
            <div className="relative h-48">
              <Image
                src="/demo-pizza.jpg"
                alt="Pizza de pepperoni recién horneada"
                fill
                sizes="350px"
                className="object-cover"
                priority
              />
            </div>
            <div className="p-5">
              <p className="text-2xl font-black">Pizza Pepperoni</p>
              <p className="mt-2 text-sm text-[#6e6e73]">Grande · 8 rebanadas</p>
              <div className="mt-6 flex items-center justify-between">
                <span className="text-xl font-black">$120</span>
                <button
                  type="button"
                  onClick={onAdvance}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eb1901] text-white"
                  aria-label="Agregar Pizza Pepperoni"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Phone>
    );
  }

  if (step === 2) {
    return (
      <Phone>
        <div className="p-5">
          <p className="text-2xl font-black">Hazla a tu gusto</p>
          <p className="mt-2 text-sm text-[#6e6e73]">Elige una salsa</p>
          <div className="mt-6 space-y-3">
            {["Salsa roja", "Salsa verde", "Sin salsa"].map((option, index) => (
              <div
                key={option}
                className={`flex items-center justify-between rounded-2xl border p-4 ${
                  index === 0 ? "border-[#eb1901] bg-[#fff2ef]" : "border-[#dedede] bg-white"
                }`}
              >
                <span className="font-semibold">{option}</span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                    index === 0 ? "border-[#eb1901] bg-[#eb1901] text-white" : "border-[#c7c7c7]"
                  }`}
                >
                  {index === 0 ? <Check className="h-4 w-4" /> : null}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-7 flex items-center justify-between rounded-2xl bg-white p-4">
            <span className="font-semibold">Queso extra</span>
            <div className="flex items-center gap-4">
              <Minus className="h-4 w-4 text-[#86868b]" />
              <span className="font-black">1</span>
              <Plus className="h-4 w-4 text-[#eb1901]" />
            </div>
          </div>
          <button
            type="button"
            onClick={onAdvance}
            className="mt-6 w-full rounded-full bg-[#1d1d1f] py-3 text-sm font-bold text-white"
          >
            Guardar opciones
          </button>
        </div>
      </Phone>
    );
  }

  if (step === 3) {
    return (
      <Phone>
        <div className="p-5">
          <p className="text-2xl font-black">Revisa tu pedido</p>
          <div className="mt-6 rounded-2xl bg-white p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 text-[#eb1901]" />
              <div>
                <p className="font-bold">Entrega a domicilio</p>
                <p className="mt-1 text-sm text-[#6e6e73]">Pedro Escobedo Centro</p>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-3 rounded-2xl bg-white p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6e6e73]">Pizza Pepperoni</span>
              <span>$120</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6e6e73]">Queso extra</span>
              <span>$15</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6e6e73]">Envío</span>
              <span>$20</span>
            </div>
            <div className="flex justify-between border-t pt-4 text-lg font-black">
              <span>Total</span>
              <span>$155</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onAdvance}
            className="mt-6 w-full rounded-full bg-[#eb1901] py-3 text-sm font-bold text-white"
          >
            Enviar pedido
          </button>
        </div>
      </Phone>
    );
  }

  if (step === 4) {
    return (
      <Phone dark>
        <div className="flex min-h-[430px] flex-col items-center justify-center p-6">
          <motion.div
            animate={
              reduceMotion
                ? undefined
                : {
                    scale: [1, 1.06, 1],
                    boxShadow: [
                      "0 0 0 0 rgba(235,25,1,0)",
                      "0 0 0 18px rgba(235,25,1,.12)",
                      "0 0 0 0 rgba(235,25,1,0)",
                    ],
                  }
            }
            transition={{ repeat: Infinity, duration: 1.8 }}
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eb1901] text-white"
          >
            <BellRing className="h-8 w-8" />
          </motion.div>
          <p className="mt-7 text-sm font-bold uppercase tracking-[0.16em] text-[#ff6b59]">
            Nuevo pedido
          </p>
          <p className="mt-2 text-3xl font-black text-white">Pedido #1042</p>
          <div className="mt-6 w-full rounded-2xl bg-white/10 p-4 text-sm text-white">
            <div className="flex justify-between">
              <span className="text-white/55">Producto</span>
              <span className="font-semibold">Pizza Pepperoni</span>
            </div>
            <div className="mt-3 flex justify-between">
              <span className="text-white/55">Total</span>
              <span className="font-semibold">$155</span>
            </div>
            <div className="mt-3 flex justify-between">
              <span className="text-white/55">Pago</span>
              <span className="font-semibold">Efectivo</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onAdvance}
            className="mt-6 w-full rounded-full bg-white py-3 text-sm font-bold text-[#1d1d1f]"
          >
            Aceptar pedido
          </button>
        </div>
      </Phone>
    );
  }

  return (
    <Phone>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#eb1901]">
              En preparación
            </p>
            <p className="mt-2 text-2xl font-black">Pedido #1042</p>
          </div>
          <ChefHat className="h-9 w-9 text-[#eb1901]" />
        </div>
        <div className="mt-8 rounded-2xl bg-white p-5">
          <p className="text-sm text-[#6e6e73]">Estado actual</p>
          <p className="mt-2 text-xl font-black">Preparando el pedido</p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#e8e8ed]">
            <motion.div
              initial={reduceMotion ? false : { width: "20%" }}
              animate={{ width: "68%" }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="h-full rounded-full bg-[#eb1901]"
            />
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm text-[#6e6e73]">
            <Clock3 className="h-4 w-4" />
            Tiempo estimado: 25–35 min
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800">
          <Check className="mr-2 inline h-4 w-4" />
          El cliente ya recibió la actualización
        </div>
        <button
          type="button"
          onClick={onAdvance}
          className="mt-6 w-full rounded-full bg-[#1d1d1f] py-3 text-sm font-bold text-white"
        >
          Volver a comenzar
        </button>
      </div>
    </Phone>
  );
}

function Phone({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div className="w-full max-w-[390px] rounded-[3rem] bg-[#1d1d1f] p-2.5 shadow-[0_30px_80px_rgba(0,0,0,0.22)]">
      <div className={`min-h-[500px] overflow-hidden rounded-[2.45rem] ${dark ? "bg-[#1d1d1f]" : "bg-[#f5f5f7]"}`}>
        <div className="mx-auto mt-3 h-5 w-24 rounded-full bg-black" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
