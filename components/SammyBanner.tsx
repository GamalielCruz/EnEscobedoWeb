"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import StoreCheckerModal from "./StoreCheckerModal";
import ModalPortal from "./ModalPortal";

function SammyBanner() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Array de imágenes para el scroll infinito
  const scrollImages = [
    { src: "/1.svg", alt: "Tienda 1" },
    { src: "/2.svg", alt: "Tienda 2" },
    { src: "/3.svg", alt: "Tienda 3" },
    { src: "/4.svg", alt: "Tienda 4" },
    { src: "/5.svg", alt: "Tienda 5" },
  ];

  return (
    <div
      className="relative overflow-hidden mx-2 sm:mx-4 mt-2 rounded-lg shadow-lg border-2 min-h-[180px] sm:min-h-[200px] md:h-48 lg:h-56"
      style={{
        background: "linear-gradient(135deg, #fff 0%, #fff 100%)",
      }}
    >
      {/* Infinite Horizontal Scroll Animation */}
      {isMounted && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-0 w-full transform -translate-y-1/2">
            <div className="w-full inline-flex flex-nowrap overflow-hidden [mask-image:_linear-gradient(to_right,transparent_0,_black_128px,_black_calc(100%-128px),transparent_100%)]">
              <ul className="flex items-center justify-start [&_li]:mx-8 [&_img]:max-w-none animate-infinite-scroll whitespace-nowrap">
                {scrollImages.map((image, index) => (
                  <li key={`first-${index}`} className="flex-shrink-0">
                    <Image
                      src={image.src}
                      alt={image.alt}
                      width={80}
                      height={80}
                      className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain opacity-45"
                    />
                  </li>
                ))}
              </ul>
              <ul
                className="flex items-center justify-start [&_li]:mx-8 [&_img]:max-w-none animate-infinite-scroll whitespace-nowrap"
                aria-hidden="true"
              >
                {scrollImages.map((image, index) => (
                  <li key={`second-${index}`} className="flex-shrink-0">
                    <Image
                      src={image.src}
                      alt={image.alt}
                      width={80}
                      height={80}
                      className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain opacity-45"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Imagen de la iglesia */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 md:bottom-8 md:right-8">
          <Image
            src="/iglesia.svg"
            alt="Pedro Escobedo"
            width={200}
            height={200}
            className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 object-contain opacity-80"
            priority
          />
        </div>
      </div>

      {/* Contenido principal */}
      <div className="relative z-20 flex flex-col justify-center h-full px-4 py-6 sm:px-6 sm:py-8 ">
        <h2 className="text-[#484e17] text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold mb-3 md:mb-4 leading-tight drop-shadow-sm">
          ¡Pedro Escobedo ahora tiene puntos de recolección!{" "}
        </h2>

        <p className="text-[#484e17]/90 text-xs sm:text-sm md:text-base mb-4 md:mb-6 leading-relaxed max-w-2xl drop-shadow-sm">
          • Envío gratis a tiendas afiliadas • Pago en efectivo
        </p>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-white text-[#484e17] font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition duration-300 self-start border-2 border-[#484e17]/20 hover:border-[#484e17]/40"
        >
          <span className="text-xs sm:text-sm md:text-base">
            Buscar Tiendas Cercanas
          </span>
        </button>
      </div>

      {/* CSS Fallback para la animación */}
      <style jsx>{`
        @keyframes infinite-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-100%);
          }
        }

        .animate-infinite-scroll {
          animation: infinite-scroll 25s linear infinite;
        }
      `}</style>

      {/* Modal usando Portal seguro */}
      <ModalPortal isOpen={isModalOpen}>
        <StoreCheckerModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onStoreFound={(store) => {
            console.log("Tienda encontrada:", store);
            // NO cerrar el modal automáticamente, dejar que el usuario vea la tienda y decida
          }}
        />
      </ModalPortal>
    </div>
  );
}

export default SammyBanner;
