import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const protectedPaths = ['/channel', '/chromecast', '/hospitality', '/dashboard'];
const authPaths = ['/login', '/register'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Skip middleware untuk API routes dan public assets
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname === '/'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;

  // Redirect ke login jika mengakses protected path tanpa token
  if (protectedPaths.some(path => pathname.startsWith(path))) {
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      // Tambahkan redirect parameter untuk kembali ke halaman yang diminta
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    try {
      // Tambahkan timeout untuk JWT verification
      const verifyPromise = jwtVerify(token, JWT_SECRET);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('JWT verification timeout')), 3000)
      );

      await Promise.race([verifyPromise, timeoutPromise]);
      const response = NextResponse.next();
      response.headers.set('Vary', 'Cookie');
      return response;
    } catch (error) {
      console.error('Token verification failed:', error);
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('token');
      response.headers.set('Vary', 'Cookie');
      return response;
    }
  }

  // Redirect ke dashboard jika sudah login dan mengakses auth pages
  if (authPaths.some(path => pathname === path)) {
    if (token) {
      try {
        // Tambahkan timeout untuk JWT verification
        const verifyPromise = jwtVerify(token, JWT_SECRET);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('JWT verification timeout')), 3000)
        );

        await Promise.race([verifyPromise, timeoutPromise]);

        // Cek apakah ada redirect parameter
        const redirectUrl = request.nextUrl.searchParams.get('redirect');
        if (redirectUrl && protectedPaths.some(path => redirectUrl.startsWith(path))) {
          const response = NextResponse.redirect(new URL(redirectUrl, request.url));
          response.headers.set('Vary', 'Cookie');
          return response;
        }

        const response = NextResponse.redirect(new URL('/dashboard', request.url));
        response.headers.set('Vary', 'Cookie');
        return response;
      } catch (error) {
        console.error('Token invalid for auth page:', error);
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