import BuenFinBannerCarousel from "@/components/BuenFinBannerCarousel";
import { getActivePromoBanners } from "@/sanity/lib/promotions/getActivePromoBanners";

async function BuenFinBanner() {
  const banners = await getActivePromoBanners();

  if (banners.length === 0) {
    return null;
  }

  return <BuenFinBannerCarousel banners={banners} />;
}

export default BuenFinBanner;
