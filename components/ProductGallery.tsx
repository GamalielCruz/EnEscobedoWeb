"use client";
import { useState } from "react";
import Image from "next/image";
import { imageUrl } from "@/lib/imageUrl";

type SanityImage = {
  asset?: {
    _ref: string;
    _type: "reference";
    _weak?: boolean;
  };
  media?: unknown;
  hotspot?: {
    _type: "sanity.imageHotspot";
    x?: number;
    y?: number;
    height?: number;
    width?: number;
  };
  crop?: {
    _type: "sanity.imageCrop";
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  _type: "image";
  _key?: string;
};

type ProductGalleryProps = {
  images: SanityImage[];
  alt: string;
  isOutOfStock?: boolean;
};

export default function ProductGallery(props: ProductGalleryProps) {
  const { images, alt, isOutOfStock } = props;
  const [selectedIdx, setSelectedIdx] = useState(0);

  return (
    <div className="flex flex-col-reverse md:flex-row md:items-start md:gap-4 lg:gap-6">
      {/* Contenedor de miniaturas */}
      {images.length > 1 && (
        <div className="relative">
          <div className="flex gap-3 overflow-x-auto md:flex-col md:overflow-y-auto w-full md:w-28 lg:w-32 pb-2 md:pb-0 md:pr-2 scrollbar-hide snap-x snap-mandatory md:snap-y md:snap-mandatory">
            {images.map((img, idx) => (
              <button
                key={img._key || idx}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`relative flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 md:w-24 md:h-24 lg:w-28 lg:h-28 border-2 rounded-lg transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#d4e400] focus:ring-opacity-50 snap-start ${
                  selectedIdx === idx
                    ? "border-[#d4e400] shadow-md ring-2 ring-[#d4e400] ring-opacity-30 bg-[#d4e400] bg-opacity-5"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="relative w-full h-full p-1">
                  <Image
                    src={imageUrl(img).url()}
                    alt={`${alt} thumbnail ${idx + 1}`}
                    fill
                    className="object-contain rounded-md"
                    sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, (max-width: 1024px) 96px, 112px"
                  />
                </div>
                {/* Indicador de selección */}
                {selectedIdx === idx && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#d4e400] rounded-full border-2 border-white shadow-sm"></div>
                )}
              </button>
            ))}
          </div>

          {/* Indicador de scroll para móviles */}
          {images.length > 3 && (
            <div className="md:hidden absolute bottom-0 left-1/2 transform -translate-x-1/2 flex gap-1 mt-2">
              {images.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    selectedIdx === idx ? "bg-[#d4e400]" : "bg-gray-300"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Imagen principal */}
      <div className="relative w-full max-w-lg md:max-w-md lg:max-w-lg xl:max-w-xl mx-auto md:mx-0 aspect-square overflow-hidden rounded-lg shadow-lg bg-white">
        <div className="relative w-full h-full p-4">
          <Image
            src={imageUrl(images[selectedIdx]).url()}
            alt={alt}
            fill
            className="object-contain"
            priority
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 448px, (max-width: 1280px) 512px, 576px"
          />
        </div>
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10 rounded-lg">
            <span className="text-white font-bold text-lg px-4 py-2 bg-black bg-opacity-75 rounded-md">
              Producto agotado
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
