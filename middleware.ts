import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSafeDeploymentConfiguration } from "@/lib/deployment-environment";
import { buildUrl } from "@/lib/urls";

assertSafeDeploymentConfiguration();

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { userId } = await auth();
  const pathname = req.nextUrl.pathname;

  // ── Drive subdomain → rewrite to /drive ──────────────────────────
  // Browser stays at / (no redirect). Next.js internally resolves /drive.
  // Covers: drive.localhost (dev), drive.elmenu.site (prod)
  // NOTE: req.nextUrl.hostname returns the connection hostname (127.0.0.1),
  // not the Host header. We must use the Host header directly.
  const hostHeader = req.headers.get("host") ?? "";
  const requestHostname = hostHeader.split(":")[0];
  if (
    requestHostname.startsWith("drive.") &&
    pathname === "/" &&
    !pathname.startsWith("/api/")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/drive";
    return NextResponse.rewrite(url);
  }

  if (pathname === "/super" || pathname === "/super/") {
    return NextResponse.redirect(new URL("/abarrotes-pilot", req.url));
  }

  if (pathname.startsWith("/dashboard") && !pathname.startsWith("/api/")) {
    if (!userId) {
      return NextResponse.redirect(buildUrl("/"));
    }
  }

  const userAgent = req.headers.get("user-agent") || "";
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

  const response = NextResponse.next();

  if (isMobile) {
    response.headers.set("X-Mobile-Device", "true");
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "origin-when-cross-origin");

  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
