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
    <div className="flex items-center gap-3 rounded-full bg-white/8 px-3 py-2 ring-1 ring-white/10 backdrop-blur-md">
      <div className="h-10 w-10 overflow-hidden rounded-full bg-white/12 ring-1 ring-white/15">
        {storeImageUrl ? (
          <Image
            src={storeImageUrl}
            alt={storeName}
            width={40}
            height={40}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-black text-white">
            {storeName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <span className="text-sm font-semibold text-white sm:text-base">{storeName}</span>
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
  const title = banner.title?.trim() || "Promoci\u00f3n disponible";
  const description = banner.description?.trim();
  const productName = banner.product?.name?.trim();

  const body = (
    <article className="relative isolate aspect-[16/4.8] min-h-[250px] overflow-hidden rounded-2xl bg-[#140b12] shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:aspect-[16/4.4] sm:min-h-[280px] lg:aspect-[16/4.1]">
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

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,8,12,0.72)_0%,rgba(12,8,12,0.44)_55%,rgba(12,8,12,0.18)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_42%)]" />

      <div className="relative z-10 grid h-full grid-rows-[auto_1fr_auto] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white backdrop-blur-md ring-1 ring-white/10 sm:text-xs">
              Promoción
            </span>
            {hasSale ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/92 px-3 py-1 text-[11px] font-bold text-[#850C22] shadow-sm sm:text-xs">
                <TicketPercent className="h-4 w-4" />
                {banner.sale?.discountAmount ? `${banner.sale.discountAmount}% de descuento` : "Cupón disponible"}
              </span>
            ) : null}
          </div>

          <div className="hidden md:block">
            <StoreBadge banner={banner} />
          </div>
        </div>

        <div className="relative flex items-center justify-center py-1 sm:py-2">
          <div className="grid w-full max-w-5xl items-center gap-3 lg:grid-cols-[1.05fr_0.95fr] lg:gap-5">
            <div className="space-y-2 sm:space-y-3 lg:max-w-3xl">
              <h2 className="text-balance text-2xl font-black leading-[0.98] text-white sm:text-4xl lg:text-5xl">
                {title}
              </h2>
              {description ? (
                <p className="max-w-2xl text-pretty text-sm leading-5 text-white/88 sm:text-base lg:text-lg">
                  {description}
                </p>
              ) : null}
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="relative w-full max-w-[180px] sm:max-w-[220px] lg:max-w-[250px]">
                <div className="absolute inset-x-6 -bottom-2 h-6 rounded-full bg-black/25 blur-2xl" />
                <div className="relative overflow-hidden rounded-[1.4rem] border border-white/16 bg-white/10 p-2.5 shadow-2xl backdrop-blur-md sm:p-3 lg:p-4">
                  <div className="relative aspect-square overflow-hidden rounded-[1.05rem] bg-black/12">
                    <Image
                      src={desktopImageUrl || mobileImageUrl || "/favicon.ico"}
                      alt={productName || title}
                      fill
                      priority={priority}
                      className="object-cover object-center"
                      sizes="(max-width: 1024px) 220px, 280px"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.22))]" />
                  </div>
                  {productName ? (
                    <div className="mt-3 text-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/72">Producto destacado</p>
                      <p className="mt-1 text-sm font-bold text-white sm:text-base">{productName}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
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
                Código: {banner.sale.couponCode}
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
      <a href={buttonLink} target="_blank" rel="noreferrer" className="block">
        {body}
      </a>
    );
  }

  return (
    <Link href={buttonLink} className="block">
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
    <section className="mx-4 mt-2 sm:mx-6 lg:mx-8">
      <div className="relative mx-auto max-w-7xl">
        <SlideContent banner={currentBanner} priority />

        {banners.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)}
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/22 p-2 text-white/95 backdrop-blur-md transition hover:bg-black/38 sm:left-4"
              aria-label="Banner anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/22 p-2 text-white/95 backdrop-blur-md transition hover:bg-black/38 sm:right-4"
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
    </section>
  );
}

