import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StorePage, {
  generateMetadata as generateStoreMetadata,
} from "../store/[id]/page";
import { getStoreBySlug } from "@/sanity/lib/products/getStoreBySlug";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ product?: string }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  return generateStoreMetadata({
    params: Promise.resolve({ id: store._id }),
    searchParams,
  });
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
