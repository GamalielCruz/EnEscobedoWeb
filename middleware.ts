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
  // Covers: drive.localhost (dev), drive.elmenu.site (prod),
  //         drive.staging.elmenu.site (preview).
  // NOTE: en Vercel el hostname público puede llegar en `host` o en
  // `x-forwarded-host` según el tipo de dominio (custom domain, preview,
  // dominio de rama). No asumimos cuál: revisamos todos los candidatos y,
  // como escape hatch, permitimos hosts explícitos por env var.
  const configuredDriveHosts = (process.env.NEXT_PUBLIC_DRIVE_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const candidateHosts = [
    req.headers.get("host"),
    req.headers.get("x-forwarded-host"),
    req.nextUrl.hostname,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.split(":")[0].toLowerCase());

  const isDriveHost =
    candidateHosts.some((host) => host.startsWith("drive.")) ||
    candidateHosts.some((host) => configuredDriveHosts.includes(host));

  if (isDriveHost && pathname === "/") {
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
