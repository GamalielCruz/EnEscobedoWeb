"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessagesSquare, Send, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DispatchDriverCard } from "@/lib/dispatch/dispatch-core";

type Props = {
  drivers: DispatchDriverCard[];
  busy: boolean;
  onChanged: () => void;
  notify: (kind: "success" | "error", message: string) => void;
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "R";
}

function messageTime(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  const today = new Date().toDateString() === date.toDateString();
  const time = date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  return today ? time : `${date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} ${time}`;
}

export function DriverSupportPanel({ drivers, busy, onChanged, notify }: Props) {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [localRead, setLocalRead] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversations = useMemo(() => {
    return drivers
      .filter((d) => (d.supportChat ?? []).length > 0)
      .map((driver) => {
        const messages = [...(driver.supportChat ?? [])].sort((a, b) =>
          (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
        );
        const last = messages[messages.length - 1];
        const unread = messages.filter((m) => m.role === "driver" && !m.readAt && !localRead[driver._id]).length;
        return { driver, messages, unread, last };
      })
      .sort((a, b) => {
        if (b.unread !== a.unread) return b.unread - a.unread;
        return (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? "");
      });
  }, [drivers, localRead]);

  const selected = conversations.find((c) => c.driver._id === selectedDriverId) ?? null;

  // Marcar como leído al abrir una conversación
  useEffect(() => {
    if (!selected || selected.unread === 0) return;
    setLocalRead((prev) => ({ ...prev, [selected.driver._id]: true }));
    fetch("/api/admin/dispatch/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", driverId: selected.driver._id }),
    }).catch(() => null);
  }, [selectedDriverId, selected?.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll al final de la conversación
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selected?.messages.length, selectedDriverId]);

  async function sendReply() {
    const body = draft.trim();
    if (!selected || !body) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/dispatch/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", driverId: selected.driver._id, message: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar");
      setDraft("");
      notify("success", `Respuesta enviada a ${selected.driver.name} por WhatsApp.`);
      onChanged();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo enviar la respuesta.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {/* ── Lista de conversaciones ─────────────────────────────── */}
      <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-black/6 bg-white shadow-[0_1px_3px_rgba(9,25,59,0.06)] dark:border-white/10 dark:bg-[#0d1526]">
        <div className="flex items-center gap-2 border-b border-black/6 px-3 py-2 dark:border-white/10">
          <MessagesSquare className="h-4 w-4 text-[#EB1902]" />
          <span className="text-xs font-bold text-[#09193B] dark:text-white">Mensajes de repartidores</span>
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
            {conversations.length}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <MessagesSquare className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">No hay mensajes todavía.</p>
              <p className="max-w-[230px] text-[11px] leading-relaxed text-slate-400/80 dark:text-slate-600">
                Cuando un repartidor escriba un mensaje que no sea un comando (p. ej.{" "}
                <span className="font-bold">Ayuda</span>), aparecerá aquí con su texto original para que puedas
                responderle.
              </p>
            </div>
          ) : (
            conversations.map(({ driver, unread, last }) => (
              <button
                key={driver._id}
                type="button"
                onClick={() => setSelectedDriverId(driver._id)}
                className={cn(
                  "flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5",
                  selectedDriverId === driver._id && "bg-rose-50/60 dark:bg-rose-500/10"
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#EB1902] to-[#850C22] text-xs font-bold text-white">
                  {initials(driver.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-bold text-[#09193B] dark:text-white">{driver.name}</p>
                    {unread > 0 && (
                      <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#EB1902] px-1 text-[9px] font-black text-white">
                        {unread}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{last?.body ?? "—"}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Hilo de la conversación ─────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/6 bg-white shadow-[0_1px_3px_rgba(9,25,59,0.06)] dark:border-white/10 dark:bg-[#0d1526]">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Truck className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Selecciona una conversación.</p>
            <p className="max-w-[260px] text-[11px] text-slate-400/80 dark:text-slate-600">
              Verás aquí el historial real de mensajes del repartidor y podrás responderle por WhatsApp.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-black/6 px-3 py-2 dark:border-white/10">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#EB1902] to-[#850C22] text-[11px] font-bold text-white">
                {initials(selected.driver.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-[#09193B] dark:text-white">{selected.driver.name}</p>
                <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">
                  {selected.driver.phone} · las respuestas se envían por WhatsApp
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {selected.messages.map((msg, index) => {
                const isAdmin = msg.role === "admin";
                return (
                  <div key={`${msg.createdAt ?? index}-${index}`} className={cn("flex", isAdmin ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm",
                        isAdmin
                          ? "rounded-br-md bg-[#EB1902] text-white"
                          : "rounded-bl-md border border-slate-200 bg-slate-50 text-[#09193B] dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      <p className={cn("mt-1 text-right text-[9px] font-semibold", isAdmin ? "text-white/70" : "text-slate-400")}>
                        {messageTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-black/6 p-2.5 dark:border-white/10">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  placeholder="Escribe tu respuesta al repartidor (se envía por WhatsApp)..."
                  rows={2}
                  className="min-h-0 flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-[#09193B] outline-none transition placeholder:text-slate-400 focus:border-[#EB1902] focus:ring-2 focus:ring-[#EB1902]/20 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || busy || !draft.trim()}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#EB1902] px-3 text-xs font-bold text-white transition hover:bg-[#c81502] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                Enter para enviar · Shift+Enter para salto de línea · la respuesta usa la infraestructura de WhatsApp existente (texto libre al repartidor).
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
