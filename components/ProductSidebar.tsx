"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { PortableText } from "next-sanity";
import { ArrowLeft, X } from "lucide-react";
import type { BlockContent, Product } from "@/sanity.types";
import { urlFor } from "@/sanity/lib/image";
import { buildStoreProductUrl, portableTextToPlainText, sanitizeText } from "@/lib/utils";
import useBasketStore from "@/store/store";
import AddToBasketWithCustomization from "./AddToBasketWithCustomization";
import ShareButton from "@/app/(store)/product/ShareButton";

interface ProductSidebarProps {
  product: Product | null;
  storeId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProductSidebar({
  product,
  storeId,
  isOpen,
  onClose,
}: ProductSidebarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { getItemCount } = useBasketStore();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;

    setIsVisible(true);
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsVisible(false);
        setTimeout(onClose, 250);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [isOpen, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 250);
  };

  if (!isOpen || !product || !mounted) return null;

  const productName = sanitizeText(product.name) || "Producto";
  const description = portableTextToPlainText(product.description);
  const productSlug = product.slug?.current || "";
  const shareUrl = buildStoreProductUrl(storeId, productSlug);
  const isOutOfStock = product.stock != null && product.stock <= 0;
  const itemCount = getItemCount(product._id);

  return createPortal(
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true" aria-label={productName}>
      <button
        type="button"
        className={`fixed inset-0 bg-black/55 transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
        aria-label="Cerrar detalle del producto"
      />

      <aside
        className={`fixed right-0 top-0 z-[10000] flex h-dvh w-full max-w-lg transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-out xl:max-w-xl ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5bb800]"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            Volver al menú
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5bb800]"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="relative aspect-[4/3] bg-gray-100">
            {product.image ? (
              <Image
                src={urlFor(product.image).width(900).height(675).url()}
                alt={productName}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 640px) 100vw, 576px"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                Sin imagen
              </div>
            )}
            {isOutOfStock ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                <span className="rounded-full bg-white/95 px-4 py-2 text-sm font-bold text-gray-900">
                  Producto agotado
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-6 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight text-gray-950">
                  {productName}
                </h2>
                <p className="mt-1 text-2xl font-bold text-[#4d9f00]">
                  ${typeof product.price === "number" ? product.price.toFixed(2) : "0.00"}
                </p>
              </div>
              <ShareButton
                url={shareUrl}
                title={productName}
                text={description}
                variant="icon"
                align="right"
              />
            </div>

            {product.description ? (
              <section className="rounded-2xl bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
                  Descripción
                </h3>
                {Array.isArray(product.description) ? (
                  <div className="prose prose-sm max-w-none text-gray-700 prose-p:my-1.5">
                    <PortableText value={product.description as BlockContent} />
                  </div>
                ) : (
                  <p className="whitespace-pre-line text-sm leading-6 text-gray-700">
                    {description}
                  </p>
                )}
              </section>
            ) : null}

            {product.categories?.length ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Categorías</h3>
                <div className="flex flex-wrap gap-2">
                  {product.categories.map((category, index) => {
                    const resolvedCategory = category as unknown as {
                      _id?: string;
                      _ref?: string;
                      title?: string;
                      name?: string;
                    };
                    const categoryName =
                      sanitizeText(resolvedCategory.title || resolvedCategory.name) ||
                      "Categoría";

                    return (
                      <span
                        key={resolvedCategory._id || resolvedCategory._ref || index}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600"
                      >
                        {categoryName}
                      </span>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {itemCount > 0 ? (
              <div className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 p-4">
                <span className="text-sm font-semibold text-green-900">En tu carrito</span>
                <span className="text-sm font-bold text-green-700">
                  {itemCount} {itemCount === 1 ? "unidad" : "unidades"}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="max-h-[72dvh] flex-shrink-0 overflow-y-auto border-t border-gray-200 bg-white p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.05)]">
          <AddToBasketWithCustomization
            product={product}
            disabled={isOutOfStock}
            onClose={handleClose}
          />
        </div>
      </aside>
    </div>,
    document.body
  );
}
