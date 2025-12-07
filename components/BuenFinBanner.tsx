import { COUPON_CODES } from "@/sanity/lib/sales/couponCodes";
import { getActiveSaleByCouponCode } from "@/sanity/lib/sales/getActiveSaleByCouponCode";
import Image from "next/image";

async function BuenFinBanner() {
  const sale = await getActiveSaleByCouponCode(COUPON_CODES.TRALALA);

  if (!sale?.isActive) {
    return null;
  }

  return (
    <div
      className="relative overflow-hidden px-6 py-7 mx-4 mt-2 rounded-lg shadow-lg"
      style={{
        background:
          "linear-gradient(120deg, #29B297 1%, #43e97b 100%)",
      }}
    >
      {/* Pattern SVG background with movement */}
      <style>
        {`
          @keyframes movePattern {
            0% {
              transform: translate(0px, 0px) rotate(20deg);
            }
            100% {
              transform: translate(40px, 40px) rotate(20deg);
            }
          }
          .buenfin-animated-pattern {
            animation: movePattern 12s linear infinite;
          }
        `}
      </style>
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
        focusable="false"
        style={{ zIndex: 0 }}
      >
        <defs>
          <pattern
            id="buenfinPattern"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(20)"
          >
            <circle cx="20" cy="20" r="2.5" fill="#ffffff55" />
            <rect x="0" y="0" width="80" height="80" fill="none" />
          </pattern>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="url(#buenfinPattern)"
          className="buenfin-animated-pattern"
        />
      </svg>
      <div className="container mx-auto flex items-center justify-between relative z-10">
        <div className="flex-1">
          <div className="flex items-center mb-4 gap-3">
            
            <h2 className="text-3xl sm:text-5xl font-extrabold text-left">
              {sale.title}
            </h2>

            <div className="ml-auto flex-shrink-0">
              <Image
                src="/gif.gif"
                alt="gif"
                width={96}
                height={96}
                className="w-16 h-16 sm:w-24 sm:h-24 object-contain"
                style={{ display: "block" }}
              />
            </div>

          </div>
          <p className="text-left text-sm sm:text-3xl font-semibold mb-6">
            {sale.description}
          </p>
          <div className="flex">
            <div className="bg-white text-black py-4 px-6 rounded-full shadow-md transform hover:scale-105 transition duration-300">
              <span className="font-bold text-base sm:text-xl">
                Codigo de descuento:{" "}
                <span className="text-[#0F3F36]">{sale.couponCode}</span>
              </span>
              <span className="ml-2 font-bold text-base sm:text-xl">
                {sale.discountAmount}% OFF
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuenFinBanner;
