"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TicketPercent } from "lucide-react";
import { urlFor } from "@/sanity/lib/image";
import { PromoBannerItem } from "@/sanity/lib/promotions/getActivePromoBanners";

const DEFAULT_DURATION_SECONDS = 6;

type BuenFinBannerCarouselProps = {
  banners: PromoBannerItem[];
};

function getBannerDurationSeconds(banner: PromoBannerItem) {
  const seconds = banner.displayDurationSeconds ?? DEFAULT_DURATION_SECONDS;
  return seconds >= 2 ? seconds : DEFAULT_DURATION_SECONDS;
}

function buildImageUrl(image: PromoBannerItem["desktopImage"], width: number, height: number) {
  if (!image) return null;
  return urlFor(image).width(width).height(height).fit("crop").url();
}

function isExternalLink(link: string) {
  return /^https?:\/\//i.test(link);
}

function StoreBadge({ banner }: { banner: PromoBannerItem }) {
  const storeName = banner.affiliateStore?.name?.trim();
  const storeImageUrl = useMemo(
    () => buildImageUrl(banner.affiliateStore?.image ?? null, 96, 96),
    [banner.affiliateStore?.image]
  );

  if (!storeName) return null;

  return (
    <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-3 py-2 text-white ring-1 ring-white/10 backdrop-blur-md">
      <div className="h-9 w-9 overflow-hidden rounded-full bg-white/12 ring-1 ring-white/15">
        {storeImageUrl ? (
          <Image
            src={storeImageUrl}
            alt={storeName}
            width={36}
            height={36}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-black text-white">
            {storeName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <span className="truncate text-sm font-semibold sm:text-base">{storeName}</span>
    </div>
  );
}

function ProductCard({ banner, priority }: { banner: PromoBannerItem; priority: boolean }) {
  const productName = banner.product?.name?.trim();
  const productImageUrl = useMemo(
    () =>
      buildImageUrl(
        banner.product?.image ?? banner.desktopImage ?? banner.mobileImage ?? null,
        420,
        420
      ),
    [banner.desktopImage, banner.mobileImage, banner.product?.image]
  );

  return (
    <div className="mx-auto w-[126px] sm:w-[150px] md:w-[170px] lg:w-[210px]">
      <div className="relative overflow-hidden rounded-[1.35rem] border border-white/15 bg-white/10 p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.25)] backdrop-blur-md sm:p-3 lg:p-3.5">
        <div className="relative aspect-square overflow-hidden rounded-[1rem] bg-black/10">
          {productImageUrl ? (
            <Image
              src={productImageUrl}
              alt={productName || "Producto destacado"}
              fill
              priority={priority}
              className="object-cover object-center"
              sizes="(max-width: 1024px) 150px, 210px"
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.28))]" />
          {productName ? (
            <div className="absolute inset-x-2 bottom-2 rounded-full bg-black/35 px-2 py-1 text-center text-[11px] font-semibold text-white backdrop-blur-sm sm:text-xs">
              {productName}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SlideContent({
  banner,
  priority,
}: {
  banner: PromoBannerItem;
  priority: boolean;
}) {
  const desktopImageUrl = useMemo(
    () => buildImageUrl(banner.desktopImage, 1600, 700),
    [banner.desktopImage]
  );
  const mobileImageUrl = useMemo(
    () => buildImageUrl(banner.mobileImage ?? banner.desktopImage, 900, 1200),
    [banner.desktopImage, banner.mobileImage]
  );
  const hasSale = Boolean(banner.sale?.discountAmount || banner.sale?.couponCode);
  const buttonText = banner.ctaText?.trim();
  const buttonLink = banner.ctaLink?.trim();
  const title = banner.title?.trim() || "Promocion disponible";
  const description = banner.description?.trim();

  const body = (
    <article className="relative isolate w-full max-w-full min-w-0 overflow-hidden rounded-2xl bg-[#09193B] shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      {desktopImageUrl ? (
        <>
          <div className="absolute inset-0 hidden md:block">
            <Image
              src={desktopImageUrl}
              alt={title}
              fill
              priority={priority}
              className="object-cover object-center"
              sizes="(max-width: 768px) 100vw, 1200px"
            />
          </div>
          <div className="absolute inset-0 md:hidden">
            <Image
              src={mobileImageUrl || desktopImageUrl}
              alt={title}
              fill
              priority={priority}
              className="object-cover object-center"
              sizes="100vw"
            />
          </div>
        </>
      ) : null}

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,15,32,0.82)_0%,rgba(9,15,32,0.54)_58%,rgba(9,15,32,0.22)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_40%)]" />

      <div className="relative z-10 flex min-h-[210px] flex-col gap-4 p-4 sm:min-h-[240px] sm:p-5 lg:min-h-[280px] lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white backdrop-blur-md ring-1 ring-white/10 sm:text-xs">
              Promocion
            </span>
            {hasSale ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#850C22] shadow-sm sm:text-xs">
                <TicketPercent className="h-4 w-4" />
                {banner.sale?.discountAmount ? `${banner.sale.discountAmount}% de descuento` : "Cupon disponible"}
              </span>
            ) : null}
          </div>

          <div className="hidden md:block">
            <StoreBadge banner={banner} />
          </div>
        </div>

        <div className="grid min-w-0 flex-1 items-center gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(126px,210px)_minmax(0,0.65fr)] lg:gap-5">
          <div className="min-w-0 max-w-[92%] space-y-2 sm:max-w-[72%] sm:space-y-3 lg:max-w-full">
            <h2 className="break-words text-2xl font-black leading-tight text-white sm:text-3xl md:text-4xl">
              {title}
            </h2>
            {description ? (
              <p className="max-w-full break-words text-sm leading-relaxed text-white/85 sm:text-base md:text-lg">
                {description}
              </p>
            ) : null}
          </div>

          {banner.product ? (
            <div className="min-w-0 lg:justify-self-center">
              <ProductCard banner={banner} priority={priority} />
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}

          <div className="hidden lg:block" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {buttonText && buttonLink ? (
              <span className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#850C22] shadow-sm transition-transform duration-200 hover:scale-[1.02]">
                {buttonText}
              </span>
            ) : null}

            {banner.sale?.couponCode ? (
              <span className="rounded-full border border-white/14 bg-white/10 px-4 py-2 text-sm font-semibold text-white/92 backdrop-blur-md">
                Codigo: {banner.sale.couponCode}
              </span>
            ) : null}
          </div>

          <div className="md:hidden">
            <StoreBadge banner={banner} />
          </div>
        </div>
      </div>
    </article>
  );

  if (!buttonText || !buttonLink) return body;

  if (isExternalLink(buttonLink)) {
    return (
      <a href={buttonLink} target="_blank" rel="noreferrer" className="block w-full max-w-full">
        {body}
      </a>
    );
  }

  return (
    <Link href={buttonLink} className="block w-full max-w-full">
      {body}
    </Link>
  );
}

export default function BuenFinBannerCarousel({ banners }: BuenFinBannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;

    const activeBanner = banners[currentIndex];
    const timeout = window.setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, getBannerDurationSeconds(activeBanner) * 1000);

    return () => window.clearTimeout(timeout);
  }, [banners, currentIndex]);

  useEffect(() => {
    if (currentIndex >= banners.length) setCurrentIndex(0);
  }, [banners.length, currentIndex]);

  if (banners.length === 0) return null;

  const currentBanner = banners[currentIndex];

  return (
    <section className="w-full max-w-full overflow-x-clip px-4 pt-2 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl min-w-0 overflow-hidden">
        <div className="relative w-full max-w-full min-w-0 overflow-hidden rounded-2xl">
          <SlideContent banner={currentBanner} priority />

          {banners.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)}
                className="absolute left-2 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/20 text-white/95 ring-1 ring-white/10 backdrop-blur-md transition hover:bg-black/35 sm:left-4 sm:h-10 sm:w-10"
                aria-label="Banner anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
                className="absolute right-2 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/20 text-white/95 ring-1 ring-white/10 backdrop-blur-md transition hover:bg-black/35 sm:right-4 sm:h-10 sm:w-10"
                aria-label="Siguiente banner"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/8 px-3 py-2 backdrop-blur-sm ring-1 ring-white/6 sm:bottom-4">
                {banners.map((banner, index) => (
                  <button
                    key={banner._id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`h-2.5 rounded-full transition-all ${
                      index === currentIndex ? "w-8 bg-white" : "w-2.5 bg-white/42"
                    }`}
                    aria-label={`Ver banner ${index + 1}`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}