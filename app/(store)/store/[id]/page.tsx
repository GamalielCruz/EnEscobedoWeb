import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

  if (!store) return notFound();

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

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl">
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
                  <Image src="/elmenuplus.svg" alt="ElMenu Plus" title="Restaurante participante del Plan Premium de ElMenu, con pagos en línea y beneficios para sus clientes." width={32} height={32} className="shrink-0" />
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="relative border-b border-gray-200 bg-white">
          <div className="py-4 pl-4 pr-16">
            <div className="flex items-center gap-4 text-sm">
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
