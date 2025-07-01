import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode('Pec@tu2024++');

const protectedPaths = ['/channel', '/chromecast', '/hospitality'];
const authPaths = ['/login', '/register'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Skip middleware untuk API routes dan public assets
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;

  // Redirect ke login jika mengakses protected path tanpa token
  if (protectedPaths.some(path => pathname.startsWith(path))) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      await jwtVerify(token, JWT_SECRET);
      return NextResponse.next();
    } catch (error) {
      // Token invalid, redirect ke login
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('token');
      return response;
    }
  }

  // Redirect ke dashboard jika sudah login dan mengakses auth pages
  if (authPaths.some(path => pathname.startsWith(path))) {
    if (token) {
      try {
        await jwtVerify(token, JWT_SECRET);
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } catch (error) {
        // Token invalid, lanjutkan ke auth page
        const response = NextResponse.next();
        response.cookies.delete('token');
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};