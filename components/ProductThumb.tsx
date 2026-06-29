"use client";

import { imageUrl } from "@/lib/imageUrl";
import { buildStoreProductUrl } from "@/lib/utils";
import { PRODUCT_SEARCH_QUERY_RESULT, Product } from "@/sanity.types";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Heart } from "lucide-react";

type ProductThumbProduct = Product | PRODUCT_SEARCH_QUERY_RESULT[number];

function ProductThumb({ product }: { product: ProductThumbProduct }) {
    const [imageError, setImageError] = useState(false);
    const [isFavorite, setIsFavorite] = useState(false);
    const isOutOfStock = product.stock != null && product.stock <= 0;
    const slug = product.slug?.current || product._id || "";
    const affiliateStore = product.affiliateStore as
        | { _id?: string | null; _ref?: string | null }
        | null
        | undefined;
    const storeId = affiliateStore?._id || affiliateStore?._ref || "";
    const productHref = slug ? buildStoreProductUrl(storeId, slug) : "#";

    // Debug en desarrollo
    useEffect(() => {
        if (process.env.NODE_ENV === 'development' && product.name) {
            console.log(`Product ${product.name}:`, {
                hasImage: !!product.image,
                imageType: product.image?._type,
                hasAsset: !!product.image?.asset,
                assetRef: product.image?.asset?._ref
            });
        }
    }, [product]);

    // Generate image URL
    let imageSrc: string | null = null;
    if (product.image) {
        try {
            imageSrc = imageUrl(product.image).url();
        } catch (error) {
            console.error("Error generating image URL:", error, product.image);
            imageSrc = null;
        }
    }

    // Handle favorite toggle
    const handleFavoriteClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsFavorite(!isFavorite);
    };

    // Determine price range indicator
    const getPriceRange = () => {
        if (!product.price) return "$$";
        if (product.price < 10) return "$";
        if (product.price < 25) return "$$";
        if (product.price < 50) return "$$$";
        return "";
    };

    // Get stock status text
    const getStockStatus = () => {
        if (isOutOfStock) return "Agotado";
        if (product.stock != null && product.stock < 5) return `${product.stock} disponibles`;
        return "En stock";
    };

    return (
    <Link
    href={productHref}
    className={`group flex flex-col bg-white rounded-lg overflow-hidden w-full ${
        isOutOfStock ? "opacity-75" : ""
    }`}
    >
        {/* Image Container - Horizontal/Wide Aspect Ratio */}
        <div className="relative w-full h-48 overflow-hidden bg-gray-100">
            {imageSrc && !imageError ? (
                <Image 
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    src={imageSrc}
                    alt={product.name || "Product Image"}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    onError={() => setImageError(true)}
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                    <span className="text-gray-400 text-sm">Sin imagen</span>
                </div>
            )}
            
            {/* Out of Stock Overlay */}
            {isOutOfStock && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                    <span className="text-white font-bold text-lg">Producto agotado</span>
                </div>
            )}

            {/* Heart Icon - Favorite Button */}
            <button
                onClick={handleFavoriteClick}
                className="absolute bottom-2 right-2 z-20 p-2 rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors"
                aria-label="Add to favorites"
            >
                <Heart 
                    className={`w-5 h-5 transition-colors ${
                        isFavorite ? "fill-red-500 text-red-500" : "text-gray-600"
                    }`} 
                />
            </button>
        </div>

        {/* Product Info Section */}
        <div className="p-4 space-y-2">
            {/* Product Name */}
            <h2 className="text-xl font-bold text-gray-900 leading-tight">
                {product.name || "Sin nombre"}
            </h2>

            {/* Price Range and Category */}
            <div className="text-sm text-gray-500">
                {getPriceRange()} 
            </div>

            {/* Badges Row */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
                {/* Stock Status Badge */}
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isOutOfStock 
                        ? "bg-gray-200 text-gray-600" 
                        : "bg-gray-100 text-gray-700"
                }`}>
                    {getStockStatus()}
                </span>

              

                {/* Price Badge */}
                <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                    {product.price != null && typeof product.price === 'number' 
                        ? `$${product.price.toFixed(2)}` 
                        : 'Precio no disponible'}
                </span>
            </div>
        </div>
    </Link>
    );
}

export default ProductThumb;
