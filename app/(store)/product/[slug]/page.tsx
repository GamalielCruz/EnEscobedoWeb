import { PortableText } from "next-sanity";
import { notFound } from "next/navigation";
import Link from "next/link";
import AddToBasketWithCustomization from "@/components/AddToBasketWithCustomization";
import { getProductBySlug } from "@/sanity/lib/products/getProductBySlug";
import type { BlockContent, Product } from "@/sanity.types";
import Image from "next/image";
import type { Metadata } from "next";
import { urlFor, getShareableImageUrl } from "@/sanity/lib/image";
import ShareButton from "../ShareButton";
import {
  buildStoreProductUrl,
  portableTextToPlainText,
  sanitizeText,
} from "@/lib/utils";
import LazyRelatedProducts from "@/components/LazyRelatedProducts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>; // ✅ Promise for Next.js 15
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return notFound();

  const productName = sanitizeText(product.name) || "Producto";
  const storeName = sanitizeText(product.affiliateStore?.name);
  const descriptionText =
    portableTextToPlainText(product.description) ||
    `Consulta ${productName}${storeName ? ` de ${storeName}` : ""} en ElMenu.`;
  const imageUrl = product.image
    ? getShareableImageUrl(product.image)
    : undefined;
  const shareUrl = buildStoreProductUrl(
    product.affiliateStore?._id || "",
    product.slug?.current || slug,
    true
  );
  const title = `${productName}${storeName ? ` | ${storeName}` : ""}`;

  return {
    title,
    description: descriptionText,
    alternates: { canonical: shareUrl },
    openGraph: {
      title,
      description: descriptionText,
      siteName: "ElMenu",
      type: "website",
      images: imageUrl ? [imageUrl] : [],
      url: shareUrl,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: descriptionText,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>; // ✅ Promise for Next.js 15
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Await params
  const { slug } = await params;
  await (searchParams ?? Promise.resolve({}));

  const product = await getProductBySlug(slug);
  if (!product) return notFound();

  const isOutOfStock = product.stock != null && product.stock <= 0;

  const mainImage = product.image ? [product.image] : [];
  const extraImages = Array.isArray(product.description)
    ? product.description.filter(
        (block: BlockContent[number]) => block._type === "image" && block.asset
      )
    : [];
  const allImages = [...mainImage, ...extraImages];

  // Get product categories for lazy loading related products
  const productCategories =
    product.categories?.map((category) => category._ref).filter(Boolean) || [];
  const shareUrl = buildStoreProductUrl(
    product.affiliateStore?._id || "",
    product.slug?.current || slug,
    true
  );

  const typedProduct = product as unknown as Product & {
    affiliateStore?: {
      _id: string;
      name?: string;
      image?: {
        asset?: {
          _ref: string;
          _type: "reference";
        };
      };
      averageDeliveryTime?: number;
      deliveryFee?: number;
      deliveryTimeMin?: number;
      deliveryTimeMax?: number;
    };
    optionGroups?: Array<{
      _key: string;
      title?: string;
      description?: string;
      required?: boolean;
      selectionType?: "single" | "multiple";
      options?: Array<{
        _key: string;
        label?: string;
        description?: string;
        priceDelta?: number;
        isDefault?: boolean;
      }>;
    }>;
  };

  const affiliateStore = typedProduct.affiliateStore;
  const productName = sanitizeText(product.name) || "Producto";
  const descriptionText = portableTextToPlainText(product.description);

  const deliveryFeeText =
    affiliateStore?.deliveryFee != null
      ? `$${affiliateStore.deliveryFee.toFixed(2)} Delivery Fee`
      : "";

  const deliveryTimeText =
    affiliateStore?.deliveryTimeMin != null &&
    affiliateStore?.deliveryTimeMax != null
      ? `${affiliateStore.deliveryTimeMin}–${affiliateStore.deliveryTimeMax} min`
      : affiliateStore?.averageDeliveryTime
      ? `${affiliateStore.averageDeliveryTime} días`
      : "";

  return (
    <div className="min-h-screen bg-[#f7f7f8] px-0 py-0 sm:px-4 sm:py-6">
      <div className="mx-auto flex max-w-2xl flex-col overflow-hidden bg-white shadow-sm sm:rounded-3xl sm:border sm:border-gray-200">
        {/* Imagen principal estilo tarjeta de delivery */}
        {allImages.length > 0 && (
          <div className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[16/10]">
            <Image
              src={urlFor(allImages[0]).width(1200).height(800).url()}
              alt={productName}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 600px"
            />
            {isOutOfStock && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white font-bold text-lg">
                  Producto agotado
                </span>
              </div>
            )}
          </div>
        )}

        {/* Contenido principal */}
        <div className="space-y-5 px-5 pb-6 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
                {productName}
              </h1>
              <div className="mt-1 text-2xl font-bold text-[#4d9f00]">
                $
                {typeof product.price === "number"
                  ? product.price.toFixed(2)
                  : "0.00"}
              </div>
            </div>
            <ShareButton
              url={shareUrl}
              title={productName}
              text={descriptionText}
              variant="icon"
              align="right"
            />
          </div>

          {Array.isArray(product.description) && (
              <section className="rounded-2xl bg-gray-50 p-4">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
                  Descripción
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 prose-p:my-1.5">
                <PortableText value={product.description as BlockContent} />
              </div>
              </section>
          )}

          {/* Info de tienda / restaurante */}
          {affiliateStore && (
            <Link 
              href={`/store/${affiliateStore._id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
                  {affiliateStore.image ? (
                    <Image
                      src={urlFor(affiliateStore.image).width(160).height(160).url()}
                      alt={affiliateStore.name || "Tienda"}
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-bold text-gray-600">
                      {affiliateStore.name?.charAt(0) || "T"}
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900">
                    {affiliateStore.name}
                  </span>
                  {deliveryTimeText && (
                    <span className="text-xs text-gray-500">
                      {deliveryTimeText}
                      {deliveryFeeText && ` • ${deliveryFeeText}`}
                    </span>
                  )}
                </div>
              </div>
              <svg 
                className="h-5 w-5 text-gray-400 flex-shrink-0" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}

          <AddToBasketWithCustomization
            product={product as unknown as Product}
            disabled={isOutOfStock}
          />
        </div>

        <div className="border-t border-gray-100 px-5 py-8 sm:px-6">
          <LazyRelatedProducts
            productSlug={product.slug?.current || slug}
            productCategories={productCategories}
          />
        </div>
      </div>
    </div>
  );
}
