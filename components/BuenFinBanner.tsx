import { COUPON_CODES } from "@/sanity/lib/sales/couponCodes";
import { getActiveSaleByCouponCode } from "@/sanity/lib/sales/getActiveSaleByCouponCode";

async function BuenFinBanner() {
  const sale = await getActiveSaleByCouponCode(COUPON_CODES.BUENFIN);

  console.log("BuenFinBanner - Sale found:", sale);

  // Forzar visualización del banner para el Buen Fin si no hay una oferta activa en Sanity
  const effectiveSale = sale || {
    _id: "buen-fin-2024",
    title: "MENUFY",
    description: "Tu menú digital comunitario",
    discountAmount: 20,
    couponCode: "BUENFIN",
    isActive: true,
  };

  if (!effectiveSale.isActive) {
    console.log("BuenFinBanner - Sale is not active, returning null.");
    return null;
  }

  const { title, description, discountAmount, couponCode } = effectiveSale;

  return (
    <div
      className="relative overflow-hidden px-4 py-3 mx-4 mt-2 rounded-lg shadow-md"
      style={{
        background:
          "linear-gradient(120deg, #EB1901 1%, #EB1901 100%)",
      }}
    >
      
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
        focusable="false"
        style={{ zIndex: 0 }}
      >
       
        
      </svg>
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between relative z-10 gap-4">
        <div className="flex-1 text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
            {title}
          </h2>
          <p className="text-xs sm:text-base font-medium text-white/90">
            {description}
          </p>
        </div>
        
        
      </div>
    </div>
  );
}

export default BuenFinBanner;
