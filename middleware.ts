import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default clerkMiddleware((auth, req: NextRequest) => {
  // Detectar dispositivos móviles
  const userAgent = req.headers.get('user-agent') || '';
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  
  // Agregar headers específicos para móviles
  const response = NextResponse.next();
  
  if (isMobile) {
    // Headers optimizados para móviles
    response.headers.set('X-Mobile-Device', 'true');
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  }
  
  // Headers de seguridad y rendimiento
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin');
  
  return response;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};