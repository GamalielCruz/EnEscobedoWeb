import "server-only";

import { defineLive } from "next-sanity";
import { client } from "@/sanity/lib/client";

const token = process.env.SANITY_API_READ_TOKEN;
if (!token) {
  throw new Error("Missing SANITY_API_READ_TOKEN");
}

export const { sanityFetch, SanityLive } = defineLive({
  client,
  serverToken: token,
  // No exponer token en el navegador en producción
  browserToken: process.env.NODE_ENV === 'production' ? undefined : token,
  fetchOptions: { 
    revalidate: process.env.NODE_ENV === 'production' ? 60 : 0,
  },
});