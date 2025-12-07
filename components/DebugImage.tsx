"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { imageUrl } from "@/lib/imageUrl";

interface DebugImageProps {
  src: SanityImageSource | string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export default function DebugImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  sizes,
}: DebugImageProps) {
  const [imageError, setImageError] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    if (typeof src === 'string') {
      setDebugInfo(`String URL: ${src}`);
    } else if (src) {
      try {
        const url = imageUrl(src).width(width).url();
        setDebugInfo(`Sanity URL: ${url}`);
      } catch (error) {
        setDebugInfo(`Error: ${error}`);
      }
    } else {
      setDebugInfo('No src provided');
    }
  }, [src, width]);

  const handleError = () => {
    console.error('Image failed to load:', debugInfo);
    setImageError(true);
  };

  const handleLoad = () => {
    console.log('Image loaded successfully:', debugInfo);
  };

  // Mostrar información de debug
  if (process.env.NODE_ENV === 'development') {
    console.log('DebugImage render:', { alt, debugInfo, imageError });
  }

  // Si hay error, mostrar información de debug
  if (imageError) {
    return (
      <div 
        className={`bg-red-100 border border-red-300 flex flex-col items-center justify-center p-2 ${className}`}
        style={{ width, height }}
      >
        <div className="text-red-600 text-xs text-center font-bold mb-1">
          ERROR
        </div>
        <div className="text-red-500 text-xs text-center break-all">
          {debugInfo}
        </div>
      </div>
    );
  }

  // Si es string, usar directamente
  if (typeof src === 'string') {
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

  // Si no hay src de Sanity
  if (!src) {
    return (
      <div 
        className={`bg-yellow-100 border border-yellow-300 flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <div className="text-yellow-600 text-xs text-center">
          Sin imagen
        </div>
      </div>
    );
  }

  // Para imágenes de Sanity
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
    return (
      <div 
        className={`bg-red-100 border border-red-300 flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <div className="text-red-600 text-xs text-center">
          Error: {String(error)}
        </div>
      </div>
    );
  }
}