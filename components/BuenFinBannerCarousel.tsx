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

function BannerMeta({ banner }: { banner: PromoBannerItem }) {
  const storeImageUrl = useMemo(
    () => buildImageUrl(banner.affiliateStore?.image ?? null, 96, 96),
    [banner.affiliateStore?.image]
  );
  const storeName = banner.affiliateStore?.name?.trim();

  if (!storeName) return null;

  return (
    <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-3 py-2 backdrop-blur-sm ring-1 ring-white/10">
      <div className="h-9 w-9 overflow-hidden rounded-full bg-white/15 ring-1 ring-white/15">
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
      <span className="text-sm font-semibold text-white">{storeName}</span>
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
    () => buildImageUrl(banner.desktopImage, 1600, 640),
    [banner.desktopImage]
  );
  const mobileImageUrl = useMemo(
    () => buildImageUrl(banner.mobileImage ?? banner.desktopImage, 900, 1200),
    [banner.desktopImage, banner.mobileImage]
  );
  const hasSale = Boolean(banner.sale?.discountAmount || banner.sale?.couponCode);
  const buttonText = banner.ctaText?.trim();
  const buttonLink = banner.ctaLink?.trim();
  const title = banner.title?.trim() || "Promoción disponible";
  const description = banner.description?.trim();
  const productName = banner.product?.name?.trim();

  const body = (
    <article className="relative isolate aspect-[16/6] min-h-[320px] overflow-hidden rounded-2xl bg-[#140b12] shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:aspect-[16/5] sm:min-h-[360px]">
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

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,8,12,0.78)_0%,rgba(10,8,12,0.5)_55%,rgba(10,8,12,0.28)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_45%)]" />

      <div className="relative z-10 flex h-full flex-col justify-between px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white backdrop-blur-sm ring-1 ring-white/10">
              Promoción
            </span>
            {hasSale ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#850C22] shadow-sm sm:text-xs">
                <TicketPercent className="h-4 w-4" />
                {banner.sale?.discountAmount ? `${banner.sale.discountAmount}% de descuento` : "Cupón disponible"}
              </span>
            ) : null}
          </div>

          <div className="hidden sm:block">
            <BannerMeta banner={banner} />
          </div>
        </div>

        <div className="max-w-3xl space-y-3 sm:space-y-4">
          <div className="space-y-2 sm:space-y-3">
            <h2 className="text-balance text-2xl font-black leading-[1.02] text-white sm:text-4xl lg:text-5xl">
              {title}
            </h2>
            {description ? (
              <p className="max-w-2xl text-pretty text-sm leading-6 text-white/88 sm:text-base lg:text-lg">
                {description}
              </p>
            ) : null}
            {productName ? (
              <p className="max-w-2xl text-sm leading-6 text-white/82 sm:text-base">
                {productName}
              </p>
            ) : null}
          </div>

          {banner.affiliateStore ? (
            <div className="sm:hidden">
              <BannerMeta banner={banner} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {buttonText && buttonLink ? (
              <span className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#850C22] shadow-sm transition-transform duration-200 hover:scale-[1.02]">
                {buttonText}
              </span>
            ) : null}

            {banner.sale?.couponCode ? (
              <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
                Código: {banner.sale.couponCode}
              </span>
            ) : null}
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
              className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur-sm transition hover:bg-black/55 sm:left-4"
              aria-label="Banner anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
              className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur-sm transition hover:bg-black/55 sm:right-4"
              aria-label="Siguiente banner"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/25 px-3 py-2 backdrop-blur-sm">
              {banners.map((banner, index) => (
                <button
                  key={banner._id}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={`h-2.5 rounded-full transition-all ${
                    index === currentIndex ? "w-8 bg-white" : "w-2.5 bg-white/55"
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
