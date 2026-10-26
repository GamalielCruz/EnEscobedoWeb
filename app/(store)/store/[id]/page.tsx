import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import { FulfillmentTimingPicker } from "@/components/FulfillmentTimingPicker";
import { getStoreServiceTiming } from "@/lib/storeOperationalState";
import { getStorePath } from "@/lib/store-url";
import { buildUrl } from "@/lib/urls";
import {
  buildStoreProductUrl,
  portableTextToPlainText,
  sanitizeText,
} from "@/lib/utils";
import { getShareableImageUrl, urlFor } from "@/sanity/lib/image";
import { getProductBySlug } from "@/sanity/lib/products/getProductBySlug";
import { getProductsByStore } from "@/sanity/lib/products/getProductsByStore";
import { getStoreById } from "@/sanity/lib/products/getStoreById";
import { orderProducts } from "@/lib/product-order";
import ShareButton from "../../product/ShareButton";
import { StoreProductsClient } from "./StoreProductsClient";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ product?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { product: requestedProduct } = await (
    searchParams ?? Promise.resolve({} as { product?: string })
  );
  const store = await getStoreById(id);

  if (!store) return { title: "Tienda | ElMenu" };

  const storeName = sanitizeText(store.name) || "Tienda";
  const productSlug = requestedProduct?.trim();
  const product = productSlug ? await getProductBySlug(productSlug) : null;

  if (product && product.affiliateStore?._id === id) {
    const productName = sanitizeText(product.name) || "Producto";
    const description =
      portableTextToPlainText(product.description) ||
      `Compra ${productName} en ${storeName} desde ElMenu.`;
    const imageUrl = product.image ? getShareableImageUrl(product.image) : undefined;
    const shareUrl = buildStoreProductUrl(id, productSlug || "");
    const title = `${productName} | ${storeName}`;

    return {
      title,
      description,
      alternates: { canonical: shareUrl },
      openGraph: {
        title,
        description,
        url: shareUrl,
        siteName: "ElMenu",
        type: "website",
        images: imageUrl ? [imageUrl] : [],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: imageUrl ? [imageUrl] : [],
      },
    };
  }

  const storeUrl = buildUrl(getStorePath(store));
  const title = `${storeName} | ElMenu`;
  const description = `Consulta el menú y pide en ${storeName}.`;
  const imageUrl = buildUrl(`/api/og/store/${id}`);

  return {
    title,
    description,
    alternates: { canonical: storeUrl },
    openGraph: {
      title,
      description,
      url: storeUrl,
      siteName: "ElMenu.site",
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: storeName }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: storeName }],
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
  const { product: requestedProduct } = await (
    searchParams ?? Promise.resolve({} as { product?: string })
  );
  const store = await getStoreById(id);

  if (!store) return notFound();

  const { products, categoryProductOrders, categoryOrder } = await getProductsByStore(id);
  const timing = getStoreServiceTiming(store);
  const highlightedProductSlug = requestedProduct?.trim() || "";
  const storeName = sanitizeText(store.name) || "Tienda";
  const storeUrl = buildUrl(getStorePath(store));
  const categoriesMap = new Map<
    string,
    { _id: string; title?: string; slug?: { current?: string } }
  >();

  products.forEach((product) => {
    const productCategories = (
      product as unknown as {
        categories?: Array<{
          _id: string;
          title?: string;
          slug?: { current?: string };
        }>;
      }
    ).categories;

    productCategories?.forEach((category) => {
      if (category._id && category.title && !categoriesMap.has(category._id)) {
        categoriesMap.set(category._id, {
          _id: category._id,
          title: category.title,
          slug: category.slug,
        });
      }
    });
  });

  const isSuper = id === "abarrotes-pilot";

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl">
        {isSuper ? (
          /* ── Portada estilo súper (fondo rojo) ── */
          <section className="relative overflow-hidden bg-[#c0392b]">
            {store.coverImage ? (
              <Image
                src={urlFor(store.coverImage).width(1200).height(500).url()}
                alt={`Portada de ${storeName}`}
                fill
                className="object-cover opacity-30"
                priority
              />
            ) : null}
            <div className="relative px-4 pt-6 pb-5">
              <div className="mb-4 flex items-center justify-between">
                <a
                  href="/"
                  className="flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Volver a tiendas
                </a>
                <ShareButton
                  url={storeUrl}
                  title={storeName}
                  text={`Consulta el menú y pide en ${storeName}.`}
                  variant="icon"
                  align="right"
                />
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-md">
                  {store.image ? (
                    <Image
                      src={urlFor(store.image).width(128).height(128).url()}
                      alt={storeName}
                      width={64}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-gray-700">{storeName.charAt(0)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {store.premiumBadgeEnabled ? (
                    <div className="mb-0.5">
                      <Image src="/elmenuplus.png" alt="ElMenu Plus" width={20} height={20} className="shrink-0" />
                    </div>
                  ) : null}
                  <h1 className="mt-0.5 text-2xl font-bold text-white leading-tight">{storeName}</h1>
                  {store.address?.city ? (
                    <p className="mt-0.5 text-sm text-white/70">{sanitizeText(store.address.city)}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <FulfillmentTimingPicker
                  storeId={id}
                  type={store.serviceTypes?.delivery === false ? "pickup" : "delivery"}
                  variant="store-status"
                />
                {timing.label ? (
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
                    </svg>
                    {timing.label}
                  </span>
                ) : null}
                {store.serviceTypes?.pickup !== false ? (
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8" />
                    </svg>
                    Envío o recoge
                  </span>
                ) : null}
              </div>

              {timing.highDemandMode ? (
                <p className="mt-2 text-xs font-medium text-yellow-200">
                  Alta demanda · Los pedidos pueden tardar más.
                </p>
              ) : null}
            </div>
          </section>
        ) : (
          /* ── Portada original para restaurantes ── */
          <>
            <section className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 md:h-64">
              {store.coverImage ? (
                <Image
                  src={urlFor(store.coverImage).width(1200).height(400).url()}
                  alt={`Portada de ${storeName}`}
                  fill
                  className="object-cover"
                  priority
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white shadow-lg md:h-24 md:w-24">
                    {store.image ? (
                      <Image
                        src={urlFor(store.image).width(200).height(200).url()}
                        alt={storeName}
                        width={96}
                        height={96}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl font-bold text-gray-700 md:text-4xl">
                        {storeName.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <h1 className="text-2xl font-bold text-white drop-shadow-lg md:text-3xl">
                      {storeName}
                    </h1>
                    {store.premiumBadgeEnabled ? (
                      <Image src="/elmenuplus.png" alt="ElMenu Plus" title="Restaurante participante del Plan Premium de ElMenu, con pagos en línea y beneficios para sus clientes." width={32} height={32} className="shrink-0" />
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="relative border-b border-gray-200 bg-white">
              <div className="py-4 pl-4 pr-16">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <FulfillmentTimingPicker
                    storeId={id}
                    type={store.serviceTypes?.delivery === false ? "pickup" : "delivery"}
                    variant="store-status"
                  />
                  <div className="flex items-center gap-1 text-gray-600">
                    {timing.label ? <span>Entrega estimada: {timing.label}</span> : null}
                  </div>
                </div>
                {timing.highDemandMode ? (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    Alta demanda · Los pedidos pueden tardar más.
                  </p>
                ) : null}
                {store.address?.city ? (
                  <p className="mt-2 text-xs font-medium text-black">
                    {sanitizeText(store.address.city)}
                  </p>
                ) : null}
              </div>
              <div className="absolute right-4 top-3">
                <ShareButton
                  url={storeUrl}
                  title={storeName}
                  text={`Consulta el menú y pide en ${storeName}.`}
                  variant="icon"
                  align="right"
                />
              </div>
            </section>
          </>
        )}

        <StoreProductsClient
          storeId={id}
          products={products}
           categories={orderProducts(Array.from(categoriesMap.values()), categoryOrder)}
          categoryProductOrders={categoryProductOrders}
          highlightedProductSlug={highlightedProductSlug}
        />
      </div>
    </div>
  );
}
