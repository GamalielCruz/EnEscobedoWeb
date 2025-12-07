"use client";

import Image from "next/image";
import { useState } from "react";
import { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { imageUrl } from "@/lib/imageUrl";

interface OptimizedImageProps {
  src: SanityImageSource | string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  sizes,
}: OptimizedImageProps) {
  const [imageError, setImageError] = useState(false);

  const handleError = () => {
    console.warn("Image failed to load for:", alt);
    setImageError(true);
  };

  const handleLoad = () => {
    setImageError(false);
  };

  // Si es string, usar directamente
  if (typeof src === "string") {
    if (imageError) {
      return (
        <div
          className={`bg-gray-200 flex items-center justify-center ${className}`}
          style={{ width, height }}
        >
          <div className="text-gray-400 text-xs text-center p-2">
            Error cargando imagen
          </div>
        </div>
      );
    }

    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        priority={priority}
        sizes={sizes}
        onError={handleError}
        onLoad={handleLoad}
        quality={85}
      />
    );
  }

  // Si no hay src de Sanity, mostrar placeholder
  if (!src) {
    return (
      <div
        className={`bg-gray-200 flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <div className="text-gray-400 text-xs text-center p-2">Sin imagen</div>
      </div>
    );
  }

  // Para imágenes de Sanity, usar imageUrl
  if (imageError) {
    return (
      <div
        className={`bg-gray-200 flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <div className="text-gray-400 text-xs text-center p-2">
          Error cargando imagen
        </div>
      </div>
    );
  }

  try {
    const sanityImageUrl = imageUrl(src).width(width).url();

    return (
      <Image
        src={sanityImageUrl}
        alt={alt}
        width={width}
        height={height}
        className={className}
        priority={priority}
        sizes={sizes}
        onError={handleError}
        onLoad={handleLoad}
        quality={85}
      />
    );
  } catch (error) {
    console.error("Error generating Sanity image URL:", error);
    return (
      <div
        className={`bg-gray-200 flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <div className="text-gray-400 text-xs text-center p-2">
          Error generando URL
        </div>
      </div>
    );
  }
}
