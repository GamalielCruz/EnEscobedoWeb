"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "elmenu-order-statuses";
const POLL_INTERVAL_MS = 30000;

type OrderNotificationItem = {
  _id: string;
  orderNumber: string;
  status: string;
  updatedAt: string;
  isClickCollect: boolean;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const statusLabels: Record<string, string> = {
  pending: "Recibido",
  paid: "Recibido",
  pending_delivery: "Recibido",
  pending_pickup: "Recibido",
  processing: "Preparando",
  shipped: "En camino",
  ready_for_pickup: "Listo para recoger",
  completed: "Completado",
  delivered: "Entregado",
  picked_up: "Recogido",
  cancelled: "Cancelado",
  failed: "Fallido",
  expired: "Expirado",
};

function getStatusLabel(status: string, isClickCollect: boolean) {
  if (status === "ready_for_pickup" && !isClickCollect) {
    return "En camino";
  }

  return statusLabels[status] ?? "Actualizado";
}

function loadSnapshot() {
  if (typeof window === "undefined") {
    return {} as Record<string, string>;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {} as Record<string, string>;
  }
}

function saveSnapshot(snapshot: Record<string, string>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  return navigator.serviceWorker.register("/sw.js");
}

async function showOrderNotification(order: OrderNotificationItem) {
  const title = `Pedido #${order.orderNumber}`;
  const body = `Estado: ${getStatusLabel(order.status, order.isClickCollect)}`;

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `order-${order._id}`,
        data: { url: "/orders" },
      });
      return;
    }
  }

  if ("Notification" in window) {
    new Notification(title, { body, icon: "/icon-192.png" });
  }
}

export function OrdersStatusNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [isEnabling, setIsEnabling] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/crios|fxios/.test(userAgent);
    setShowIosInstallHint(isIos && isSafari && !standalone);

    registerServiceWorker().catch(() => {
      // ponytail: fallback to direct Notification if the service worker is unavailable.
    });

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setInstallPrompt(null);
      setShowIosInstallHint(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (permission !== "granted") {
      return;
    }

    let cancelled = false;

    const checkOrders = async () => {
      const response = await fetch("/api/orders", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { orders?: OrderNotificationItem[] };
      const orders = data.orders ?? [];
      const previousSnapshot = loadSnapshot();
      const nextSnapshot: Record<string, string> = {};

      for (const order of orders) {
        const marker = `${order.status}|${order.updatedAt}`;
        nextSnapshot[order._id] = marker;

        if (!previousSnapshot[order._id]) {
          continue;
        }

        if (previousSnapshot[order._id] !== marker && !cancelled) {
          await showOrderNotification(order);
        }
      }

      if (!cancelled) {
        saveSnapshot(nextSnapshot);
      }
    };

    checkOrders().catch(() => {
      // Silent retry on next poll.
    });

    const interval = window.setInterval(() => {
      checkOrders().catch(() => {
        // Silent retry on next poll.
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [permission]);

  const helperText = useMemo(() => {
    if (permission === "unsupported") {
      return "Este navegador no soporta notificaciones web.";
    }

    if (permission === "granted") {
      return "Notificaciones activas para cambios de estado de tus pedidos mientras la app este abierta o instalada en uso.";
    }

    if (permission === "denied") {
      return "Las notificaciones estan bloqueadas. Debes habilitarlas desde la configuracion del navegador.";
    }

    return "Activa avisos para enterarte cuando tu pedido cambie de estado.";
  }, [permission]);

  const installHelperText = useMemo(() => {
    if (isStandalone) {
      return "La app ya esta agregada a tu pantalla de inicio.";
    }

    if (installPrompt) {
      return "Agrega la app a tu pantalla de inicio para abrirla como app y tenerla mas a la mano.";
    }

    if (showIosInstallHint) {
      return 'En iPhone, toca Compartir y luego "Agregar a pantalla de inicio".';
    }

    return null;
  }, [installPrompt, isStandalone, showIosInstallHint]);

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    setIsEnabling(true);
    try {
      await registerServiceWorker();
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
    } finally {
      setIsEnabling(false);
    }
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Notificaciones de pedidos</p>
          <p className="text-sm text-gray-500">{helperText}</p>
        </div>

        {permission === "default" && (
          <Button onClick={enableNotifications} disabled={isEnabling} size="sm">
            {isEnabling ? "Activando..." : "Activar notificaciones"}
          </Button>
        )}
      </div>

      {installHelperText ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-orange-100 bg-orange-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">App en pantalla de inicio</p>
            <p className="text-sm text-gray-600">{installHelperText}</p>
          </div>

          {installPrompt ? (
            <Button onClick={handleInstall} size="sm" variant="outline">
              Agregar app
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
