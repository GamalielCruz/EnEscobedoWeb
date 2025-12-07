import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getStoreById } from "@/sanity/lib/products/getStoreById";
import { getProductsByStore } from "@/sanity/lib/products/getProductsByStore";
import { urlFor } from "@/sanity/lib/image";
import { StoreProductsClient } from "./StoreProductsClient";
import { StoreStatus } from "@/components/StoreStatus";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const store = await getStoreById(id);

  if (!store) return notFound();

  return {
    title: `${store.name} | EnEscobedo`,
    description: `Explora los productos disponibles en ${store.name}`,
    openGraph: {
      title: `${store.name} | EnEscobedo`,
      description: `Explora los productos disponibles en ${store.name}`,
      url: `https://enescobedo.com/store/${id}`,
    },
  };
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await getStoreById(id);

  if (!store) return notFound();

  // Obtener productos de esta tienda
  const products = await getProductsByStore(id);



  const deliveryTimeText =
    store.deliveryTimeMin != null && store.deliveryTimeMax != null
      ? `${store.deliveryTimeMin}–${store.deliveryTimeMax} min`
      : store.averageDeliveryTime
      ? `${store.averageDeliveryTime} días`
      : "";

  const deliveryFeeText =
    store.deliveryFee != null ? `$${store.deliveryFee.toFixed(2)}` : "Gratis";

  // Debug: ver qué categorías tienen los productos
  console.log('Products count:', products.length);
  console.log('Sample product categories:', products[0]?.categories);

  // Extraer solo las categorías únicas de los productos de ESTA tienda
  const categoriesMap = new Map<string, { _id: string; title?: string; slug?: { current?: string } }>();
  
  products.forEach((product: any) => {
    product.categories?.forEach((cat: unknown) => {
      if (cat._id && cat.title && !categoriesMap.has(cat._id)) {
        categoriesMap.set(cat._id, {
          _id: cat._id,
          title: cat.title,
          slug: cat.slug,
        });
      }
    });
  });

  const categories = Array.from(categoriesMap.values());
  
  // Debug: ver qué categorías se están pasando
  console.log('Categories to pass to component:', JSON.stringify(categories, null, 2));
  console.log('Extracted categories:', categories);

  return (
    <div className="min-h-screen bg-white translate-y-[70px]">
      <div className="max-w-7xl mx-auto">
        {/* Header de la tienda - estilo Uber Eats */}
        <div className="relative w-full h-48 md:h-64 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
          {store.coverImage && (
            <Image
              src={urlFor(store.coverImage).width(1200).height(400).url()}
              alt={`${store.name} cover`}
              fill
              className="object-cover"
              priority
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="h-20 w-20 md:h-24 md:w-24 rounded-full bg-white shadow-lg mx-auto mb-4 flex items-center justify-center overflow-hidden">
                {store.image ? (
                  <Image
                    src={urlFor(store.image).width(200).height(200).url()}
                    alt={store.name || "Tienda"}
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl md:text-4xl font-bold text-gray-800">
                    {store.name?.charAt(0) || "T"}
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg">
                {store.name}
              </h1>
            </div>
          </div>
        </div>

        {/* Info de entrega */}
        <div className="border-b border-gray-200 bg-white">
          <div className="px-4 py-4">
            <div className="flex items-center gap-4 text-sm">
              {/* Estado de la tienda (Abierto/Cerrado) */}
              <StoreStatus operatingHours={store.operatingHours} />
              
              {/* Costo de entrega */}
              <div className="flex items-center gap-1 text-gray-600">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <span>{deliveryFeeText} entrega</span>
              </div>
            </div>
            {store.address && (
              <p className="mt-2 text-xs text-gray-500">
                 {store.address.city}
              </p>
            )}
          </div>
        </div>

        {/* Productos con filtro de categorías */}
        <StoreProductsClient products={products} categories={categories} />
      </div>
    </div>
  );
}
