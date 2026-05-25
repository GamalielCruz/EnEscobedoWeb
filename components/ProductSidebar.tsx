"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { urlFor } from '@/sanity/lib/image';
import AddToBasketButtonNew from './AddToBasketButtonNew';
import AddToBasketWithCustomization from './AddToBasketWithCustomization';
import useBasketStore from '@/store/store';
import { Product } from '@/sanity.types';

interface ProductSidebarProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProductSidebar({ product, isOpen, onClose }: ProductSidebarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { getItemCount } = useBasketStore();

  // Asegurar que el componente esté montado en el cliente
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      
      // Guardar la posición actual del scroll
      const scrollY = window.scrollY;
      
      // Aplicar estilos para bloquear scroll sin mover el contenido
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      
      // Guardar la posición para restaurarla después
      document.body.setAttribute('data-scroll-y', scrollY.toString());
    } else {
      // Restaurar scroll del body
      const scrollY = document.body.getAttribute('data-scroll-y');
      
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      
      // Restaurar la posición de scroll
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY));
        document.body.removeAttribute('data-scroll-y');
      }
    }

    return () => {
      // Cleanup completo en caso de desmontaje
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      
      const scrollY = document.body.getAttribute('data-scroll-y');
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY));
        document.body.removeAttribute('data-scroll-y');
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  if (!isOpen || !product || !mounted) return null;

  const isOutOfStock = product.stock != null && product.stock <= 0;
  const itemCount = getItemCount(product._id);

  const sidebarContent = (
    <div className="fixed inset-0 z-[9999]" style={{ zIndex: 9999 }}>
      {/* Overlay */}
      <div 
        className={`fixed inset-0 bg-black transition-opacity duration-300 ${
          isVisible ? 'opacity-50' : 'opacity-0'
        }`}
        onClick={handleClose}
        style={{ zIndex: 9999 }}
      />
      
      {/* Sidebar */}
      <div 
        className={`fixed right-0 top-0 w-full max-w-md h-screen bg-white transform transition-transform duration-300 ease-in-out flex flex-col ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ 
          height: '100vh', 
          zIndex: 10000,
          position: 'fixed',
          top: 0,
          right: 0
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={handleClose}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Volver al menú</span>
          </button>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Product Image */}
          <div className="relative aspect-square bg-gray-100">
            {product.image ? (
              <Image
                src={urlFor(product.image).width(600).height(600).url()}
                alt={product.name || "Producto"}
                fill
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-gray-400 text-lg">Sin imagen</span>
              </div>
            )}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white text-lg font-semibold">Agotado</span>
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="p-4 space-y-4">
            {/* Title and Price */}
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                {product.name}
              </h1>
              <p className="text-xl font-bold text-[#70E000]">
                ${typeof product.price === "number" ? product.price.toFixed(2) : "0.00"}
              </p>
            </div>

            {/* Description */}
            {product.description && (
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Descripción</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {typeof product.description === 'string' 
                    ? product.description 
                    : 'Descripción no disponible'
                  }
                </p>
              </div>
            )}

            {/* Categories */}
            {product.categories && Array.isArray(product.categories) && product.categories.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Categorías</h3>
                <div className="flex flex-wrap gap-1">
                  {product.categories.map((category, index) => {
                    let categoryName = 'Sin categoría';
                    let categoryKey = `category-${index}`;
                    
                    if (typeof category === 'object' && category !== null) {
                      if ('_id' in category && typeof category._id === 'string') {
                        categoryKey = category._id;
                        const catObj = category as { _id: string; title?: string; name?: string };
                        categoryName = String(catObj.title || catObj.name || 'Sin categoría');
                      } else if ('_ref' in category) {
                        const refCategory = category as { _ref: string };
                        categoryKey = refCategory._ref;
                        categoryName = 'Categoría';
                      }
                    }
                    
                    return (
                      <span
                        key={categoryKey}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                      >
                        {categoryName}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            
            {/* Botón Agregar - Posición prominente */}
            <div className="pt-2 pb-2">
              {product.optionGroups && product.optionGroups.length > 0 ? (
                <AddToBasketWithCustomization 
                  product={product} 
                  disabled={isOutOfStock}
                  onClose={handleClose}
                />
              ) : (
                <AddToBasketButtonNew 
                  product={product} 
                  disabled={isOutOfStock}
                />
              )}
            </div>

            {/* Cart Counter */}
            {itemCount > 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-green-800">
                    En tu carrito
                  </span>
                  <span className="text-base font-bold text-[#70E000]">
                    {itemCount} {itemCount === 1 ? 'unidad' : 'unidades'}
                  </span>
                </div>
              </div>
            )}

            {/* Espaciado extra */}
            <div className="h-4"></div>
          </div>
        </div>
      </div>
    </div>
  );

  // Renderizar usando portal directamente en el body
  return createPortal(sidebarContent, document.body);
}