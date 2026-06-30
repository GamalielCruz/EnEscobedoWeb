import "server-only";

import { client } from "@/sanity/lib/client";

const defaultRevalidate = process.env.NODE_ENV === "production" ? 60 : 0;

export type SanityFetchArgs<
  TQuery extends string,
  TParams extends Record<string, unknown> = Record<string, unknown>,
> = {
  query: TQuery;
  params?: TParams;
  revalidate?: number;
};

export async function sanityFetch<
  TQuery extends string,
  TParams extends Record<string, unknown> = Record<string, unknown>,
>({
  query,
  params,
  revalidate = defaultRevalidate,
}: SanityFetchArgs<TQuery, TParams>) {
  const data = await client.fetch(query, (params ?? {}) as never, {
    next: { revalidate },
  });

  return { data };
}

export function SanityLive() {
  // ponytail: live preview is off until we actually need draft editing here.
  return null;
}

