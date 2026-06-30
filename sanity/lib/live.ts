import "server-only";

import { client } from "@/sanity/lib/client";

const defaultRevalidate = process.env.NODE_ENV === "production" ? 60 : 0;

export type SanityFetchArgs<TParams extends Record<string, unknown> = Record<string, unknown>> = {
  query: string;
  params?: TParams;
  revalidate?: number;
};

export async function sanityFetch<TData, TParams extends Record<string, unknown> = Record<string, unknown>>({
  query,
  params,
  revalidate = defaultRevalidate,
}: SanityFetchArgs<TParams>): Promise<{ data: TData }> {
  const data = await client.fetch<TData>(query, params ?? ({} as TParams), {
    next: { revalidate },
  });

  return { data };
}

export function SanityLive() {
  // ponytail: live preview is off until we actually need draft editing here.
  return null;
}