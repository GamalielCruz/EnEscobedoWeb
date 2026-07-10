"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TicketPercent } from "lucide-react";
import { urlFor } from "@/sanity/lib/image";
import { PromoBannerItem } from "@/sanity/lib/promotions/getActivePromoBanners";

const DEFAULT_DURATION_SECONDS = 6;
const DEFAULT_MAIN_COLOR = "#09193B";

type BuenFinBannerCarouselProps = {
  banners: PromoBannerItem[];
};

function getBannerDurationSeconds(banner: PromoBannerItem) {
  const seconds = banner.displayDurationSeconds ?? DEFAULT_DURATION_SECONDS;
  return seconds >= 2 ? seconds : DEFAULT_DURATION_SECONDS;
}

function getBannerTypeLabel(type?: PromoBannerItem["bannerType"]) {
  switch (type) {
    case "announcement":
      return "Anuncio";
    case "info":
      return "Informacion";
    case "featured":
      return "Destacado";
    case "warning":
      return "Aviso";
    case "event":
      return "Evento";
    default:
      return "Promocion";
  }
}

function buildImageUrl(image: PromoBannerItem["desktopImage"], width: number, height: number) {
  if (!image) return null;
  return urlFor(image).width(width).height(height).fit("crop").url();
}

function isExternalLink(link: string) {
  return /^https?:\/\//i.test(link);
}

function getContentOverlayStyle(mainColor: string) {
  const isLightText = mainColor.toLowerCase() === "#ffffff";

  return {
    background: isLightText
      ? "linear-gradient(90deg, rgba(7, 15, 28, 0.58) 0%, rgba(7, 15, 28, 0.42) 45%, rgba(7, 15, 28, 0.12) 78%, rgba(7, 15, 28, 0) 100%)"
      : "linear-gradient(90deg, rgba(255, 255, 255, 0.62) 0%, rgba(255, 255, 255, 0.46) 45%, rgba(255, 255, 255, 0.14) 78%, rgba(255, 255, 255, 0) 100%)",
  } as const;
}

function StoreBadge({ banner }: { banner: PromoBannerItem }) {
  const storeName = banner.affiliateStore?.name?.trim();
  const storeImageUrl = useMemo(
    () => buildImageUrl(banner.affiliateStore?.image ?? null, 96, 96),
    [banner.affiliateStore?.image]
  );

  if (!storeName) return null;

  return (
    <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-3 py-2 ring-1 ring-white/10 backdrop-blur-md">
      <div className="h-9 w-9 overflow-hidden rounded-full bg-white/12 ring-1 ring-white/15">
        {storeImageUrl ? (
          <Image src={storeImageUrl} alt={storeName} width={36} height={36} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-black">
            {storeName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <span className="truncate text-sm font-semibold sm:text-base">{storeName}</span>
    </div>
  );
}

function SlideContent({ banner, priority }: { banner: PromoBannerItem; priority: boolean }) {
  const desktopImageUrl = useMemo(() => buildImageUrl(banner.desktopImage, 1600, 700), [banner.desktopImage]);
  const mobileImageUrl = useMemo(
    () => buildImageUrl(banner.mobileImage ?? banner.desktopImage, 900, 1200),
    [banner.desktopImage, banner.mobileImage]
  );
  const hasSale = Boolean(banner.sale?.discountAmount || banner.sale?.couponCode);
  const buttonText = banner.ctaText?.trim();
  const buttonLink = banner.ctaLink?.trim();
  const title = banner.title?.trim() || "Promocion disponible";
  const description = banner.description?.trim();
  const mainColor = banner.mainColor?.trim() || DEFAULT_MAIN_COLOR;
  const buttonTextColor = mainColor.toLowerCase() === "#ffffff" ? "#111827" : mainColor;
  const bannerTypeLabel = getBannerTypeLabel(banner.bannerType);
  const contentOverlayStyle = getContentOverlayStyle(mainColor);

  const body = (
    <article className="relative isolate h-[220px] w-full max-w-full min-w-0 overflow-hidden bg-[#09193B] shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:h-[250px] lg:h-[290px]">
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

      <div className="absolute inset-y-0 left-0 z-0 w-[58%] sm:w-[54%] lg:w-1/2" style={contentOverlayStyle} />

      <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-col gap-2.5 p-4 sm:gap-4 sm:p-5 lg:p-6" style={{ color: mainColor }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-sm ring-1 ring-white/10 sm:px-3 sm:text-[11px]">
              {bannerTypeLabel}
            </span>
            {hasSale ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-bold text-[#850C22] shadow-sm sm:px-3 sm:text-[11px]">
                <TicketPercent className="h-3.5 w-3.5" />
                {banner.sale?.discountAmount ? `${banner.sale.discountAmount}% de descuento` : "Cupon disponible"}
              </span>
            ) : null}
          </div>

          <div className="hidden md:block">
            <StoreBadge banner={banner} />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 min-w-0 items-center">
          <div className="min-w-0 max-w-[88%] space-y-1.5 overflow-hidden sm:max-w-[75%] sm:space-y-2.5 lg:max-w-[72%]">
            <h2 className="break-words text-[1.4rem] font-black leading-[1] sm:line-clamp-2 sm:text-[2rem] md:text-[2.35rem]">
              {title}
            </h2>
            {description ? (
              <p className="line-clamp-2 max-w-full break-words text-[0.9rem] leading-[1.35] opacity-95 sm:line-clamp-3 sm:text-[1.02rem] md:text-[1.08rem]">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {buttonText && buttonLink ? (
                <span
                  className="inline-flex rounded-full border border-white/35 bg-white/14 px-4 py-2 text-sm font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_20px_rgba(0,0,0,0.12)] backdrop-blur-md transition-transform duration-200 hover:scale-[1.02] sm:px-4.5"
                  style={{ color: buttonTextColor }}
                >
                  {buttonText}
                </span>
              ) : null}

              {banner.sale?.couponCode ? (
                <span className="max-w-[76vw] truncate rounded-full border border-white/25 bg-white/10 px-3.5 py-2 text-sm font-semibold backdrop-blur-md">
                  Codigo: {banner.sale.couponCode}
                </span>
              ) : null}
            </div>

            <div className="md:hidden">
              <StoreBadge banner={banner} />
            </div>
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
    <section className="w-full max-w-full overflow-x-clip px-0 pt-2 sm:px-2 lg:px-4">
      <div className="w-full min-w-0 overflow-hidden">
        <div className="relative w-full max-w-full min-w-0 overflow-hidden">
          <SlideContent banner={currentBanner} priority />
        </div>
      </div>
    </section>
  );
}
