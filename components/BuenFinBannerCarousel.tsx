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
  if (!image) {
    return null;
  }

  return urlFor(image).width(width).height(height).fit("crop").url();
}

function isExternalLink(link: string) {
  return /^https?:\/\//i.test(link);
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

  const body = (
    <article className="relative min-h-[220px] overflow-hidden rounded-xl bg-gradient-to-r from-[#850C22] via-[#EB1902] to-[#9943ED] shadow-lg">
      {desktopImageUrl ? (
        <>
          <div className="absolute inset-0 hidden md:block">
            <Image
              src={desktopImageUrl}
              alt={banner.title || "Banner promocional"}
              fill
              priority={priority}
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 1200px"
            />
          </div>
          <div className="absolute inset-0 md:hidden">
            <Image
              src={mobileImageUrl || desktopImageUrl}
              alt={banner.title || "Banner promocional"}
              fill
              priority={priority}
              className="object-cover"
              sizes="100vw"
            />
          </div>
        </>
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-black/30" />

      <div className="relative z-10 flex min-h-[220px] flex-col justify-between gap-4 px-6 py-6 md:min-h-[280px] md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-sm">
            Promocion
          </span>
          {hasSale ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#850C22]">
              <TicketPercent className="h-4 w-4" />
              {banner.sale?.discountAmount ? `${banner.sale.discountAmount}% de descuento` : "Cupon disponible"}
            </span>
          ) : null}
        </div>

        <div className="max-w-3xl">
          <h2 className="text-2xl font-black leading-tight text-white md:text-4xl">
            {banner.title}
          </h2>
          {banner.description ? (
            <p className="mt-3 max-w-2xl text-sm font-medium text-white/90 md:text-base">
              {banner.description}
            </p>
          ) : null}
          {banner.sale?.couponCode ? (
            <p className="mt-4 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
              Usa el cupon: {banner.sale.couponCode}
            </p>
          ) : null}
        </div>

        {buttonText && buttonLink ? (
          <div>
            <span className="inline-flex rounded-full bg-white px-5 py-2 text-sm font-bold text-[#850C22] shadow-sm transition-transform duration-200 hover:scale-[1.02]">
              {buttonText}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );

  if (!buttonText || !buttonLink) {
    return body;
  }

  if (isExternalLink(buttonLink)) {
    return (
      <a
        href={buttonLink}
        target="_blank"
        rel="noreferrer"
        className="block"
      >
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

export default function BuenFinBannerCarousel({
  banners,
}: BuenFinBannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) {
      return;
    }

    const activeBanner = banners[currentIndex];
    const timeout = window.setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, getBannerDurationSeconds(activeBanner) * 1000);

    return () => window.clearTimeout(timeout);
  }, [banners, currentIndex]);

  useEffect(() => {
    if (currentIndex >= banners.length) {
      setCurrentIndex(0);
    }
  }, [banners.length, currentIndex]);

  if (banners.length === 0) {
    return null;
  }

  const currentBanner = banners[currentIndex];

  return (
    <section className="mx-4 mt-2">
      <div className="relative">
        <SlideContent banner={currentBanner} priority />

        {banners.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() =>
                setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)
              }
              className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur-sm transition hover:bg-black/55"
              aria-label="Banner anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
              className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur-sm transition hover:bg-black/55"
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
