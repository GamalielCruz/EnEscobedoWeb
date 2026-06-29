import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getStoreById } from "@/sanity/lib/products/getStoreById";
import { getProductsByStore } from "@/sanity/lib/products/getProductsByStore";
import { getProductBySlug } from "@/sanity/lib/products/getProductBySlug";
import { urlFor } from "@/sanity/lib/image";
import { StoreProductsClient } from "./StoreProductsClient";
import { StoreStatus } from "@/components/StoreStatus";
import { getShareableImageUrl } from "@/sanity/lib/image";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ product?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const resolvedSearchParams = (await (searchParams ?? Promise.resolve({}))) as {
    product?: string;
  };
  const store = await getStoreById(id);

  if (!store) return notFound();

  const productSlug = resolvedSearchParams.product?.trim();
  const product = productSlug ? await getProductBySlug(productSlug) : null;

  if (product && product.affiliateStore?._id === id) {
    const descriptionText =
      typeof product.description === "string"
        ? product.description
        : Array.isArray(product.description)
          ? product.description
              .filter((block: any) => block?._type === "block")
              .flatMap((block: any) => block?.children ?? [])
              .map((child: any) => child?.text || "")
              .join(" ")
          : "";
    const imageUrl = product.image ? getShareableImageUrl(product.image) : undefined;

    return {
      title: product.name ? `${product.name} | ${store.name}` : `${store.name} | EnEscobedo`,
      description: descriptionText || `Compra ${product.name || "este producto"} en ${store.name}.`,
      openGraph: {
        title: product.name ? `${product.name} | ${store.name}` : `${store.name} | EnEscobedo`,
        description: descriptionText || `Compra ${product.name || "este producto"} en ${store.name}.`,
        url: `https://enescobedo.com/store/${id}?product=${encodeURIComponent(productSlug || "")}`,
        images: imageUrl ? [imageUrl] : [],
      },
    };
  }

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ product?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = (await (searchParams ?? Promise.resolve({}))) as {
    product?: string;
  };
  const store = await getStoreById(id);

  if (!store) return notFound();

  // Obtener productos de esta tienda
  const products = await getProductsByStore(id);
  const highlightedProductSlug = resolvedSearchParams.product?.trim() || "";



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

  // Extraer solo las categorías únicas de los productos de ESTA tienda
  const categoriesMap = new Map<string, { _id: string; title?: string; slug?: { current?: string } }>();
  
  products.forEach((product: any) => {
    product.categories?.forEach((cat: any) => {
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
    <div className="min-h-screen bg-white">
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
                  <span className="text-3xl md:text-4xl font-bold text-white">
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
              <StoreStatus
                operatingHours={store.operatingHours || undefined}
                isOpen={store.isOpen}
                manualOperationalStatus={store.manualOperationalStatus}
                highDemandMode={store.highDemandMode}
                serviceTypes={store.serviceTypes || undefined}
              />
              
              {/* Costo de entrega */}
              <div className="flex items-center gap-1 text-gray-600">
                
              </div>
            </div>
            {store.address && (
              <p className="mt-2 text-xs text-black font-medium">
                 {store.address.city}
              </p>
            )}
          </div>
        </div>

        {/* Productos con filtro de categorías */}
        <StoreProductsClient
          products={products as any}
          categories={categories}
          highlightedProductSlug={highlightedProductSlug}
        />
      </div>
    </div>
  );
}

