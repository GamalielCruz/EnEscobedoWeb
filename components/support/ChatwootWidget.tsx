"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { getChatwootConfig, isChatwootHiddenRoute } from "@/lib/chatwoot";

type ChatwootUser = {
  name?: string;
  email?: string;
  phone_number?: string;
  avatar_url?: string;
};

type ChatwootApi = {
  reset: () => void;
  setCustomAttributes: (
    attributes: Record<string, string | number | boolean>,
  ) => void;
  setUser: (identifier: string, user: ChatwootUser) => void;
  toggle: (state?: "open" | "close") => void;
  toggleBubbleVisibility: (state: "show" | "hide") => void;
};

declare global {
  interface Window {
    $chatwoot?: ChatwootApi;
    chatwootSDK?: {
      run: (config: { websiteToken: string; baseUrl: string }) => void;
    };
    chatwootSettings?: {
      availableMessage: string;
      hideMessageBubble: boolean;
      locale: string;
      position: "left" | "right";
      type: "standard" | "expanded_bubble";
      unavailableMessage: string;
      useBrowserLanguage: boolean;
      welcomeDescription: string;
      welcomeTitle: string;
    };
  }
}

const SCRIPT_ID = "chatwoot-sdk";
const config = getChatwootConfig();
let sdkPromise: Promise<void> | null = null;
let warnedAboutConfig = false;

function loadChatwoot(baseUrl: string, websiteToken: string) {
  if (window.$chatwoot) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  window.chatwootSettings = {
    hideMessageBubble: false,
    position: "right",
    locale: "es",
    useBrowserLanguage: false,
    type: "standard",
    welcomeTitle: "Soporte El Menú",
    welcomeDescription: "Hola 👋 ¿En qué podemos ayudarte con tu pedido?",
    availableMessage: "Estamos en línea y listos para ayudarte.",
    unavailableMessage:
      "En este momento nuestro equipo no está disponible. Déjanos tu mensaje y te responderemos lo antes posible.",
  };

  sdkPromise = new Promise<void>((resolve, reject) => {
    let script =
      (document.getElementById(SCRIPT_ID) as HTMLScriptElement | null) ??
      Array.from(document.scripts).find(
        (candidate) => candidate.src === `${baseUrl}/packs/js/sdk.js`,
      ) ??
      null;

    const run = () => {
      if (window.$chatwoot || script?.dataset.initialized === "true") {
        resolve();
        return;
      }
      if (!window.chatwootSDK || !script) {
        reject(new Error("El SDK no expuso chatwootSDK"));
        return;
      }

      script.dataset.initialized = "true";
      window.chatwootSDK.run({ websiteToken, baseUrl });
      resolve();
    };

    if (window.chatwootSDK) {
      run();
      return;
    }

    const onLoad = () => {
      script?.removeEventListener("error", onError);
      run();
    };
    const onError = () => {
      script?.removeEventListener("load", onLoad);
      reject(new Error("No se pudo cargar el SDK"));
    };

    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = `${baseUrl}/packs/js/sdk.js`;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      document.body.appendChild(script);
      return;
    }

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
  }).catch((error: unknown) => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}

export function ChatwootWidget() {
  const pathname = usePathname();
  const { isLoaded, user } = useUser();
  const [isReady, setIsReady] = useState(false);
  const previousUserId = useRef<string | null>(null);
  const isHidden = isChatwootHiddenRoute(pathname ?? "");

  useEffect(() => {
    if (!config) {
      if (process.env.NODE_ENV === "development" && !warnedAboutConfig) {
        warnedAboutConfig = true;
        console.warn("[Chatwoot] Configuración incompleta o inválida");
      }
      return;
    }

    const onReady = () => setIsReady(true);
    const onError = () => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[Chatwoot] El widget reportó un error");
      }
    };

    window.addEventListener("chatwoot:ready", onReady);
    window.addEventListener("chatwoot:error", onError);

    if (window.$chatwoot) setIsReady(true);
    if (!isHidden) {
      loadChatwoot(config.baseUrl, config.websiteToken).catch((error: unknown) => {
        if (process.env.NODE_ENV === "development") {
          console.warn("[Chatwoot] No se pudo iniciar el widget", error);
        }
      });
    }

    return () => {
      window.removeEventListener("chatwoot:ready", onReady);
      window.removeEventListener("chatwoot:error", onError);
    };
  }, [isHidden]);

  useEffect(() => {
    if (!isReady || !window.$chatwoot) return;

    if (isHidden) {
      window.$chatwoot.toggle("close");
      window.$chatwoot.toggleBubbleVisibility("hide");
    } else {
      window.$chatwoot.toggleBubbleVisibility("show");
    }
  }, [isHidden, isReady]);

  useEffect(() => {
    if (!isReady || !isLoaded || !window.$chatwoot) return;

    if (!user) {
      if (previousUserId.current) window.$chatwoot.reset();
      previousUserId.current = null;
      window.$chatwoot.setCustomAttributes({
        source: "elmenu-web",
        authenticated: false,
      });
      return;
    }

    if (previousUserId.current && previousUserId.current !== user.id) {
      window.$chatwoot.reset();
    }

    window.$chatwoot.setUser(user.id, {
      name: user.fullName ?? undefined,
      email: user.primaryEmailAddress?.emailAddress,
      phone_number: user.primaryPhoneNumber?.phoneNumber,
      avatar_url: user.imageUrl,
    });
    window.$chatwoot.setCustomAttributes({
      source: "elmenu-web",
      authenticated: true,
      app_role: "customer",
    });
    previousUserId.current = user.id;
  }, [isLoaded, isReady, user]);

  return null;
}
