import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StorePage from "../store/[id]/page";
import { getStoreBySlug } from "@/sanity/lib/products/getStoreBySlug";
import { sanitizeText } from "@/lib/utils";
import { buildUrl } from "@/lib/urls";
import { getStorePath } from "@/lib/store-url";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ product?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params;
    const store = await getStoreBySlug(slug);
    if (!store) return { title: "Tienda | ElMenu" };
    const storeName = sanitizeText(store.name) || "Tienda";
    const storeUrl = buildUrl(getStorePath(store));
    return {
      title: `${storeName} | ElMenu`,
      description: `Consulta el menú y pide en ${storeName}.`,
      alternates: { canonical: storeUrl },
    };
  } catch {
    return { title: "Tienda | ElMenu" };
  }
}

export default async function RestaurantPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  return StorePage({
    params: Promise.resolve({ id: store._id }),
    searchParams,
  });
}
