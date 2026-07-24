"use client";

import { useState } from "react";
import { Check, Copy, Facebook, MessageCircle, Share2 } from "lucide-react";
import { cn, sanitizeText } from "@/lib/utils";

type ShareButtonProps = {
  url: string;
  title: string;
  text?: string;
  variant?: "button" | "icon";
  align?: "left" | "right";
};

export default function ShareButton({
  url,
  title,
  text,
  variant = "button",
  align = "left",
}: ShareButtonProps) {
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [copied, setCopied] = useState(false);
  const cleanTitle = sanitizeText(title) || "ElMenu";
  const cleanDescription = sanitizeText(text) || "Descúbrelo en ElMenu.";
  const shareText = `${cleanTitle}\n\n${cleanDescription}\n\n${url}`;

  const handleNativeShare = async () => {
    if (!navigator.share) {
      setShowShareOptions(true);
      return;
    }

    try {
      await navigator.share({
        title: cleanTitle,
        text: cleanDescription,
        url,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShowShareOptions(true);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setShowShareOptions(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  const openShareUrl = (shareUrl: string) => {
    window.open(shareUrl, "_blank", "noopener,noreferrer");
    setShowShareOptions(false);
  };

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={handleNativeShare}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5bb800] focus-visible:ring-offset-2",
          variant === "icon"
            ? "h-11 w-11 rounded-full border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50"
            : "h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-800 shadow-sm hover:border-gray-300 hover:bg-gray-50"
        )}
        aria-label="Compartir"
        aria-expanded={showShareOptions}
      >
        <Share2 className="h-5 w-5" aria-hidden="true" />
        {variant === "button" ? <span>Compartir</span> : null}
      </button>

      {showShareOptions ? (
        <>
          <div
            className={cn(
              "absolute top-full z-[60] mt-2 min-w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-xl",
              align === "right" ? "right-0" : "left-0"
            )}
            role="menu"
          >
            <button
              type="button"
              onClick={copyToClipboard}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
              role="menuitem"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? "Enlace copiado" : "Copiar enlace"}
            </button>
            <button
              type="button"
              onClick={() =>
                openShareUrl(`https://wa.me/?text=${encodeURIComponent(shareText)}`)
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
              role="menuitem"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() =>
                openShareUrl(
                  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
                )
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
              role="menuitem"
            >
              <Facebook className="h-4 w-4" aria-hidden="true" />
              Facebook
            </button>
            <button
              type="button"
              onClick={() =>
                openShareUrl(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`
                )
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
              role="menuitem"
            >
              <span className="w-4 text-center font-bold" aria-hidden="true">X</span>
              X
            </button>
          </div>
          <button
            type="button"
            className="fixed inset-0 z-50 cursor-default"
            onClick={() => setShowShareOptions(false)}
            aria-label="Cerrar opciones para compartir"
          />
        </>
      ) : null}
    </div>
  );
}
