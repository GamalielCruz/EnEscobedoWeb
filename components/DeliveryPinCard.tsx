"use client";

import { useState } from "react";

export function DeliveryPinCard({ pin }: { pin: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
    <p className="text-sm font-semibold text-amber-950">Tu PIN de entrega</p>
    <p className="mt-2 font-mono text-3xl font-bold tracking-[0.3em] text-gray-950">{visible ? pin : "••••••"}</p>
    <p className="mt-2 text-xs text-amber-900">Compártelo únicamente cuando tengas el pedido en tus manos.</p>
    <button type="button" onClick={() => setVisible((value) => !value)} className="mt-3 text-sm font-semibold text-[#eb1902] underline">{visible ? "Ocultar" : "Mostrar PIN"}</button>
  </div>;
}
