import { PortableText } from "next-sanity";
import { notFound } from "next/navigation";
import Link from "next/link";
import AddToBasketButtonNew from "@/components/AddToBasketButtonNew";
import { getProductBySlug } from "@/sanity/lib/products/getProductBySlug";
import type { BlockContent, Product } from "@/sanity.types";
import Image from "next/image";
import type { Metadata } from "next";
import { urlFor, getShareableImageUrl } from "@/sanity/lib/image";
import ShareButton from "../ShareButton";
import { buildStoreProductUrl } from "@/lib/utils";
import LazyRelatedProducts from "@/components/LazyRelatedProducts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>; // ✅ Promise for Next.js 15
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return notFound();

  // Convert description into plain text
  let descriptionText = "";
  if (Array.isArray(product.description)) {
    const firstBlock = product.description.find(
      (block) =>
        block._type === "block" &&
        "children" in block &&
        Array.isArray(block.children)
    );
    if (firstBlock && "children" in firstBlock && firstBlock.children) {
      descriptionText = firstBlock.children
        .map((child) => child.text || "")
        .join(" ");
    }
  } else if (typeof product.description === "string") {
    descriptionText = product.description;
  }

  const imageUrl = product.image
    ? getShareableImageUrl(product.image)
    : undefined;
  const shareUrl = buildStoreProductUrl(
    product.affiliateStore?._id || "",
    product.slug?.current || slug,
    true
  );

  return {
    title: product.name
      ? `${product.name} | Pixel A Plástico`
      : "Pixel A Plástico | Querétaro",
    description: descriptionText || "El Menu.",
    openGraph: {
      title: product.name
        ? `${product.name} | Pixel A Plástico`
        : "Pixel A Plástico | Querétaro",
      description: descriptionText || "El Menu.",
      images: imageUrl
        ? [imageUrl]
        : [
            "https://store-with-stripe.vercel.app/_next/image?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fkgklfrat%2Fproduction%2Fc765b695508ea8327a6ec91548d22cddb4064a9d-2048x2048.png&w=1920&q=75",
          ],
      url: shareUrl,
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
  const productCategories = product.categories?.map((cat) => cat._ref) || [];
  const shareUrl = buildStoreProductUrl(
    product.affiliateStore?._id || "",
    product.slug?.current || slug,
    true
  );

  const typedProduct = product as any as Product & {
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
  const optionGroups = typedProduct.optionGroups || [];

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

  const infoLine = [deliveryFeeText, deliveryTimeText]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-xl mx-auto bg-white flex flex-col">
        {/* Imagen principal estilo tarjeta de delivery */}
        {allImages.length > 0 && (
          <div className="relative w-full h-64 md:h-80 overflow-hidden">
            <Image
              src={urlFor(allImages[0]).width(1200).height(800).url()}
              alt={product.name ?? "Imagen de producto"}
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
        <div className="px-4 pt-4 pb-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {product.name}
            </h1>
            <div className="mt-1 text-xl font-semibold text-gray-900">
              $
              {typeof product.price === "number"
                ? product.price.toFixed(2)
                : "0.00"}
            </div>
            {Array.isArray(product.description) && (
              <div className="mt-2 text-sm text-gray-700 leading-relaxed">
                <PortableText value={product.description as BlockContent} />
              </div>
            )}
          </div>

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

          {/* Opciones de personalización (similar a spice level, pero genérico) */}
          {optionGroups.length > 0 && (
            <div className="space-y-6 pt-2">
              {optionGroups.map((group) => (
                <section key={group._key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-900">
                      {group.title}
                    </h2>
                    {group.required && (
                      <span className="text-xs font-medium text-gray-500 px-2 py-1 rounded-full bg-gray-100">
                        Obligatorio
                      </span>
                    )}
                  </div>
                  {group.description && (
                    <p className="text-xs text-gray-500">
                      {group.description}
                    </p>
                  )}
                  <div className="space-y-2">
                    {group.options?.map((option) => {
                      const controlName = `group-${group._key}`;
                      const inputType =
                        group.selectionType === "multiple"
                          ? "checkbox"
                          : "radio";

                      return (
                        <label
                          key={option._key}
                          className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm text-gray-900">
                              {option.label}
                            </span>
                            {option.description && (
                              <span className="text-xs text-gray-500">
                                {option.description}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {option.priceDelta != null &&
                              option.priceDelta !== 0 && (
                                <span className="text-xs text-gray-700">
                                  {option.priceDelta > 0 ? "+" : "-"}$
                                  {Math.abs(option.priceDelta).toFixed(2)}
                                </span>
                              )}
                            <input
                              type={inputType}
                              name={controlName}
                              defaultChecked={option.isDefault}
                              className="h-4 w-4 text-black border-gray-300 focus:ring-black"
                              readOnly
                            />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div>
            <ShareButton
              url={shareUrl}
              title={product.name || ""}
              text="El Menu."
            />
          </div>
        </div>

        {/* Botón fijo al fondo, estilo “Add 1 to cart • $18.00” */}
        <div className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">
          <AddToBasketButtonNew product={product as any} disabled={isOutOfStock} />
        </div>

        <div className="px-4 py-6">
          <LazyRelatedProducts
            productSlug={product.slug?.current || slug}
            productCategories={productCategories}
          />
        </div>
      </div>
    </div>
  );
}
