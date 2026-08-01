"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

function SlideContent({ banner, priority }: { banner: PromoBannerItem; priority: boolean }) {
  const desktopImageUrl = useMemo(() => buildImageUrl(banner.desktopImage, 1600, 560), [banner.desktopImage]);
  const mobileImageUrl = useMemo(
    () => buildImageUrl(banner.mobileImage ?? banner.desktopImage, 900, 850),
    [banner.desktopImage, banner.mobileImage]
  );
  const buttonText = banner.ctaText?.trim();
  const buttonLink = banner.ctaLink?.trim();
  const title = banner.title?.trim() || "Promocion disponible";
  const description = banner.description?.trim();
  const mainColor = banner.mainColor?.trim() || DEFAULT_MAIN_COLOR;
  const contentOverlayStyle = getContentOverlayStyle(mainColor);

  const body = (
    <article className="relative isolate h-[150px] w-full max-w-full min-w-0 overflow-hidden bg-[#09193B] shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:h-[205px] lg:h-[235px]">
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

      <div className="absolute inset-y-0 left-0 z-0 w-[78%] sm:w-[60%] lg:w-1/2" style={contentOverlayStyle} />

      <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-col gap-2 p-3 sm:gap-4 sm:p-5 lg:p-6" style={{ color: mainColor }}>
        <div className="flex min-h-0 min-w-0 flex-1 items-start">
          <div className="min-w-0 max-w-[76%] space-y-1 overflow-hidden [text-shadow:0_1px_8px_rgba(0,0,0,0.28)] sm:max-w-[75%] sm:space-y-2.5 lg:max-w-[72%]">
            <h2 className="break-words text-[1.15rem] font-black leading-[1.05] sm:line-clamp-2 sm:text-[2rem] md:text-[2.35rem]">
              {title}
            </h2>
            {description ? (
              <p className="max-w-full break-words text-[0.78rem] leading-[1.25] opacity-95 sm:line-clamp-3 sm:text-[1.02rem] sm:leading-[1.35] md:text-[1.08rem]">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            {buttonText && buttonLink ? (
              <span
                className="inline-flex w-fit rounded-full border border-white/35 bg-white/14 px-3 py-1.5 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_20px_rgba(0,0,0,0.12)] backdrop-blur-md transition-transform duration-200 hover:scale-[1.02] sm:px-4.5 sm:py-2 sm:text-sm"
                style={{ color: "#ffffff" }}
              >
                {buttonText}
              </span>
            ) : null}
          </div>
          {banner.sale?.couponCode ? (
            <span className="max-w-[52vw] truncate rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-[#09193B] shadow-sm ring-1 ring-white/30 backdrop-blur-md sm:px-3.5 sm:py-2 sm:text-sm">
              Codigo: {banner.sale.couponCode}
            </span>
          ) : null}
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
  const pointerStartX = useRef<number | null>(null);
  const swiped = useRef(false);

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

  return (
    <section className="w-full max-w-full overflow-x-clip px-0 sm:px-2 lg:px-4">
      <div className="w-full min-w-0 overflow-hidden">
        <div className="relative w-full max-w-full min-w-0 overflow-hidden">
          <div
            className="flex touch-pan-y transition-transform duration-700 ease-in-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            onPointerDown={(event) => {
              pointerStartX.current = event.clientX;
              swiped.current = false;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              if (pointerStartX.current === null) return;

              const distance = pointerStartX.current - event.clientX;
              pointerStartX.current = null;
              if (Math.abs(distance) < 40) return;

              swiped.current = true;
              setCurrentIndex((index) =>
                distance > 0
                  ? (index + 1) % banners.length
                  : (index - 1 + banners.length) % banners.length
              );
            }}
            onPointerCancel={() => {
              pointerStartX.current = null;
            }}
            onClickCapture={(event) => {
              if (!swiped.current) return;
              event.preventDefault();
              swiped.current = false;
            }}
          >
            {banners.map((banner, index) => (
              <div key={banner._id} className="w-full shrink-0">
                <SlideContent banner={banner} priority={index === 0} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
